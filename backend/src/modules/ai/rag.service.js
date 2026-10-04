import fs from "fs";
import path from "path";
import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenAI } from "@google/genai";
import { aiConfig } from "../../config/ai.js";

const SERVICE_PATTERNS = [
  {
    service_id: "up_income_certificate",
    pattern: /income\s*certif|आय\s*प्रमाण|aay\s*praman|income\s*praman/i
  },
  {
    service_id: "up_caste_certificate",
    pattern: /caste\s*certif|जाति\s*प्रमाण|jati\s*praman|caste\s*praman/i
  },
  {
    service_id: "up_domicile_certificate",
    pattern: /domicile\s*certif|निवास\s*प्रमाण|niwas\s*praman|domicile\s*praman|residence\s*certif/i
  },
  {
    service_id: "up_birth_certificate",
    pattern: /birth\s*certif|birth\s*registration|जन्म\s*प्रमाण|जन्म\s*पंजीकरण|janm\s*praman|janam\s*praman/i
  },
  {
    service_id: "up_death_certificate",
    pattern: /death\s*certif|death\s*registration|मृत्यु\s*प्रमाण|मृत्यु\s*पंजीकरण|mrityu\s*praman|mrityu\s*pramaan/i
  },
  {
    service_id: "up_marriage_certificate",
    pattern: /marriage\s*certif|विवाह\s*प्रमाण|vivah\s*praman|shaadi\s*certif|shadi\s*certif|शादी\s*प्रमाण/i
  },
  {
    service_id: "up_ews_certificate",
    pattern: /\bews\b|economically\s*weaker|ईडब्ल्यूएस|आर्थिक\s*रूप\s*से\s*कमजोर/i
  },
  {
    service_id: "up_disability_certificate",
    pattern: /disability\s*certif|दिव्यांगता\s*प्रमाण|दिव्यांग\s*प्रमाण|divyangta\s*praman|divyang\s*certif|viklang\s*certif|विकलांगता\s*प्रमाण/i
  },
  {
    service_id: "up_character_certificate",
    pattern: /character\s*certif|चरित्र\s*प्रमाण|charitra\s*praman/i
  }
];

export function detectService(question) {
  if (!question) return null;

  for (const item of SERVICE_PATTERNS) {
    if (item.pattern.test(question)) {
      return item.service_id;
    }
  }

  return null;
}

export function filterChunksByService(chunks, targetServiceId) {
  if (!chunks || chunks.length === 0) return chunks;

  if (targetServiceId) {
    return chunks.filter((c) => c.service_id === targetServiceId);
  }

  const topService = chunks[0].service_id;

  return chunks.filter((c) => c.service_id === topService);
}

export function buildSources(chunks) {
  const seen = new Set();
  const sources = [];

  for (const c of chunks) {
    const key = `${c.service_id}:${c.topic}`;

    if (!seen.has(key)) {
      seen.add(key);

      sources.push({
        service_id: c.service_id,
        title: c.title || "",
        source_url: c.source_url || null,
        department: c.department || null,
        topic: c.topic || "",
        source_type: c.source_type || "official_government_portal"
      });
    }

    if (sources.length >= 3) break;
  }

  return sources;
}

let qdrantClient = null;

function getQdrantClient() {
  if (!qdrantClient && aiConfig.qdrant.url) {
    qdrantClient = new QdrantClient({
      url: aiConfig.qdrant.url,
      apiKey: aiConfig.qdrant.apiKey || undefined
    });
  }

  return qdrantClient;
}

export async function embedQuery(text) {
  if (!aiConfig.gemini.apiKey) return null;

  try {
    const aiClient = new GoogleGenAI({
      apiKey: aiConfig.gemini.apiKey
    });

    const response = await aiClient.models.embedContent({
      model: aiConfig.gemini.embeddingModel || "gemini-embedding-001",
      contents: [`query: ${text}`]
    });

    return response.embedding?.values || null;
  } catch (err) {
    console.warn("Embedding generation failed:", err.message);
    return null;
  }
}

let localChunksCache = null;

function loadLocalChunks() {
  if (localChunksCache) return localChunksCache;

  const dataDir = path.resolve(process.cwd(), "data", "services");

  localChunksCache = [];

  if (!fs.existsSync(dataDir)) return localChunksCache;

  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const fullPath = path.join(dataDir, file);
      const raw = fs.readFileSync(fullPath, "utf8");
      const json = JSON.parse(raw);

      const meta = json.service_metadata || {};

      const serviceId = meta.service_id || file.replace(".json", "");
      const state = meta.state || "Uttar Pradesh";
      const department =
        meta.department || "Government of Uttar Pradesh";
      const title = meta.service_name_en || serviceId;
      const sourceUrl =
        meta.portal_url || "https://edistrict.up.gov.in";

      if (
        json.eligibility_criteria &&
        Array.isArray(json.eligibility_criteria)
      ) {
        localChunksCache.push({
          service_id: serviceId,
          state,
          source_type: "official_government_portal",
          language: "en",
          topic: "eligibility",
          text:
            `Eligibility Criteria for ${title}:\n` +
            json.eligibility_criteria
              .map((e) => `• ${e}`)
              .join("\n"),
          source_ref: `${serviceId}_eligibility`,
          score: 0.85,
          title,
          department,
          source_url: sourceUrl,
          verified: true
        });
      }

      if (
        json.required_documents_checklist &&
        Array.isArray(json.required_documents_checklist)
      ) {
        const docsText = json.required_documents_checklist
          .map(
            (d) =>
              `• ${d.doc_name_en} (${d.doc_name_hi}): ${d.description_en || ""
              }`
          )
          .join("\n");

        localChunksCache.push({
          service_id: serviceId,
          state,
          source_type: "official_government_portal",
          language: "en",
          topic: "documents",
          text: `Required Documents Checklist for ${title}:\n${docsText}`,
          source_ref: `${serviceId}_documents`,
          score: 0.9,
          title,
          department,
          source_url: sourceUrl,
          verified: true
        });
      }

      if (
        json.application_process_steps &&
        Array.isArray(json.application_process_steps)
      ) {
        const stepsText = json.application_process_steps
          .map(
            (s) =>
              `Step ${s.step_number}: ${s.title_en} - ${s.description_en}`
          )
          .join("\n");

        localChunksCache.push({
          service_id: serviceId,
          state,
          source_type: "official_government_portal",
          language: "en",
          topic: "process",
          text: `Application Process for ${title}:\n${stepsText}`,
          source_ref: `${serviceId}_process`,
          score: 0.8,
          title,
          department,
          source_url: sourceUrl,
          verified: true
        });
      }

      if (
        json.vector_db_chunks &&
        Array.isArray(json.vector_db_chunks)
      ) {
        for (const chunk of json.vector_db_chunks) {
          localChunksCache.push({
            service_id: serviceId,
            state,
            source_type:
              chunk.metadata?.source_type ||
              "official_government_portal",
            language: chunk.metadata?.language || "en",
            topic: chunk.metadata?.section || "general",
            text: chunk.text || "",
            source_ref:
              chunk.chunk_id || `${serviceId}_chunk`,
            score: 0.82,
            title: chunk.metadata?.service_name || title,
            department:
              chunk.metadata?.department || department,
            source_url:
              chunk.metadata?.source_url || sourceUrl,
            verified: true
          });
        }
      }

      if (json.faqs && Array.isArray(json.faqs)) {
        for (const faq of json.faqs) {
          localChunksCache.push({
            service_id: serviceId,
            state,
            source_type: "official_government_portal",
            language: "en",
            topic: faq.category || "faq",
            text:
              `Q: ${faq.question_en} (${faq.question_hi})\n` +
              `A: ${faq.answer_en}`,
            source_ref:
              `${serviceId}_faq_${faq.faq_id}`,
            score: 0.75,
            title,
            department,
            source_url: sourceUrl,
            verified: true
          });
        }
      }
    } catch (err) {
      console.warn(
        `Failed reading local knowledge file ${file}:`,
        err.message
      );
    }
  }

  return localChunksCache;
}

function retrieveLocal(
  question,
  state,
  topK = 5,
  targetServiceId = null
) {
  const allLocal = loadLocalChunks();
  const qLower = question.toLowerCase();

  const words =
    qLower.match(/[a-z0-9\u0900-\u097F]+/g) || [];

  const scored = allLocal
    .filter(
      (c) =>
        c.state.toLowerCase() === state.toLowerCase() &&
        c.verified &&
        (!targetServiceId ||
          c.service_id === targetServiceId)
    )
    .map((c) => {
      const textLower = c.text.toLowerCase();

      let matchCount = 0;

      for (const w of words) {
        if (w.length > 2 && textLower.includes(w)) {
          matchCount++;
        }
      }

      const score = Math.min(
        0.95,
        0.4 +
        (matchCount / (words.length || 1)) * 0.55
      );

      return { ...c, score };
    });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

export async function retrieve(
  question,
  state = "Uttar Pradesh",
  topK = 5
) {
  const detectedService = detectService(question);

  console.log("RAG QUESTION:", question);
  console.log("RAG DETECTED SERVICE:", detectedService);

  const client = getQdrantClient();
  const vector = await embedQuery(question);

  if (client && vector) {
    try {
      const searchRes = await client.search(
        aiConfig.qdrant.collection,
        {
          vector,
          limit: topK,
          filter: {
            must: [
              {
                key: "state",
                match: { value: state }
              },
              {
                key: "verified",
                match: { value: true }
              },
              ...(detectedService
                ? [
                  {
                    key: "service_id",
                    match: {
                      value: detectedService
                    }
                  }
                ]
                : [])
            ]
          },
          with_payload: true
        }
      );

      if (searchRes && searchRes.length > 0) {
        return searchRes.map((hit) => {
          const p = hit.payload || {};

          return {
            service_id: p.service_id || "",
            state: p.state || "",
            source_type:
              p.source_type ||
              "official_government_portal",
            language: p.language || "en",
            topic: p.topic || p.section || "",
            text: p.text || "",
            source_ref: p.source_ref || "",
            score:
              typeof hit.score === "number"
                ? hit.score
                : 0.8,
            title: p.title || "",
            department: p.department || null,
            source_url: p.source_url || null,
            verified: Boolean(p.verified)
          };
        });
      }
    } catch (err) {
      console.warn(
        "Qdrant search failed, falling back to local search:",
        err.message
      );
    }
  }

  return retrieveLocal(
    question,
    state,
    topK,
    detectedService
  );
}