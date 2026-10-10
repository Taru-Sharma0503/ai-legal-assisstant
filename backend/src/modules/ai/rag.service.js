import fs from 'fs';
import path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenAI } from '@google/genai';
import { aiConfig } from '../../config/ai.js';
import { prisma } from '../../config/db.js';
import { buildChunks } from './chunkBuilder.js';
// ── Service-detection patterns ─────────────────────────────────────────────
const SERVICE_PATTERNS = [
  {
    service_id: 'up_income_certificate',
    pattern: /income\s*certif|आय\s*प्रमाण|aay\s*praman|income\s*praman/i
  },
  {
    service_id: 'up_caste_certificate',
    pattern: /caste\s*certif|जाति\s*प्रमाण|jati\s*praman|caste\s*praman/i
  },
  {
    service_id: 'up_domicile_certificate',
    pattern:
      /domicile\s*certif|निवास\s*प्रमाण|niwas\s*praman|domicile\s*praman|residence\s*certif/i
  },
  {
    service_id: 'up_birth_certificate',
    // Fix (Fact 6): added "birth\s*(is\s*)?regist" variant
    pattern:
      /birth\s*certif|birth\s*(is\s*)?regist|जन्म\s*प्रमाण|जन्म\s*पंजीकरण|janm\s*praman|janam\s*praman/i
  },
  {
    service_id: 'up_death_certificate',
    pattern:
      /death\s*certif|death\s*regist|मृत्यु\s*प्रमाण|मृत्यु\s*पंजीकरण|mrityu\s*praman|mrityu\s*pramaan/i
  },
  {
    service_id: 'up_marriage_certificate',
    pattern:
      /marriage\s*certif|विवाह\s*प्रमाण|vivah\s*praman|shaadi\s*certif|shadi\s*certif|शादी\s*प्रमाण/i
  },
  {
    service_id: 'up_ews_certificate',
    pattern: /\bews\b|economically\s*weaker|ईडब्ल्यूएस|आर्थिक\s*रूप\s*से\s*कमजोर/i
  },
  {
    service_id: 'up_disability_certificate',
    pattern:
      /disability\s*certif|दिव्यांगता\s*प्रमाण|दिव्यांग\s*प्रमाण|divyangta\s*praman|divyang\s*certif|viklang\s*certif|विकलांगता\s*प्रमाण/i
  },
  {
    service_id: 'up_character_certificate',
    pattern: /character\s*certif|चरित्र\s*प्रमाण|charitra\s*praman/i
  }
];
// States that are NOT Uttar Pradesh — if mentioned, regex routing should not fire
const OTHER_STATES_RE =
  /\b(bihar|delhi|rajasthan|maharashtra|gujarat|punjab|haryana|madhya\s*pradesh|west\s*bengal|karnataka|tamil\s*nadu|telangana|andhra|jharkhand|odisha|chhattisgarh|assam|kerala|goa|himachal|uttarakhand|meghalaya|manipur|nagaland|mizoram|tripura|sikkim|arunachal)\b/i;
export function detectService(question) {
  if (!question) return null;
  // Do NOT fire regex if the user explicitly mentions a different state
  if (OTHER_STATES_RE.test(question)) return null;
  for (const item of SERVICE_PATTERNS) {
    if (item.pattern.test(question)) {
      return item.service_id;
    }
  }
  return null;
}
const LEGAL_TOPIC_RE = /fundamental rights?|constitutional rights?|article\s*(14|15|19|21|21a|23|24|25|32|226)|legal aid|free legal services?|legal services authorities? act|lok adalat|free lawyer|free vakil|मौलिक अधिकार|संवैधानिक अधिकार|नि(?:ः|:)?शुल्क\s+(?:कानूनी|विधिक)\s+सहायता|मुफ्त\s+कानूनी\s+सहायता|कानूनी सहायता|कानूनी सेवा|कानूनी मदद|मुफ्त वकील|विधिक सेवा|moolik adhikar|samvaidhanik adhikar|muft kanooni madad|free legal madad|free vakil|muft vakil|kanooni sahayata|\b(?:bnss|bharatiya nagarik suraksha sanhita|zero fir|fir|fir complaint|police complaint|police arrest|arrested by police|arrest rights|lawyer during interrogation|advocate during interrogation|domestic violence|women(?:'s)? helpline|child protection|child abuse|child safety|bachchon ki safety|bachon ki safety|pocso|juvenile justice|cybercrime|cyber crime|cyber fraud|online fraud|consumer rights|consumer complaint|consumer grievance|consumer helpline|national consumer helpline|nch|1930|1098|181|1915|defective product|product defect|warranty|poor service|seller.{0,25}refund|refund.{0,25}(?:seller|product|purchase|order))\b|\b(?:police|officer in charge)\b.{0,100}\brefus(?:e|es|ed|al|ing)\b.{0,80}\b(?:record|register)\b.{0,80}\b(?:information|complaint)\b.{0,80}\b(?:cognizable|cognisable)\s+offen[cs]e\b|घरेलू हिंसा|महिला हेल्पलाइन|बाल हेल्पलाइन|बाल सुरक्षा|बच्चों की सुरक्षा|बाल शोषण|यौन अपराध.*बच्च|साइबर अपराध|साइबर धोखाधड़ी|ऑनलाइन धोखाधड़ी|उपभोक्ता अधिकार|उपभोक्ता शिकायत|उपभोक्ता हेल्पलाइन|एफआईआर|प्राथमिकी|जीरो एफआईआर|गिरफ्तारी|पुलिस शिकायत|पुलिस अधिकार|पूछताछ में वकील|मजिस्ट्रेट|महिला अधिकार|बच्चों के अधिकार|cyber dhokha|online thagi|gharelu hinsa|mahila helpline|bachchon ki suraksha|bachon ki suraksha|bal suraksha|upbhokta shikayat|upbhokta adhikar|police me fir|police giraftari|girftari ke adhikar/i;
const CYBERCRIME_REPORTING_RE = /\b(?:online payment fraud|payment fraud|financial cyber fraud|cyber financial fraud|online financial fraud|money stolen online|stolen money online|report cybercrime|report cyber crime|cybercrime\.gov\.in)\b|\b(?:online|internet|digital|bank|account|payment|transaction|transfer)\b.{0,50}\b(?:fraud|scam|theft|stole|stolen|unauthori[sz]ed|unapproved)\b|\b(?:stole|stolen|theft|unauthori[sz]ed|unapproved|fraudulent)\b.{0,50}\b(?:money|funds|payment|transaction|transfer|account)\b|\b(?:money|funds)\b.{0,50}\b(?:stolen|taken|deducted)\b.{0,50}\b(?:online|bank|account|transaction|payment|report)\b|\b(?:online payment|payment)\b.{0,32}\b(?:fraud|scam|thagi)\b|\b(?:paise|paisa|rupaye)\b.{0,32}\b(?:chori|thagi|fraud)\b|ऑनलाइन\s+(?:पेमेंट|भुगतान|फ्रॉड|धोखाधड़ी)|(?:ऑनलाइन|बैंक|खाते|लेनदेन).{0,50}(?:पैसे|रुपये).{0,32}(?:चोरी|कट|निकाल|धोखाधड़ी)|(?:पैसे|रुपये).{0,32}(?:चोरी|ठगी|धोखाधड़ी).{0,50}(?:ऑनलाइन|बैंक|खाते|लेनदेन|रिपोर्ट)|वित्तीय\s+साइबर\s+धोखाधड़ी|साइबरक्राइम\.gov\.in/i;
export function isLegalQuestion(question) {
  if (typeof question !== 'string' || !question) return false;
  const normalized = question
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return LEGAL_TOPIC_RE.test(normalized) || CYBERCRIME_REPORTING_RE.test(normalized);
}
export function filterChunksByService(chunks, targetServiceId) {
  if (!chunks || chunks.length === 0) return chunks;
  if (targetServiceId) {
    const filtered = chunks.filter((c) => c.service_id === targetServiceId);
    return filtered.length > 0 ? filtered : chunks;
  }
  const topService = chunks[0].service_id;
  return chunks.filter((c) => c.service_id === topService);
}
export function buildSources(chunks) {
  const seen = new Set();
  const sources = [];
  for (const c of chunks) {
    const key = c.source_id || c.id || `${c.service_id}:${c.topic}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({
        id: c.source_id || c.id || c.source_ref || '',
        service_id: c.service_id || '',
        title: c.title || '',
        source_url: c.source_url || null,
        department: c.department || null,
        topic: c.topic || '',
        source_type: c.source_type || 'official_government_portal'
      });
    }
    if (sources.length >= 3) break;
  }
  return sources;
}
// ── Test injection hooks ──────────────────────────────────────────────────
// Pass a client object to inject it, or `false` to disable auto-creation.
// Pass `null` to reset (auto-create on next call).
export function _setQdrantClient(client) { qdrantClient = client; }
export function _setEmbedClient(client) { embedClient = client; }

// Database injection hook for unit tests. Passing null restores Prisma.
let knowledgeDb = prisma;
export function _setKnowledgeDbClient(client) {
  knowledgeDb = client === null ? prisma : client;
}
// ── Qdrant client (lazy singleton) ────────────────────────────────────────
let qdrantClient = null;
function getQdrantClient() {
  // `false` = test-disabled; `null` = uninitialized (auto-create); object = ready
  if (qdrantClient === false) return null;
  if (qdrantClient) return qdrantClient;
  if (aiConfig.qdrant.url) {
    qdrantClient = new QdrantClient({
      url: aiConfig.qdrant.url,
      apiKey: aiConfig.qdrant.apiKey || undefined,
      checkCompatibility: false
    });
  }
  return qdrantClient;
}
// ── Gemini embedding client (lazy singleton) ───────────────────────────────
let embedClient = null;
function getEmbedClient() {
  // `false` = test-disabled; `null` = uninitialized (auto-create); object = ready
  if (embedClient === false) return null;
  if (embedClient) return embedClient;
  if (aiConfig.gemini.apiKey) {
    embedClient = new GoogleGenAI({
      apiKey: aiConfig.gemini.apiKey,
      httpOptions: { timeout: aiConfig.timeoutMs, retryOptions: { attempts: 1 } }
    });
  }
  return embedClient;
}
// ── embedQuery: RETRIEVAL_QUERY task type, reads embeddings[0].values ──────
export async function embedQuery(text) {
  const client = getEmbedClient();
  if (!client) return null;
  try {
    const res = await client.models.embedContent({
      model: aiConfig.gemini.embeddingModel || 'gemini-embedding-001',
      contents: [text],
      config: { taskType: 'RETRIEVAL_QUERY' }
    });
    // EmbedContentResponse: { embeddings?: ContentEmbedding[] }
    // ContentEmbedding: { values?: number[] }
    return res.embeddings?.[0]?.values ?? null;
  } catch (err) {
    console.warn('[RAG] Embedding generation failed:', err.message);
    return null;
  }
}
// ── Local chunk cache (built from shared chunkBuilder) ────────────────────
let localChunksCache = null;
export function loadLocalChunks() {
  if (localChunksCache) return localChunksCache;
  localChunksCache = [];
  const dataDirs = [
    { directory: path.resolve(process.cwd(), 'data', 'services'), domain: 'citizen_service' },
    { directory: path.resolve(process.cwd(), 'data', 'legal'), domain: 'legal_rights' }
  ];
  for (const { directory, domain } of dataDirs) {
    if (!fs.existsSync(directory)) continue;
    let files;
    try {
      files = fs.readdirSync(directory).filter((file) => file.endsWith('.json'));
    } catch (err) {
      console.warn(`[RAG] Failed to list local ${domain} knowledge:`, err.message);
      continue;
    }
    for (const file of files) {
      try {
        const svc = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
        const chunks = buildChunks(svc, file).map((chunk) => ({
          ...chunk,
          knowledge_domain: domain
        }));
        localChunksCache.push(...chunks);
      } catch (err) {
        console.warn(`[RAG] Failed to load local ${domain} knowledge file ${file}:`, err.message);
      }
    }
  }
  return localChunksCache;
}
/**
 * Keyword-overlap scoring — NOT semantic similarity.
 * Scores are in range [0.4, 0.95] based on word overlap between query and chunk.
 * retrievalSource="local_fallback" always accompanies these scores.
 */
function retrieveLocal(question, state, topK = 5, targetServiceId = null, targetDomain = null) {
  const allLocal = loadLocalChunks();
  const qLower = question.toLowerCase();
  const words = qLower.match(/[a-z0-9\u0900-\u097F]+/g) || [];
  const scored = allLocal
    .filter(
      (c) =>
        c.state.toLowerCase() === state.toLowerCase() &&
        c.verified &&
        (!targetDomain || (c.knowledge_domain || 'citizen_service') === targetDomain) &&
        (!targetServiceId || c.service_id === targetServiceId)
    )
    .map((c) => {
      const textLower = c.text.toLowerCase();
      let matchCount = 0;
      for (const w of words) {
        if (w.length > 2 && textLower.includes(w)) matchCount++;
      }
      const score = Math.min(0.95, 0.4 + (matchCount / (words.length || 1)) * 0.55);
      return { ...c, score };
    });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
/**
 * Hydrate Qdrant search hits from PostgreSQL.
 * Qdrant is used for vector similarity only; PostgreSQL provides authoritative
 * chunk text and source metadata. Hits missing valid DB linkage are rejected.
 */
async function hydrateQdrantHitsFromPostgres(hits, state) {
  const eligibleHits = hits.filter(
    (hit) => hit?.payload?.chunk_id && hit?.payload?.source_id
  );

  const chunkIds = [
    ...new Set(eligibleHits.map((hit) => hit.payload.chunk_id))
  ];

  if (chunkIds.length === 0) return [];

  if (!knowledgeDb?.knowledgeChunk?.findMany) {
    throw new Error('Prisma KnowledgeChunk client is unavailable');
  }

  const records = await knowledgeDb.knowledgeChunk.findMany({
    where: {
      id: { in: chunkIds },
      region: state,
      verified: true,
      source: {
        is: { verified: true }
      }
    },
    include: { source: true }
  });

  const recordsById = new Map(records.map((record) => [record.id, record]));

  // Keep Qdrant's ranking order and original similarity scores.
  return eligibleHits
    .map((hit) => {
      const payload = hit.payload || {};
      const record = recordsById.get(payload.chunk_id);

      // Reject stale vectors, mismatched source links, and unverified content.
      if (
        !record ||
        record.sourceId !== payload.source_id ||
        !record.verified ||
        !record.source ||
        !record.source.verified
      ) {
        return null;
      }

      return {
        service_id: payload.service_id || '',
        source_id: record.source.id,
        state: record.region || '',
        source_type: record.source.sourceType || 'official_government_portal',
        language: record.language || 'en',
        topic: record.section || 'general',
        text: record.text,
        source_ref: payload.source_ref || '',
        score: typeof hit.score === 'number' ? hit.score : 0.8,
        title: record.source.title || '',
        department: record.source.department || null,
        source_url: record.source.sourceUrl || null,
        verified: true
      };
    })
    .filter(Boolean);
}

/**
 * retrieve()
 *
 * Returns: { chunks, retrievalSource, fallbackReason }
 *   retrievalSource: "qdrant" | "local_fallback"
 *   fallbackReason:  "no_qdrant_client" | "embedding_failed" |
 *                    "qdrant_error" | "qdrant_zero_hits" |
 *                    "postgres_error" | "postgres_no_verified_chunks" | null
 *
 * When RAG_ALLOW_LOCAL_FALLBACK is false and Qdrant fails/returns nothing,
 * returns zero chunks so ai.service.js emits needs_human instead of
 * keyword-matching.
 */
export async function retrieve(question, state = 'Uttar Pradesh', topK = 5) {
  const legal = isLegalQuestion(question);
  const detectedService = detectService(question);
  console.log('[RAG] Detected service:', detectedService, '| Retrieval starting…');
  const client = getQdrantClient();
  const vector = await embedQuery(question);
  // ── Qdrant path ──────────────────────────────────────────────────────────
  if (client && vector) {
    try {
      const filter = {
        must: [
          { key: 'state', match: { value: state } },
          { key: 'verified', match: { value: true } },
          ...(legal ? [{ key: 'knowledge_domain', match: { value: 'legal_rights' } }] : []),
          ...(!legal && detectedService
            ? [{ key: 'service_id', match: { value: detectedService } }]
            : [])
        ]
      };
      // Use client.query() — the current non-deprecated Qdrant JS API.
      // Returns QueryResponse = ScoredPoint[]
      const collection = legal ? 'legal_rights_chunks' : aiConfig.qdrant.collection;
      const queryRes = await client.query(collection, {
        query: vector,
        filter,
        limit: topK,
        with_payload: true,
        timeout: Math.ceil((aiConfig.timeoutMs || 15000) / 1000)
      });
      const hits = Array.isArray(queryRes) ? queryRes : (queryRes?.points || []);
      if (hits && hits.length > 0) {
        console.log('[RAG] Retrieval source: qdrant |', hits.length, 'hits');

        try {
          const chunks = await hydrateQdrantHitsFromPostgres(hits, state);
          if (chunks.length > 0) {
            return { chunks, retrievalSource: 'qdrant', fallbackReason: null };
          }

          console.warn('[RAG] No matching verified PostgreSQL chunks found');
          if (!aiConfig.allowLocalFallback) {
            return {
              chunks: [],
              retrievalSource: 'qdrant',
              fallbackReason: 'postgres_no_verified_chunks'
            };
          }

          return {
            chunks: retrieveLocal(question, state, topK, detectedService, legal ? 'legal_rights' : 'citizen_service'),
            retrievalSource: 'local_fallback',
            fallbackReason: 'postgres_no_verified_chunks'
          };
        } catch (err) {
          console.warn('[RAG] PostgreSQL hydration failed:', err.message);
          if (!aiConfig.allowLocalFallback) {
            return {
              chunks: [],
              retrievalSource: 'qdrant',
              fallbackReason: 'postgres_error'
            };
          }

          return {
            chunks: retrieveLocal(question, state, topK, detectedService, legal ? 'legal_rights' : 'citizen_service'),
            retrievalSource: 'local_fallback',
            fallbackReason: 'postgres_error'
          };
        }
      }
      // Qdrant returned zero hits
      console.warn('[RAG] Qdrant returned zero hits, checking fallback policy…');
      if (!aiConfig.allowLocalFallback) {
        return { chunks: [], retrievalSource: 'qdrant', fallbackReason: 'qdrant_zero_hits' };
      }
      console.warn('[RAG] Falling back to local keyword search (qdrant_zero_hits)');
      return {
        chunks: retrieveLocal(question, state, topK, detectedService, legal ? 'legal_rights' : 'citizen_service'),
        retrievalSource: 'local_fallback',
        fallbackReason: 'qdrant_zero_hits'
      };
    } catch (err) {
      console.warn('[RAG] Qdrant query failed:', err.message);
      if (!aiConfig.allowLocalFallback) {
        return { chunks: [], retrievalSource: 'qdrant', fallbackReason: 'qdrant_error' };
      }
      console.warn('[RAG] Falling back to local keyword search (qdrant_error)');
      return {
        chunks: retrieveLocal(question, state, topK, detectedService, legal ? 'legal_rights' : 'citizen_service'),
        retrievalSource: 'local_fallback',
        fallbackReason: 'qdrant_error'
      };
    }
  }
  // ── No Qdrant client or embedding failed ──────────────────────────────────
  const noClientReason = !client ? 'no_qdrant_client' : 'embedding_failed';
  if (!aiConfig.allowLocalFallback) {
    console.warn('[RAG] Local fallback disabled, returning zero chunks (' + noClientReason + ')');
    return { chunks: [], retrievalSource: 'qdrant', fallbackReason: noClientReason };
  }
  console.warn('[RAG] Falling back to local keyword search (' + noClientReason + ')');
  return {
    chunks: retrieveLocal(question, state, topK, detectedService, legal ? 'legal_rights' : 'citizen_service'),
    retrievalSource: 'local_fallback',
    fallbackReason: noClientReason
  };
}
