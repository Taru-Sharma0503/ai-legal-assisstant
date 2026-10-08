/**
 * scripts/ingestKnowledge.js
 *
 * Ingests all service JSON files from data/services/ into Qdrant.
 * Usage: npm run ingest
 *
 * Requires:
 *   GEMINI_API_KEY – for embedding
 *   QDRANT_URL     – hosted Qdrant cluster URL
 *   QDRANT_API_KEY – hosted Qdrant cluster API key
 *
 * If Qdrant is not reachable, the script exits with diagnostic error.
 * If embedding fails, the script exits non-zero.
 *
 * Idempotent: recreates the collection on every run, so re-runs never duplicate.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../src/config/env.js';
import { buildChunks } from '../src/modules/ai/chunkBuilder.js';

const SERVICES_DIR = path.resolve(process.cwd(), 'data/services');
const COLLECTION_NAME = env.QDRANT_COLLECTION || 'citizen_service_chunks';
const EMBEDDING_MODEL = env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const BATCH_SIZE = 5;           // texts per embedContent call
const BATCH_DELAY_MS = 500;     // delay between batches
const MAX_RETRIES = 3;

// ── Stable deterministic ID from source_ref ────────────────────────────────
function stableId(sourceRef) {
  // Produce a 53-bit safe integer from SHA-256 of the source_ref string
  const hash = crypto.createHash('sha256').update(sourceRef, 'utf8').digest();
  // Read first 6 bytes as big-endian, mask to 53 bits for JS safety
  const high = hash.readUInt32BE(0);
  const low = hash.readUInt16BE(4);
  return (high * 65536 + low) % Number.MAX_SAFE_INTEGER;
}

// ── Sleep helper ────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Embed a batch of texts (with retry) ────────────────────────────────────
async function embedBatch(aiClient, texts) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await aiClient.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts,
        config: { taskType: 'RETRIEVAL_DOCUMENT' }
      });

      // SDK returns EmbedContentResponse: { embeddings?: ContentEmbedding[] }
      // ContentEmbedding: { values?: number[] }
      const embeddings = res.embeddings;
      if (!embeddings || embeddings.length !== texts.length) {
        throw new Error(
          `Expected ${texts.length} embeddings, got ${embeddings?.length ?? 0}`
        );
      }
      return embeddings.map((e) => e.values);
    } catch (err) {
      const isRetryable =
        err.status === 429 ||
        err.status === 503 ||
        err.message?.includes('429') ||
        err.message?.includes('503');

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = BATCH_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[Ingest] Embedding attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms…`
        );
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

// ── Main ingestion routine ─────────────────────────────────────────────────
async function runIngestion() {
  console.log('\n=== RAG KNOWLEDGE INGESTION ===\n');

  // 1. Validate Gemini key
  if (!env.GEMINI_API_KEY) {
    console.error('[Ingest] ERROR: GEMINI_API_KEY is not set in .env. Aborting.');
    process.exit(1);
  }

  // 2. Validate Qdrant connectivity
  if (!env.QDRANT_URL) {
    console.error('[Ingest] ERROR: QDRANT_URL is not set. Aborting.');
    process.exit(1);
  }

  const qdrantClient = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY || undefined,
    checkCompatibility: false
  });

  let qdrantHost = env.QDRANT_URL;
  try {
    const parsed = new URL(env.QDRANT_URL);
    qdrantHost = parsed.host;
  } catch {
    // keep as is
  }

  try {
    await qdrantClient.getCollections();
    console.log(`[Ingest] Connected to hosted Qdrant cluster at ${qdrantHost}`);
  } catch (err) {
    console.error(
      `[Ingest] ERROR: Cannot reach Qdrant at ${qdrantHost}. Check QDRANT_URL and QDRANT_API_KEY in backend/.env and that your hosted cluster is running.`
    );
    process.exit(1);
  }

  // 3. Load and build chunks from all JSON files
  if (!fs.existsSync(SERVICES_DIR)) {
    console.error(`[Ingest] Services directory not found: ${SERVICES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(SERVICES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`[Ingest] Found ${files.length} service JSON files\n`);

  const allChunks = [];
  const fileSummary = [];

  for (const fileName of files) {
    const filePath = path.join(SERVICES_DIR, fileName);
    let svc;
    try {
      svc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`[Ingest] Failed to parse ${fileName}: ${err.message}`);
      process.exit(1);
    }

    const chunks = buildChunks(svc, fileName);
    allChunks.push(...chunks);
    fileSummary.push({ fileName, count: chunks.length });
    console.log(`  ${fileName.padEnd(42)} ${chunks.length} chunks`);
  }

  console.log(`\n[Ingest] Total chunks to embed: ${allChunks.length}`);

  // 4. Embed all chunks (batched)
  const aiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const vectors = [];

  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.text);
    process.stdout.write(
      `  Embedding chunks ${i + 1}–${Math.min(i + BATCH_SIZE, allChunks.length)} / ${allChunks.length}…\r`
    );

    let batchVectors;
    try {
      batchVectors = await embedBatch(aiClient, texts);
    } catch (err) {
      console.error(`\n[Ingest] Embedding failed at chunk ${i}: ${err.message}`);
      process.exit(1);
    }

    for (const v of batchVectors) {
      if (!v || v.length === 0) {
        console.error('\n[Ingest] ERROR: Received empty vector. Aborting.');
        process.exit(1);
      }
      vectors.push(v);
    }

    if (i + BATCH_SIZE < allChunks.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log('\n');

  // 5. Determine vector dimension from first embedding
  const vectorDim = vectors[0].length;
  console.log(`[Ingest] Vector dimension: ${vectorDim}`);
  console.log(`[Ingest] Collection: ${COLLECTION_NAME}`);

  // 6. Recreate collection (idempotent)
  try {
    await qdrantClient.deleteCollection(COLLECTION_NAME).catch(() => {});
    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        size: vectorDim,
        distance: 'Cosine'
      }
    });
    console.log(`[Ingest] Collection "${COLLECTION_NAME}" recreated`);

    // Create required payload indexes for filtering on hosted Qdrant
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'state',
      field_schema: 'keyword'
    });
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'service_id',
      field_schema: 'keyword'
    });
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'verified',
      field_schema: 'bool'
    });
  } catch (err) {
    console.error(`[Ingest] Failed to create collection: ${err.message}`);
    process.exit(1);
  }

  // 7. Build Qdrant points
  const points = allChunks.map((chunk, idx) => ({
    id: stableId(chunk.source_ref),
    vector: vectors[idx],
    payload: {
      service_id: chunk.service_id,
      state: chunk.state,
      verified: chunk.verified,
      source_type: chunk.source_type,
      language: chunk.language,
      topic: chunk.topic,
      text: chunk.text,
      title: chunk.title || '',
      department: chunk.department || null,
      source_url: chunk.source_url || null,
      source_ref: chunk.source_ref
    }
  }));

  // 8. Upsert in batches of 100
  const UPSERT_BATCH = 100;
  let upserted = 0;

  for (let i = 0; i < points.length; i += UPSERT_BATCH) {
    const batch = points.slice(i, i + UPSERT_BATCH);
    try {
      await qdrantClient.upsert(COLLECTION_NAME, { wait: true, points: batch });
      upserted += batch.length;
    } catch (err) {
      console.error(`[Ingest] Upsert failed at point ${i}: ${err.message}`);
      process.exit(1);
    }
  }

  // 9. Summary
  console.log('\n=== INGESTION SUMMARY ===');
  console.log(`  Files read      : ${files.length}`);
  for (const { fileName, count } of fileSummary) {
    console.log(`    ${fileName.padEnd(42)} ${count} chunks`);
  }
  console.log(`  Total chunks    : ${allChunks.length}`);
  console.log(`  Points upserted : ${upserted}`);
  console.log(`  Vector dim      : ${vectorDim}`);
  console.log(`  Collection      : ${COLLECTION_NAME}`);
  console.log('\n[Ingest] Done.\n');
}

runIngestion().catch((err) => {
  console.error('[Ingest] Unexpected error:', err.message);
  process.exit(1);
});