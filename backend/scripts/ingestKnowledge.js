/**
 * scripts/ingestKnowledge.js
 *
 * Ingests all service JSON files into:
 *
 * PostgreSQL:
 *   KnowledgeSource
 *      └── KnowledgeChunk
 *
 * Qdrant:
 *   embeddings + retrieval metadata
 *
 * Usage:
 *   npm run ingest
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/db.js';
import { buildChunks } from '../src/modules/ai/chunkBuilder.js';
const SERVICES_DIR = path.resolve(process.cwd(), 'data/services');
const COLLECTION_NAME =
  env.QDRANT_COLLECTION || 'citizen_service_chunks';
const EMBEDDING_MODEL =
  env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;
const MAX_RETRIES = 3;
const UPSERT_BATCH = 100;
// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Create a deterministic UUID from a string.
 * Same input => same UUID every time.
 */
function stableUuid(value) {
  const bytes = crypto
    .createHash('sha256')
    .update(value, 'utf8')
    .digest()
    .subarray(0, 16);
  // UUID v4-compatible bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-');
}
/**
 * Qdrant integer point ID.
 */
function stablePointId(sourceRef) {
  const hash = crypto
    .createHash('sha256')
    .update(sourceRef, 'utf8')
    .digest();
  const high = hash.readUInt32BE(0);
  const low = hash.readUInt16BE(4);
  return (
    (high * 65536 + low) %
    Number.MAX_SAFE_INTEGER
  );
}
// -----------------------------------------------------------------------------
// Gemini embedding
// -----------------------------------------------------------------------------
async function embedBatch(aiClient, texts) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await aiClient.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts,
        config: {
          taskType: 'RETRIEVAL_DOCUMENT'
        }
      });
      const embeddings = response.embeddings;
      if (
        !embeddings ||
        embeddings.length !== texts.length
      ) {
        throw new Error(
          `Expected ${texts.length} embeddings, got ${embeddings?.length ?? 0
          }`
        );
      }
      return embeddings.map((embedding) => {
        if (
          !embedding?.values ||
          embedding.values.length === 0
        ) {
          throw new Error(
            'Gemini returned an empty embedding'
          );
        }
        return embedding.values;
      });
    } catch (err) {
      const message = err?.message || String(err);
      const retryable =
        err?.status === 429 ||
        err?.status === 503 ||
        message.includes('429') ||
        message.includes('503');
      if (retryable && attempt < MAX_RETRIES) {
        const delay =
          BATCH_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[Ingest] Embedding attempt ${attempt} failed. Retrying in ${delay}ms...`
        );
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Embedding failed unexpectedly');
}
// -----------------------------------------------------------------------------
// PostgreSQL
// -----------------------------------------------------------------------------
async function saveKnowledgeToPostgres(
  fileName,
  chunks
) {
  if (!chunks.length) {
    return null;
  }
  const firstChunk = chunks[0];
  // One KnowledgeSource per JSON document.
  const sourceId = stableUuid(
    `knowledge-source:${fileName}`
  );
  const sourceData = {
    id: sourceId,
    title: firstChunk.title || fileName,
    sourceUrl:
      firstChunk.source_url ||
      'https://edistrict.up.gov.in',
    department:
      firstChunk.department ||
      'Government of Uttar Pradesh',
    sourceType:
      firstChunk.source_type ||
      'GOVERNMENT',
    verified: chunks.every(
      (chunk) => chunk.verified !== false
    )
  };
  await prisma.knowledgeSource.upsert({
    where: {
      id: sourceId
    },
    create: sourceData,
    update: sourceData
  });
  // Rebuild chunks for this source on every ingestion.
  await prisma.knowledgeChunk.deleteMany({
    where: {
      sourceId
    }
  });
  const records = chunks.map(
    (chunk, index) => ({
      id: stableUuid(
        [
          'knowledge-chunk',
          fileName,
          chunk.source_ref || index
        ].join(':')
      ),
      sourceId,
      text: chunk.text,
      pageNumber:
        chunk.pageNumber ??
        chunk.page_number ??
        null,
      section:
        chunk.topic ||
        chunk.section ||
        null,
      language:
        chunk.language ||
        'en',
      region:
        chunk.state ||
        chunk.region ||
        'Uttar Pradesh',
      verified:
        chunk.verified !== false
    })
  );
  await prisma.knowledgeChunk.createMany({
    data: records
  });
  return sourceId;
}
// -----------------------------------------------------------------------------
// Main ingestion
// -----------------------------------------------------------------------------
async function runIngestion() {
  console.log(
    '\n=== RAG KNOWLEDGE INGESTION ===\n'
  );
  // ---------------------------------------------------------------------------
  // 1. Environment
  // ---------------------------------------------------------------------------
  if (!env.GEMINI_API_KEY) {
    console.error(
      '[Ingest] ERROR: GEMINI_API_KEY is not set in .env. Aborting.'
    );
    process.exit(1);
  }
  if (!env.QDRANT_URL) {
    console.error(
      '[Ingest] ERROR: QDRANT_URL is not set. Aborting.'
    );
    process.exit(1);
  }
  // ---------------------------------------------------------------------------
  // 2. Clients
  // ---------------------------------------------------------------------------
  const aiClient = new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY
  });
  const qdrantClient = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY || undefined,
    checkCompatibility: false
  });
  let qdrantHost = env.QDRANT_URL;
  try {
    qdrantHost = new URL(env.QDRANT_URL).host;
  } catch {
    // Keep original value.
  }
  // ---------------------------------------------------------------------------
  // 3. Check Qdrant connectivity
  // ---------------------------------------------------------------------------
  try {
    await qdrantClient.getCollections();
    console.log(
      `[Ingest] Connected to hosted Qdrant cluster at ${qdrantHost}`
    );
  } catch (err) {
    console.error(
      `[Ingest] ERROR: Cannot reach Qdrant at ${qdrantHost}.`
    );
    console.error(
      '[Ingest] Check QDRANT_URL and QDRANT_API_KEY in backend/.env.'
    );
    process.exit(1);
  }
  // ---------------------------------------------------------------------------
  // 4. Read JSON files
  // ---------------------------------------------------------------------------
  if (!fs.existsSync(SERVICES_DIR)) {
    console.error(
      `[Ingest] Services directory not found: ${SERVICES_DIR}`
    );
    process.exit(1);
  }
  const files = fs
    .readdirSync(SERVICES_DIR)
    .filter((file) => file.endsWith('.json'));
  console.log(
    `[Ingest] Found ${files.length} service JSON files\n`
  );
  const allChunks = [];
  const fileSummary = [];
  for (const fileName of files) {
    const filePath = path.join(
      SERVICES_DIR,
      fileName
    );
    let serviceJson;
    try {
      serviceJson = JSON.parse(
        fs.readFileSync(filePath, 'utf8')
      );
    } catch (err) {
      console.error(
        `[Ingest] Failed to parse ${fileName}: ${err.message}`
      );
      process.exit(1);
    }
    // Shared chunk builder.
    const chunks = buildChunks(
      serviceJson,
      fileName
    );
    if (!Array.isArray(chunks)) {
      console.error(
        `[Ingest] buildChunks() did not return an array for ${fileName}`
      );
      process.exit(1);
    }
    // Attach the same deterministic PostgreSQL IDs used by
    // saveKnowledgeToPostgres(), so each Qdrant point can resolve its
    // authoritative text and metadata from PostgreSQL during retrieval.
    const chunksWithDbIds = chunks.map((chunk, chunkIndex) => ({
      ...chunk,
      _knowledgeSourceId: stableUuid(
        `knowledge-source:${fileName}`
      ),
      _knowledgeChunkId: stableUuid(
        [
          'knowledge-chunk',
          fileName,
          chunk.source_ref || chunkIndex
        ].join(':')
      )
    }));
    allChunks.push(...chunksWithDbIds);
    fileSummary.push({
      fileName,
      count: chunks.length
    });
    console.log(
      `  ${fileName.padEnd(42)} ${chunks.length} chunks`
    );
    // -------------------------------------------------------------------------
    // Save metadata + chunks to PostgreSQL
    // -------------------------------------------------------------------------
    try {
      await saveKnowledgeToPostgres(
        fileName,
        chunks
      );
      console.log(
        `    ↳ PostgreSQL saved: ${chunks.length} KnowledgeChunk records`
      );
    } catch (err) {
      console.error(
        `[Ingest] PostgreSQL write failed for ${fileName}: ${err.message}`
      );
      process.exit(1);
    }
  }
  if (allChunks.length === 0) {
    console.error(
      '[Ingest] No chunks were produced. Aborting.'
    );
    process.exit(1);
  }
  console.log(
    `\n[Ingest] Total chunks to embed: ${allChunks.length}`
  );
  // ---------------------------------------------------------------------------
  // 5. Generate embeddings
  // ---------------------------------------------------------------------------
  const vectors = [];
  for (
    let i = 0;
    i < allChunks.length;
    i += BATCH_SIZE
  ) {
    const batch = allChunks.slice(
      i,
      i + BATCH_SIZE
    );
    const texts = batch.map(
      (chunk) => chunk.text
    );
    process.stdout.write(
      `  Embedding chunks ${i + 1}–${Math.min(
        i + BATCH_SIZE,
        allChunks.length
      )} / ${allChunks.length}…\r`
    );
    try {
      const batchVectors = await embedBatch(
        aiClient,
        texts
      );
      vectors.push(...batchVectors);
    } catch (err) {
      console.error(
        `\n[Ingest] Embedding failed at chunk ${i}: ${err.message}`
      );
      process.exit(1);
    }
    if (
      i + BATCH_SIZE <
      allChunks.length
    ) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  console.log('\n');
  // ---------------------------------------------------------------------------
  // 6. Vector dimension
  // ---------------------------------------------------------------------------
  const vectorDim =
    vectors[0]?.length;
  if (!vectorDim) {
    console.error(
      '[Ingest] ERROR: Could not determine vector dimension.'
    );
    process.exit(1);
  }
  console.log(
    `[Ingest] Vector dimension: ${vectorDim}`
  );
  console.log(
    `[Ingest] Collection: ${COLLECTION_NAME}`
  );
  // ---------------------------------------------------------------------------
  // 7. Recreate Qdrant collection
  // ---------------------------------------------------------------------------
  try {
    await qdrantClient
      .deleteCollection(COLLECTION_NAME)
      .catch(() => { });
    await qdrantClient.createCollection(
      COLLECTION_NAME,
      {
        vectors: {
          size: vectorDim,
          distance: 'Cosine'
        }
      }
    );
    // Filtering indexes.
    await qdrantClient.createPayloadIndex(
      COLLECTION_NAME,
      {
        field_name: 'state',
        field_schema: 'keyword'
      }
    );
    await qdrantClient.createPayloadIndex(
      COLLECTION_NAME,
      {
        field_name: 'service_id',
        field_schema: 'keyword'
      }
    );
    await qdrantClient.createPayloadIndex(
      COLLECTION_NAME,
      {
        field_name: 'verified',
        field_schema: 'bool'
      }
    );
    console.log(
      `[Ingest] Collection "${COLLECTION_NAME}" recreated`
    );
  } catch (err) {
    console.error(
      `[Ingest] Failed to create Qdrant collection: ${err.message}`
    );
    process.exit(1);
  }
  // ---------------------------------------------------------------------------
  // 8. Qdrant points
  // ---------------------------------------------------------------------------
  const points = allChunks.map(
    (chunk, index) => ({
      id: stablePointId(
        chunk.source_ref
      ),
      vector: vectors[index],
      payload: {
        // Foreign keys linking this vector to authoritative PostgreSQL rows.
        source_id: chunk._knowledgeSourceId,
        chunk_id: chunk._knowledgeChunkId,
        service_id:
          chunk.service_id || null,
        state:
          chunk.state ||
          chunk.region ||
          'Uttar Pradesh',
        verified:
          chunk.verified !== false,
        source_type:
          chunk.source_type ||
          'official_government_portal',
        language:
          chunk.language ||
          'en',
        topic:
          chunk.topic ||
          chunk.section ||
          'general',
        text:
          chunk.text,
        title:
          chunk.title || '',
        department:
          chunk.department || null,
        source_url:
          chunk.source_url || null,
        source_ref:
          chunk.source_ref
      }
    })
  );
  // ---------------------------------------------------------------------------
  // 9. Upsert to Qdrant
  // ---------------------------------------------------------------------------
  let upserted = 0;
  for (
    let i = 0;
    i < points.length;
    i += UPSERT_BATCH
  ) {
    const batch = points.slice(
      i,
      i + UPSERT_BATCH
    );
    try {
      await qdrantClient.upsert(
        COLLECTION_NAME,
        {
          wait: true,
          points: batch
        }
      );
      upserted += batch.length;
    } catch (err) {
      console.error(
        `[Ingest] Qdrant upsert failed at point ${i}: ${err.message}`
      );
      process.exit(1);
    }
  }
  // ---------------------------------------------------------------------------
  // 10. Summary
  // ---------------------------------------------------------------------------
  console.log(
    '\n=== INGESTION SUMMARY ==='
  );
  console.log(
    `  Files read      : ${files.length}`
  );
  for (const {
    fileName,
    count
  } of fileSummary) {
    console.log(
      `    ${fileName.padEnd(42)} ${count} chunks`
    );
  }
  console.log(
    `  Total chunks    : ${allChunks.length}`
  );
  console.log(
    `  PostgreSQL      : KnowledgeSource + KnowledgeChunk saved`
  );
  console.log(
    `  Points upserted : ${upserted}`
  );
  console.log(
    `  Vector dim      : ${vectorDim}`
  );
  console.log(
    `  Collection      : ${COLLECTION_NAME}`
  );
  console.log(
    '\n[Ingest] Done.\n'
  );
}
// -----------------------------------------------------------------------------
// Execute
// -----------------------------------------------------------------------------
runIngestion()
  .catch((err) => {
    console.error(
      '[Ingest] Unexpected error:',
      err.message
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => { });
  });
