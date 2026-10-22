import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildChunks } from '../../src/modules/ai/chunkBuilder.js';

async function offline(run) {
  const rag = await import('../../src/modules/ai/rag.service.js');
  rag._setQdrantClient(false);
  rag._setEmbedClient(false);
  try {
    await run(rag);
  } finally {
    rag._setQdrantClient(null);
    rag._setEmbedClient(null);
  }
}

describe('answerability and evidence regressions', () => {
  it('keeps source provenance verification separate from per-chunk verification', () => {
    const document = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data/services/income_certificate_up.json'), 'utf8'));
    const chunks = buildChunks(document, 'income_certificate_up.json');
    const route = chunks.find((chunk) => chunk.id === 'up_income_cert_official_application_route');
    const legacy = chunks.find((chunk) => chunk.id === 'up_income_cert_procedure');

    assert.equal(route.source_verified, true);
    assert.equal(route.verified, true);
    assert.equal(legacy.source_verified, true);
    assert.equal(legacy.verified, false);
  });

  it('routes the four income-certificate turns to verified, question-relevant evidence', async () => {
    await offline(async () => {
      const { askService, buildContextualRetrievalQuery } = await import('../../src/modules/ai/ai.service.js');
      const turns = [
        ['How can I apply for an income certificate?', 'application'],
        ['What documents do I need for that?', 'documents'],
        ['Does this require Aadhaar OTP verification?', 'aadhaar'],
        ['What is the application fee?', 'fee']
      ];
      const history = [];
      const results = [];
      for (const [question] of turns) {
        const retrievalQuestion = buildContextualRetrievalQuery(question, history);
        const result = await askService({ question, retrievalQuestion, language: 'en', skipLlm: true });
        assert.equal(result.suggested_service_id, 'up_income_certificate');
        results.push(result);
        history.push({ sender: 'USER', content: question });
      }

      assert.ok(results[0].sources.some((source) => source.id === 'up_income_cert_official_application_route'));
      assert.ok(results[0].sources.every((source) => source.id !== 'up_income_cert_aadhaar_notification_2023'));
      assert.ok(results[0].sources.every((source) => source.id !== 'up_income_cert_calculation_rules'));
      assert.deepEqual(results[1].sources.map((source) => source.id), ['up_income_cert_official_documents_gbnagar']);
      assert.ok(results[2].sources.some((source) => source.id === 'up_income_cert_aadhaar_notification_2023'));
      assert.equal(results[2].guard_reason, 'aadhaar_authentication_method_unspecified');
      assert.match(results[2].answer, /does not specify that OTP is the authentication method/i);
      assert.doesNotMatch(results[2].answer, /OTP is required/i);

      const fee = await askService({
        question: turns[3][0],
        retrievalQuestion: buildContextualRetrievalQuery(turns[3][0], history.slice(0, 3)),
        language: 'en'
      });
      assert.equal(fee.guard_reason, 'income_certificate_fee_unverified');
      assert.equal(fee.needs_human, true);
      assert.deepEqual(fee.sources, []);
      assert.match(fee.answer, /can't verify the current application fee/i);
      assert.doesNotMatch(fee.answer, /30|Aadhaar OTP/i);
      assert.doesNotMatch(fee.answer, /processing time|officer name|contact details/i);
    });
  });

  it('reproduces four successfully hydrated Qdrant hits rejected by income application candidate filtering', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const oldFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    const originalInfo = console.info;
    const traces = [];
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    const records = [
      ['overview', 'Income certificate issued by the Tehsildar.', 'Overview'],
      ['procedure', 'Complete Aadhaar mobile OTP authentication before submission.', 'Application Procedure'],
      ['fee', 'Pay INR 30 fee on the portal.', 'Fee Details'],
      ['checklist', 'Applicant submits supporting documents for processing.', 'Required Documents']
    ].map(([id, text, section]) => ({
      id, sourceId: `source-${id}`, text, pageNumber: null, section, language: 'en',
      region: 'Uttar Pradesh', verified: true,
      source: { id: `source-${id}`, title: 'Income Certificate', sourceUrl: 'https://example.gov.in', verified: true }
    }));
    const hits = records.map((record, index) => ({
      id: `qdrant-point-${index}`,
      score: 0.9 - index * 0.01,
      payload: {
        chunk_id: record.id, source_id: record.sourceId, source_ref: record.id,
        service_id: 'up_income_certificate', state: 'Uttar Pradesh', verified: true,
        topic: record.section, title: 'Income Certificate', text: record.text
      }
    }));
    rag._setQdrantClient({ query: async () => hits });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1, 0.2] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async () => records } });
    console.info = (...args) => { traces.push(args); };
    try {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const result = await askService({
        question: 'How can I apply for an income certificate?',
        language: 'en', skipLlm: true
      });
      const hydration = traces.find(([label]) => label === '[RAG] Hydration');
      assert.deepEqual(JSON.parse(hydration[1]).qdrantHits, 4);
      assert.equal(JSON.parse(hydration[1]).hydratedChunks, 4);
      const rejected = traces.filter(([label]) => label === '[RAG] Candidate rejection').map(([, json]) => JSON.parse(json));
      assert.equal(rejected.length, 4);
      assert.deepEqual(rejected.map((entry) => entry.qdrantPointId), hits.map((hit) => hit.id));
      assert.ok(rejected.some((entry) => entry.rejectionReasons.includes('no_supported_application_route_claim')));
      assert.ok(rejected.some((entry) => entry.rejectionReasons.includes('unsupported_legacy_claim')));
      assert.equal(result.guard_reason, 'no_chunks');
      assert.deepEqual(result.sources, []);
    } finally {
      console.info = originalInfo;
      rag._setQdrantClient(null);
      rag._setEmbedClient(null);
      rag._setKnowledgeDbClient(null);
      if (oldFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = oldFallback;
    }
  });

  it('rejects stale and unverified Qdrant/DB metadata but accepts a verified application route', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const oldFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    const oldProvider = process.env.LLM_PROVIDER;
    const originalInfo = console.info;
    const traces = [];
    let capturedPrompt = '';
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    const validText = "Service: Income Certificate (Aay Praman Patra), Uttar Pradesh Revenue Department. The Government of India services portal lists the online UP service and registration requirement. Consult the live portal for current steps. The current fee and any OTP method are not established by the verified sources in this knowledge base. A legacy note says Aadhaar OTP is required and the fee is INR 30.";
    const specs = [
      { id: 'valid', text: validText, section: 'Official online application route', verified: true, sourceVerified: true },
      { id: 'stale-text', text: 'Current database text differs from old vector text.', qdrantText: 'Old Qdrant text.', section: 'Application route', verified: true, sourceVerified: true },
      { id: 'qdrant-verification-missing', text: validText, section: 'Application route', verified: true, sourceVerified: true, qdrantVerified: undefined },
      { id: 'postgres-verification-missing', text: validText, section: 'Application route', sourceVerified: true },
      { id: 'postgres-explicitly-unverified', text: validText, section: 'Application route', verified: false, sourceVerified: true },
      { id: 'source-verification-missing', text: validText, section: 'Application route', verified: true },
      { id: 'source-explicitly-unverified', text: validText, section: 'Application route', verified: true, sourceVerified: false },
      { id: 'source-identity-mismatch', text: validText, section: 'Application route', verified: true, sourceVerified: true, payloadSourceId: 'wrong-source' }
    ];
    const hits = specs.map((spec) => ({
      id: `qdrant-${spec.id}`, score: 0.93,
      payload: {
        chunk_id: spec.id, source_id: spec.payloadSourceId || `source-${spec.id}`,
        source_ref: spec.id === 'valid' ? 'up_income_cert_official_application_route' : spec.id,
        service_id: 'up_income_certificate', state: 'Uttar Pradesh',
        ...(spec.qdrantVerified === undefined ? (Object.hasOwn(spec, 'qdrantVerified') ? {} : { verified: true }) : { verified: spec.qdrantVerified }),
        topic: spec.section, text: spec.qdrantText || spec.text
      }
    }));
    const rows = specs.map((spec) => ({
      id: spec.id, sourceId: `source-${spec.id}`, text: spec.text, pageNumber: null,
      section: spec.section, language: 'en', region: 'Uttar Pradesh',
      ...(Object.hasOwn(spec, 'verified') ? { verified: spec.verified } : {}),
      source: {
        id: `source-${spec.id}`, title: 'Income Certificate',
        sourceUrl: 'https://services.india.gov.in/service/state_services?ln=en&page_no=2&sd_id=3734',
        ...(Object.hasOwn(spec, 'sourceVerified') ? { verified: spec.sourceVerified } : {})
      }
    }));
    rag._setQdrantClient({ query: async () => hits });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1, 0.2] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async () => rows } });
    process.env.LLM_PROVIDER = 'gemini';
    const gemini = await import('../../src/modules/ai/gemini.service.js');
    gemini._setGeminiClient({ models: { generateContent: async ({ contents }) => {
      capturedPrompt = contents[0];
      return { text: 'Grounded application route.' };
    } } });
    console.info = (...args) => { traces.push(args); };
    try {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const result = await askService({ question: 'How can I apply for an income certificate?', language: 'en' });
      assert.equal(result.suggested_service_id, 'up_income_certificate');
      assert.equal(result.needs_human, false);
      assert.ok(result.sources.some((source) => source.topic === 'Official online application route'));
      assert.equal(result.sources.length, 1);
      assert.doesNotMatch(result.answer, /OTP is required|INR 30|₹30/i);
      const rejected = traces.filter(([label]) => label === '[RAG] Hydration candidate').map(([, json]) => JSON.parse(json));
      assert.ok(rejected.find((entry) => entry.qdrantChunkId === 'stale-text').rejectionReasons.includes('stale_qdrant_text'));
      assert.ok(rejected.find((entry) => entry.qdrantChunkId === 'qdrant-verification-missing').rejectionReasons.includes('qdrant_verification_missing_or_false'));
      assert.ok(rejected.find((entry) => entry.qdrantChunkId === 'postgres-verification-missing').rejectionReasons.includes('postgres_chunk_verification_missing_or_false'));
      assert.ok(rejected.find((entry) => entry.qdrantChunkId === 'postgres-explicitly-unverified').rejectionReasons.includes('postgres_chunk_verification_missing_or_false'));
      assert.ok(rejected.find((entry) => entry.qdrantChunkId === 'source-verification-missing').rejectionReasons.includes('postgres_source_verification_missing_or_false'));
      assert.ok(rejected.find((entry) => entry.qdrantChunkId === 'source-explicitly-unverified').rejectionReasons.includes('postgres_source_verification_missing_or_false'));
      assert.ok(rejected.find((entry) => entry.qdrantChunkId === 'source-identity-mismatch').rejectionReasons.includes('qdrant_postgres_source_id_mismatch'));
      assert.equal(rejected.find((entry) => entry.qdrantChunkId === 'valid').rejectionReasons.length, 0);
      assert.match(capturedPrompt, /online UP service and registration requirement/);
      assert.doesNotMatch(capturedPrompt, /Aadhaar OTP is required|fee is INR 30/i);
      assert.doesNotMatch(result.answer, /OTP is required|INR 30|₹30/i);
    } finally {
      console.info = originalInfo;
      rag._setQdrantClient(null);
      rag._setEmbedClient(null);
      rag._setKnowledgeDbClient(null);
      gemini._setGeminiClient(null);
      if (oldProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = oldProvider;
      if (oldFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = oldFallback;
    }
  });

  it('rejects a stale verified Qdrant record that contains unsupported OTP and fee assertions', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const previousFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    rag._setQdrantClient({ query: async () => [{
      id: 'stale-point', score: 0.91,
      payload: {
        service_id: 'up_income_certificate', source_id: 'stale-income-source',
        chunk_id: 'stale-income-chunk', source_ref: 'up_income_cert_procedure',
        state: 'Uttar Pradesh', verified: true, topic: 'Application Procedure'
      }
    }] });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1, 0.2] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async ({ where }) => (where?.id?.in || []).map((id) => ({
      id, sourceId: 'stale-income-source',
      text: 'Complete Aadhaar mobile OTP authentication and pay INR 30 fee for the online application.',
      pageNumber: null, section: 'Application Procedure', language: 'en', region: 'Uttar Pradesh', verified: true,
      source: { id: 'stale-income-source', title: 'Income Certificate', sourceUrl: 'https://example.invalid', verified: true }
    })) } });
    try {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      for (const [question, retrievalQuestion] of [
        ['How can I apply for an income certificate?', 'How can I apply for an income certificate?'],
        ['Does this require Aadhaar OTP verification?', 'How can I apply for an income certificate? Follow-up: Does this require Aadhaar OTP verification?']
      ]) {
        const result = await askService({ question, retrievalQuestion, language: 'en', skipLlm: true });
        assert.equal(result.needs_human, true, question);
        assert.deepEqual(result.sources, [], question);
        assert.doesNotMatch(result.answer, /OTP.{0,30}(?:required|authentication)|(?:required|authentication).{0,30}OTP|INR 30|30/i, question);
      }
    } finally {
      rag._setQdrantClient(null);
      rag._setEmbedClient(null);
      rag._setKnowledgeDbClient(null);
      if (previousFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = previousFallback;
    }
  });

  it('falls back to verified local knowledge when Qdrant returns only rejected legacy income chunks and allowLocalFallback is true', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const previousFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'true';
    rag._setQdrantClient({ query: async () => [{
      id: 'stale-point', score: 0.91,
      payload: {
        service_id: 'up_income_certificate', source_id: 'stale-income-source',
        chunk_id: 'stale-income-chunk', source_ref: 'up_income_cert_procedure',
        state: 'Uttar Pradesh', verified: true, topic: 'Application Procedure'
      }
    }] });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1, 0.2] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async ({ where }) => (where?.id?.in || []).map((id) => ({
      id, sourceId: 'stale-income-source',
      text: 'Complete Aadhaar mobile OTP authentication and pay INR 30 fee for the online application.',
      pageNumber: null, section: 'Application Procedure', language: 'en', region: 'Uttar Pradesh', verified: true,
      source: { id: 'stale-income-source', title: 'Income Certificate', sourceUrl: 'https://example.invalid', verified: true }
    })) } });
    try {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const result = await askService({ question: 'How can I apply for an income certificate?', language: 'en', skipLlm: true });
      assert.equal(result.suggested_service_id, 'up_income_certificate');
      assert.equal(result.needs_human, false);
      assert.equal(result.retrieval_source, 'local_fallback');
      assert.ok(result.sources.some((source) => source.id === 'up_income_cert_official_application_route'));
      assert.ok(result.sources.every((source) => source.id !== 'up_income_cert_calculation_rules'));
    } finally {
      rag._setQdrantClient(null);
      rag._setEmbedClient(null);
      rag._setKnowledgeDbClient(null);
      if (previousFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = previousFallback;
    }
  });

  it('supports Hindi and Hinglish application route queries for income certificate', async () => {
    await offline(async () => {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      for (const [question, lang] of [
        ['आय प्रमाण पत्र के लिए कैसे आवेदन करें?', 'hi'],
        ['income certificate ke liye apply kaise kare', 'hinglish']
      ]) {
        const result = await askService({ question, language: lang, skipLlm: true });
        assert.equal(result.suggested_service_id, 'up_income_certificate', question);
        assert.equal(result.needs_human, false, question);
        assert.ok(result.sources.some((source) => source.id === 'up_income_cert_official_application_route'), question);
      }
    });
  });

  it('does not promote legacy OTP or fee claims without explicit chunk verification', async () => {
    const { readFile } = await import('node:fs/promises');
    const { buildChunks } = await import('../../src/modules/ai/chunkBuilder.js');
    const service = JSON.parse(await readFile(new URL('../../data/services/income_certificate_up.json', import.meta.url), 'utf8'));
    const legacy = service.vector_db_chunks.find((chunk) => chunk.chunk_id === 'up_income_cert_procedure');
    assert.equal(legacy.metadata.verified, undefined);
    assert.equal(buildChunks(service, 'income_certificate_up.json').find((chunk) => chunk.id === legacy.chunk_id).verified, false);
    assert.doesNotMatch(legacy.text, /OTP|30/i);
    assert.ok(service.vector_db_chunks.find((chunk) => chunk.chunk_id === 'up_income_cert_aadhaar_notification_2023').metadata.verified);
  });

  it('keeps supported birth-registration document evidence while identifying that retrieval is not an answer-quality result', async () => {
    await offline(async () => {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const result = await askService({
        question: 'What should I do if I do not have the usual documents for birth registration?',
        language: 'en', skipLlm: true
      });
      assert.equal(result.suggested_service_id, 'up_birth_certificate');
      assert.ok(result.sources.some((source) => source.topic === 'Required Documents'));
      assert.equal(result.generation_status, 'skipped');
    });
  });

  for (const [question, language] of [
    ['What should I do if my birth certificate application is rejected?', 'en'],
    ['अगर जन्म प्रमाण पत्र का आवेदन रिजेक्ट हो जाए तो क्या करें?', 'hi'],
    ['Mera birth certificate application reject ho gaya, ab kya karun?', 'hinglish'],
    ['How can I correct a mistake in my birth certificate application?', 'en'],
    ['जन्म प्रमाण पत्र के आवेदन में गलती कैसे सुधारें?', 'hi'],
    ['birth certificate ke form mein galti ho gayi, correction kaise hoga?', 'hinglish']
  ]) {
    it(`escalates unsupported birth-certificate guidance: ${question}`, async () => {
      await offline(async () => {
        const { askService } = await import('../../src/modules/ai/ai.service.js');
        const result = await askService({ question, language, skipLlm: true });
        assert.equal(result.suggested_service_id, 'up_birth_certificate');
        assert.equal(result.needs_human, true);
        assert.deepEqual(result.sources, []);
        assert.equal(result.guard_reason, 'no_chunks');
      });
    });
  }

  it('does not claim access to live birth-certificate status in English, Hindi, and Hinglish', async () => {
    await offline(async () => {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      for (const [question, language] of [
        ['How can I check the status of my birth certificate application?', 'en'],
        ['जन्म प्रमाण पत्र के आवेदन का स्टेटस कैसे देखें?', 'hi'],
        ['birth certificate application ka status kaise check karun?', 'hinglish']
      ]) {
        const result = await askService({ question, language, skipLlm: true });
        assert.equal(result.suggested_service_id, 'up_birth_certificate');
        assert.equal(result.needs_human, true, question);
        assert.equal(result.guard_reason, 'live_status_unavailable', question);
        assert.deepEqual(result.sources, [], question);
      }
    });
  });

  it('retrieves the domicile certificate information for a short English request', async () => {
    await offline(async () => {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const result = await askService({ question: 'how to get domicile certificate', language: 'en', skipLlm: true });
      assert.equal(result.suggested_service_id, 'up_domicile_certificate');
      assert.ok(result.sources.length > 0);
    });
  });

  it('retrieves a sourced caste checklist while leaving the fee ungraded without generation', async () => {
    await offline(async () => {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const questions = [
        'Is there an application fee for a caste certificate, and where is it listed?',
        'जाति प्रमाण पत्र के आवेदन की फीस कितनी है और इसकी जानकारी कहाँ मिलेगी?',
        'Jati praman patra ki application fees kitni hai aur kahan likhi hai?',
        'Mera caste certificate banwane ke liye kya documents chahiye?'
      ];
      for (const [index, question] of questions.entries()) {
        const result = await askService({ question, language: 'auto', skipLlm: true });
        assert.equal(result.suggested_service_id, 'up_caste_certificate');
        if (index < 3) {
          // skipLlm reports retrieval only; the verified checklist explicitly says
          // that it does not establish a fee, so this cannot count as an answer pass.
          assert.equal(result.answer, 'LLM skipped (--no-llm)');
          assert.ok(result.sources.some((source) => (source.source_url || '').includes('.nic.in')));
          assert.ok(result.sources.every((source) => (source.source_url || '').includes('.nic.in') || (source.source_url || '').includes('services.india.gov.in')));
        } else {
          assert.equal(result.needs_human, false);
          assert.ok(result.sources.some((source) => (source.url || source.source_url || '').includes('chandauli.nic.in')));
          assert.equal(result.answer, 'LLM skipped (--no-llm)');
        }
      }
    });
  });
});

describe('mocked answer generation assembles language and verified evidence', () => {
  it('passes relevant retrieved context and Roman Hindi instructions to the provider prompt', async () => {
    const { buildUserMessage } = await import('../../src/modules/ai/gemini.service.js');
    const prompt = buildUserMessage(
      'birth certificate application ka status kaise check karun?',
      'hinglish',
      [{
        title: 'Birth Certificate', service_id: 'up_birth_certificate',
        topic: 'Online Application', language: 'en',
        text: 'Submit the application and retain the Service Request Number for tracking.'
      }]
    );
    assert.match(prompt, /Service Request Number for tracking/);
    assert.match(prompt, /Hinglish \(Roman Hindi\)/);
    assert.match(prompt, /Do NOT use Devanagari script/);
    assert.match(prompt, /If the context fully answers the question, answer it/);
  });

  it('uses the live-status guard before invoking Groq and escalates missing details', async () => {
    await offline(async () => {
      const groq = await import('../../src/modules/ai/groq.service.js');
      groq._setGroqClient({ chat: { completions: { create: async () => { throw new Error('mock provider unavailable'); } } } });
      try {
        const { askService } = await import('../../src/modules/ai/ai.service.js');
        const result = await askService({
          question: 'birth certificate application ka status kaise check karun?',
          language: 'hinglish'
        });
        assert.equal(result.generation_status, 'guardrail');
        assert.equal(result.needs_human, true);
        assert.equal(result.guard_reason, 'live_status_unavailable');
        assert.match(result.answer, /government system/i);
        assert.doesNotMatch(result.answer, /log in using|select Birth Certificate/);

        const missingDocuments = await askService({
          question: 'What should I do if I do not have the usual documents for birth registration?',
          language: 'en'
        });
        assert.equal(missingDocuments.needs_human, true);
        assert.match(missingDocuments.answer, /other identity proof/);
        assert.match(missingDocuments.answer, /does not explain what to do/);
      } finally {
        groq._setGroqClient(null);
      }
    });
  });
});
