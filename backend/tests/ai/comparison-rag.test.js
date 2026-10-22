import test from 'node:test';
import assert from 'node:assert/strict';

const sourceRows = [
  {
    id: 'income-process', sourceId: 'income-source', serviceId: 'up_income_certificate',
    section: 'Application Process', language: 'en', region: 'Uttar Pradesh', verified: true,
    text: 'Income Certificate: the Government services portal lists the online application service and requires registration before applying.',
    source: { id: 'income-source', title: 'Income Certificate', sourceUrl: 'https://edistrict.up.gov.in/income', department: 'Revenue Department', sourceType: 'official_portal', verified: true }
  },
  {
    id: 'caste-process', sourceId: 'caste-source', serviceId: 'up_caste_certificate',
    section: 'Application Process', language: 'en', region: 'Uttar Pradesh', verified: true,
    text: 'Caste Certificate: apply through the eDistrict UP portal, complete Aadhaar e-KYC, attach the required documents, pay ₹30, and submit for processing.',
    source: { id: 'caste-source', title: 'Caste Certificate', sourceUrl: 'https://edistrict.up.gov.in/caste', department: 'Revenue Department', sourceType: 'official_portal', verified: true }
  }
];

let rag;
let gemini;
let previousProvider;
let previousFallback;

function installRetrieval({ unavailableService = null } = {}) {
  const queries = [];
  rag._setEmbedClient({ models: { embedContent: async ({ contents }) => ({ embeddings: [{ values: [contents[0].length, 0.2] }] }) } });
  rag._setQdrantClient({ query: async (_collection, options) => {
    const serviceId = options.filter.must.find((item) => item.key === 'service_id')?.match.value;
    queries.push({ serviceId, options });
    if (unavailableService === serviceId) return [];
    return sourceRows.filter((row) => row.serviceId === serviceId).map((row) => ({
      id: row.id,
      score: row.serviceId === 'up_income_certificate' ? 0.91 : 0.88,
      payload: { chunk_id: row.id, source_id: row.sourceId, service_id: row.serviceId, source_ref: row.id, state: row.region, verified: true }
    }));
  } });
  rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async ({ where }) => sourceRows
    .filter((row) => where.id.in.includes(row.id))
    .map(({ serviceId, ...row }) => row) } });
  return queries;
}

async function withRetrieval(testBody, options) {
  rag = await import('../../src/modules/ai/rag.service.js');
  gemini = await import('../../src/modules/ai/gemini.service.js');
  previousProvider = process.env.LLM_PROVIDER;
  previousFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
  process.env.LLM_PROVIDER = 'gemini';
  process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
  const queries = installRetrieval(options);
  let capturedPrompt = '';
  gemini._setGeminiClient({ models: { generateContent: async ({ contents }) => {
    capturedPrompt = contents[0];
    return { text: 'Comparison generated from supplied evidence.' };
  } } });
  try {
    await testBody({ queries, getPrompt: () => capturedPrompt });
  } finally {
    rag._setQdrantClient(null);
    rag._setEmbedClient(null);
    rag._setKnowledgeDbClient(null);
    gemini._setGeminiClient(null);
    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
    if (previousFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
    else process.env.RAG_ALLOW_LOCAL_FALLBACK = previousFallback;
  }
}

test('standalone certificate queries retain the requested service evidence', async () => {
  await withRetrieval(async ({ queries }) => {
    const { askService } = await import('../../src/modules/ai/ai.service.js');
    for (const [question, serviceId, expected] of [
      ['What are the application steps for an income certificate?', 'up_income_certificate', 'Income Certificate'],
      ['What are the application steps for a caste certificate?', 'up_caste_certificate', 'Caste Certificate']
    ]) {
      const result = await askService({ question, language: 'en' });
      assert.equal(result.needs_human, false);
      assert.deepEqual(result.sources.map((source) => source.service_id), [serviceId]);
      assert.equal(result.sources[0].title, expected);
    }
    assert.deepEqual(queries.map((query) => query.serviceId), ['up_income_certificate', 'up_caste_certificate']);
  });
});

test('comparison independently retrieves both named services and passes both verified chunks to generation', async () => {
  await withRetrieval(async ({ queries, getPrompt }) => {
    const { askService } = await import('../../src/modules/ai/ai.service.js');
    const question = 'Can you compare the application steps for an income certificate and a caste certificate?';
    const result = await askService({ question, language: 'en' });
    assert.equal(result.needs_human, false);
    assert.deepEqual(queries.map((query) => query.serviceId), ['up_income_certificate', 'up_caste_certificate']);
    const prompt = getPrompt();
    assert.match(prompt, /service_id: up_income_certificate/);
    assert.match(prompt, /service_id: up_caste_certificate/);
    assert.match(prompt, /Income Certificate: the Government services portal lists the online application service and requires registration/);
    assert.match(prompt, /Caste Certificate: apply through the eDistrict UP portal/);
    assert.deepEqual(result.sources.map((source) => source.service_id), ['up_income_certificate', 'up_caste_certificate']);
    assert.deepEqual(result.sources.map((source) => source.source_url), [
      'https://edistrict.up.gov.in/income', 'https://edistrict.up.gov.in/caste'
    ]);
  });
});

test('comparison says when one named service has no retrieved evidence', async () => {
  await withRetrieval(async ({ getPrompt }) => {
    const { askService } = await import('../../src/modules/ai/ai.service.js');
    await askService({
      question: 'Can you compare the application steps for an income certificate and a caste certificate?', language: 'en'
    });
    const prompt = getPrompt();
    assert.match(prompt, /Income Certificate: Verified passage\(s\) are included above/);
    assert.match(prompt, /Caste Certificate: No verified passage for this service was retrieved/);
    assert.doesNotMatch(prompt, /Caste Certificate: apply through/);
  }, { unavailableService: 'up_caste_certificate' });
});

test('Hindi comparison independently retrieves both named services', async () => {
  await withRetrieval(async ({ queries, getPrompt }) => {
    const { askService } = await import('../../src/modules/ai/ai.service.js');
    const question = 'आय प्रमाणपत्र और जाति प्रमाणपत्र के आवेदन चरणों की तुलना करें।';
    const result = await askService({ question, language: 'hi' });
    assert.deepEqual(queries.map((query) => query.serviceId), ['up_income_certificate', 'up_caste_certificate']);
    assert.match(getPrompt(), /service_id: up_income_certificate/);
    assert.match(getPrompt(), /service_id: up_caste_certificate/);
    assert.match(getPrompt(), /OUTPUT LANGUAGE: HINDI/i);
    assert.deepEqual(result.sources.map((source) => source.service_id), ['up_income_certificate', 'up_caste_certificate']);
  });
});
