import crypto from 'node:crypto';

export function stableLegalUuid(value) {
  const bytes = crypto.createHash('sha256').update(value, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function stableLegalPointId(value) {
  return Number(BigInt(`0x${crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12)}`));
}

export function stableLegalSourceRevisionId(file, source) {
  const revision = {
    version: 2,
    file,
    title: source.title,
    sourceUrl: source.sourceUrl,
    department: source.department,
    sourceType: source.sourceType,
    verified: source.verified
  };
  return stableLegalUuid(`legal-source-revision:v2:${JSON.stringify(revision)}`);
}

// A chunk row is immutable for a given content/provenance revision. The vector
// point ID remains based on source/chunk identity, while its payload links to
// this revision-specific PostgreSQL row after a successful Qdrant upsert.
export function stableLegalChunkRevisionId(file, sourceId, chunk) {
  const revision = {
    version: 2,
    file,
    sourceId,
    chunkIdentity: chunk.id,
    serviceId: chunk.service_id,
    text: chunk.text,
    sourceUrl: chunk.source_url,
    sourceType: chunk.source_type,
    state: chunk.state,
    verified: chunk.verified,
    language: chunk.language,
    topic: chunk.topic,
    title: chunk.title,
    department: chunk.department,
    knowledgeDomain: 'legal_rights'
  };
  return stableLegalUuid(`legal-chunk-revision:v2:${JSON.stringify(revision)}`);
}

// Only scans/deletes points carrying the legal domain marker. Current points
// are upserted first, so this removes stale chunks and vectors for removed files.
export async function deleteObsoleteLegalPoints(qdrant, collection, currentPointIds) {
  const points = await listLegalPoints(qdrant, collection);
  const current = new Set(currentPointIds.map(String));
  const obsolete = points.filter((point) => !current.has(String(point.id))).map((point) => point.id);

  if (obsolete.length) await qdrant.delete(collection, { points: obsolete, wait: true });
  return obsolete;
}

export async function listLegalPoints(qdrant, collection) {
  let offset;
  const points = [];
  do {
    const page = await qdrant.scroll(collection, {
      filter: { must: [{ key: 'knowledge_domain', match: { value: 'legal_rights' } }] },
      limit: 256,
      with_payload: true,
      with_vector: false,
      ...(offset === undefined ? {} : { offset })
    });
    points.push(...(page.points || []));
    offset = page.next_page_offset;
  } while (offset !== null && offset !== undefined);
  return points;
}

// PostgreSQL pruning is deliberately last. A failed upsert, legal-vector scan,
// or Qdrant delete leaves every old PostgreSQL chunk available for hydration.
export async function upsertLegalVectorsAndPrunePostgres({
  qdrant,
  collection,
  points,
  obsoleteChunkRecords,
  obsoleteSourceIds = [],
  knowledgeChunkDb,
  knowledgeSourceDb
}) {
  await qdrant.upsert(collection, { points, wait: true });
  const obsoletePointIds = await deleteObsoleteLegalPoints(
    qdrant,
    collection,
    points.map((point) => point.id)
  );

  const bySource = new Map();
  for (const { id, sourceId } of obsoleteChunkRecords) {
    if (!bySource.has(sourceId)) bySource.set(sourceId, []);
    bySource.get(sourceId).push(id);
  }
  for (const [sourceId, ids] of bySource) {
    await knowledgeChunkDb.deleteMany({ where: { sourceId, id: { in: ids } } });
  }
  let retiredSourceCount = 0;
  if (knowledgeSourceDb && obsoleteSourceIds.length) {
    for (const sourceId of new Set(obsoleteSourceIds)) {
      const result = await knowledgeSourceDb.deleteMany({
        where: { id: sourceId, chunks: { none: {} } }
      });
      retiredSourceCount += result.count;
    }
  }
  return { obsoletePointIds, deletedChunkCount: obsoleteChunkRecords.length, retiredSourceCount };
}
