import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/db.js';
import { buildChunks } from '../src/modules/ai/chunkBuilder.js';
import { stableLegalPointId as pointId, stableLegalSourceRevisionId, stableLegalChunkRevisionId, listLegalPoints, upsertLegalVectorsAndPrunePostgres } from './legalIngestionHelpers.js';

const DIR = path.resolve(process.cwd(), 'data/legal');
const COLLECTION = 'legal_rights_chunks';
async function main() {
  if (!env.GEMINI_API_KEY || !env.QDRANT_URL) throw new Error('GEMINI_API_KEY and QDRANT_URL are required.');
  const documents = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().map((file) => {
    const document = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    if (document.knowledge_domain !== 'legal_rights' || !Array.isArray(document.vector_db_chunks) || !document.vector_db_chunks.length) throw new Error(`Invalid legal knowledge document: ${file}`);
    const chunks = buildChunks(document, file);
    if (!chunks.length || chunks.length !== document.vector_db_chunks.length || chunks.some((c) => !c.id || !c.text || !c.source_url || typeof c.verified !== 'boolean') || chunks.some((c) => c.verified !== chunks[0].verified)) throw new Error(`Invalid chunks or inconsistent verification status: ${file}`);
    const sample = chunks[0];
    const source = { title: sample.title || file, sourceUrl: sample.source_url, department: sample.department || 'Government of India', sourceType: sample.source_type, verified: sample.verified };
    return { file, chunks, source, sourceId: stableLegalSourceRevisionId(file, source) };
  });
  const all = documents.flatMap(({file, chunks, sourceId}) => chunks.map((chunk) => {
    return { ...chunk, file, sourceId, chunkId: stableLegalChunkRevisionId(file, sourceId, chunk) };
  }));
  if (!all.length) throw new Error('No legal chunks found.');

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const vectors = [];
  for (let i = 0; i < all.length; i += 5) {
    const result = await ai.models.embedContent({ model: env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001', contents: all.slice(i, i + 5).map((c) => c.text), config: { taskType: 'RETRIEVAL_DOCUMENT' } });
    if (result.embeddings?.length !== all.slice(i, i + 5).length || result.embeddings.some((e) => !e.values?.length)) throw new Error('Gemini returned incomplete legal embeddings.');
    vectors.push(...result.embeddings.map((e) => e.values));
  }
  const dimension = vectors[0].length;
  if (vectors.some((v) => v.length !== dimension)) throw new Error('Legal embeddings have inconsistent dimensions.');
  const qdrant = new QdrantClient({ url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY || undefined, checkCompatibility: false });
  const existing = await qdrant.getCollections();
  if (existing.collections.some((c) => c.name === COLLECTION)) {
    const info = await qdrant.getCollection(COLLECTION);
    const configured = info.config?.params?.vectors;
    const size = configured?.size ?? configured?.[Object.keys(configured || {})[0]]?.size;
    if (size !== dimension) throw new Error(`Collection ${COLLECTION} has vector size ${size}; expected ${dimension}. It was not modified.`);
  } else {
    await qdrant.createCollection(COLLECTION, { vectors: { size: dimension, distance: 'Cosine' } });
  }
  for (const field_name of ['state', 'verified', 'knowledge_domain']) {
    await qdrant.createPayloadIndex(COLLECTION, { field_name, field_schema: field_name === 'verified' ? 'bool' : 'keyword' }).catch((e) => { if (!/already exists/i.test(e.message)) throw e; });
  }

  const points = all.map((c, i) => ({ id: pointId(`legal:${c.file}:${c.id}`), vector: vectors[i], payload: { source_id: c.sourceId, chunk_id: c.chunkId, source_ref: c.id, state: c.state, verified: c.verified, knowledge_domain: 'legal_rights' } }));
  const previousLegalPoints = await listLegalPoints(qdrant, COLLECTION);
  const currentLinks = new Set(points.map((point) => `${point.payload.source_id}:${point.payload.chunk_id}`));
  const obsoleteChunkRecordMap = new Map(previousLegalPoints
    .map((point) => point.payload)
    .filter((payload) => payload?.source_id && payload?.chunk_id && !currentLinks.has(`${payload.source_id}:${payload.chunk_id}`))
    .map((payload) => [`${payload.source_id}:${payload.chunk_id}`, { id: payload.chunk_id, sourceId: payload.source_id }]));
  const currentSourceIds = new Set(documents.map((document) => document.sourceId));
  const obsoleteSourceIds = [...new Set(previousLegalPoints
    .map((point) => point.payload?.source_id)
    .filter((sourceId) => sourceId && !currentSourceIds.has(sourceId)))];

  for (const {file, chunks, source, sourceId} of documents) {
    await prisma.knowledgeSource.upsert({ where: { id: sourceId }, create: { id: sourceId, ...source }, update: source });
    const rows = chunks.map((c) => ({ id: stableLegalChunkRevisionId(file, sourceId, c), sourceId, text: c.text, section: c.topic, language: c.language || 'en', region: c.state, verified: c.verified }));
    const existingRows = await prisma.knowledgeChunk.findMany({ where: { sourceId }, select: { id: true } });
    const currentChunkIds = new Set(rows.map((row) => row.id));
    for (const row of existingRows.filter((row) => !currentChunkIds.has(row.id))) {
      obsoleteChunkRecordMap.set(`${sourceId}:${row.id}`, { id: row.id, sourceId });
    }
    for (const row of rows) await prisma.knowledgeChunk.upsert({ where: { id: row.id }, create: row, update: row });
  }
  const { obsoletePointIds, deletedChunkCount, retiredSourceCount } = await upsertLegalVectorsAndPrunePostgres({
    qdrant,
    collection: COLLECTION,
    points,
    obsoleteChunkRecords: [...obsoleteChunkRecordMap.values()],
    obsoleteSourceIds,
    knowledgeChunkDb: prisma.knowledgeChunk,
    knowledgeSourceDb: prisma.knowledgeSource
  });
  console.log(`Ingested ${points.length} legal chunks, removed ${obsoletePointIds.length} obsolete legal vectors, pruned ${deletedChunkCount} obsolete PostgreSQL chunks, and retired ${retiredSourceCount} unreferenced sources from ${COLLECTION}.`);
}

main().catch((error) => { console.error(`[Legal ingest] ${error.message}`); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
