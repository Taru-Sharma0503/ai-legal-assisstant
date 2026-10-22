import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildChunks } from '../../src/modules/ai/chunkBuilder.js';
import { aiConfig } from '../../src/config/ai.js';
import * as rag from '../../src/modules/ai/rag.service.js';
import * as gemini from '../../src/modules/ai/gemini.service.js';
import * as groq from '../../src/modules/ai/groq.service.js';
import {
  buildContextualRetrievalQuery,
  createConversationService,
  postMessageService
} from '../../src/modules/ai/ai.service.js';

const userId = 'cybercrime-followup-regression-user';
const hindiQuestion = 'मेरे साथ ऑनलाइन स्कैम हुआ है, मुझे क्या करना चाहिए?';
const hindiEvidenceFollowUp = 'रिपोर्ट करने से पहले मुझे क्या सबूत इकट्ठा करने चाहिए?';

function officialCyberChunks() {
  const filename = 'national_cybercrime_reporting_portal.json';
  const docPath = path.resolve(process.cwd(), 'data/legal', filename);
  const document = JSON.parse(fs.readFileSync(docPath, 'utf8'));
  return buildChunks(document, filename).map((chunk) => ({
    id: chunk.id,
    sourceId: 'ncrp-source',
    text: chunk.text,
    section: chunk.topic,
    region: chunk.state,
    language: chunk.language,
    verified: chunk.verified,
    source: {
      id: 'ncrp-source',
      title: chunk.title,
      department: chunk.department,
      sourceUrl: chunk.source_url,
      sourceType: chunk.source_type,
      verified: true
    }
  }));
}

function setupMocks({ rejectEvidenceHydration = false, unsupportedFollowUp = false } = {}) {
  const sourceRows = officialCyberChunks();
  const chunksById = new Map(sourceRows.map((row) => [row.id, row]));
  const embeddings = [];
  const qdrantCalls = [];
  const hydratedIds = [];
  const prompts = [];
  let retrievalQuery = '';

  rag._setQdrantClient({
    query: async (collection, options) => {
      qdrantCalls.push({ collection, filter: options.filter, query: retrievalQuery });
      if (collection === 'legal_rights_chunks') {
        if (unsupportedFollowUp && /address|responsible/i.test(retrievalQuery)) return [];
        const evidenceQuestion = /सबूत|evidence|proof|saboot|pramaan/i.test(retrievalQuery);
        const chunkId = evidenceQuestion
          ? 'ncrp_preserve_evidence_and_financial_fraud'
          : 'cybercrime_portal_reporting';
        return [{
          score: 0.74,
          payload: { chunk_id: chunkId, source_id: 'ncrp-source', source_ref: chunkId, verified: true, knowledge_domain: 'legal_rights' }
        }];
      }
      return [];
    }
  });
  rag._setEmbedClient({ models: { embedContent: async ({ contents }) => {
    retrievalQuery = contents[0];
    embeddings.push(retrievalQuery);
    return { embeddings: [{ values: [0.1] }] };
  } } });
  rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async ({ where }) => {
    assert.ok(Array.isArray(where.id.in), 'hydration queries only the chunk IDs returned by Qdrant');
    let rows = where.id.in.map((id) => chunksById.get(id)).filter(Boolean);
    if (rejectEvidenceHydration) {
      rows = rows.map((row) => row.id === 'ncrp_preserve_evidence_and_financial_fraud'
        ? { ...row, verified: false }
        : row);
    }
    hydratedIds.push(rows.map((row) => row.id));
    return rows;
  } } });
  gemini._setGeminiClient({ models: { generateContent: async ({ contents }) => {
    prompts.push(contents[0]);
    return { text: 'Keep the transaction ID, date, amount, messages, emails, screenshots, and bank records.' };
  } } });
  groq._setGroqClient(false);

  return { embeddings, qdrantCalls, hydratedIds, prompts };
}

function resetMocks() {
  rag._setQdrantClient(null);
  rag._setEmbedClient(null);
  rag._setKnowledgeDbClient(null);
  gemini._setGeminiClient(null);
  groq._setGroqClient(null);
}

describe('contextual cybercrime follow-up retrieval', () => {
  it('contextualizes English, Hindi and Hinglish follow-ups without changing user text', () => {
    assert.equal(rag.isLegalQuestion(hindiEvidenceFollowUp), false,
      'the isolated Hindi evidence question has no cybercrime terms for legal routing');
    assert.equal(rag.detectService(hindiEvidenceFollowUp), null,
      'the isolated Hindi evidence question does not identify a citizen service');
    const histories = [
      ['I was scammed online. What should I do?', 'What evidence should I keep before reporting it?'],
      [hindiQuestion, hindiEvidenceFollowUp],
      ['Mere saath online scam hua hai, ab kya karun?', 'Report se pehle kaunse saboot collect karun?'],
      [hindiQuestion, 'मैं इस धोखाधड़ी की रिपोर्ट कहाँ करूँ?'],
      [hindiQuestion, 'क्या मुझे अपने बैंक को भी सूचित करना चाहिए?']
    ];

    for (const [topic, followUp] of histories) {
      const messages = [
        { sender: 'USER', content: topic },
        { sender: 'AI', content: 'Earlier assistant wording is context only, not evidence.' }
      ];
      const contextualQuery = buildContextualRetrievalQuery(followUp, messages);
      assert.notEqual(contextualQuery, followUp, followUp);
      assert.match(contextualQuery, /Follow-up:/, followUp);
      assert.ok(contextualQuery.includes(topic), followUp);
      assert.ok(!contextualQuery.includes('Earlier assistant wording'), 'assistant output must not be promoted into retrieval evidence');
    }

    const changedTopic = 'How do I apply for an income certificate?';
    assert.equal(buildContextualRetrievalQuery(changedTopic, [
      { sender: 'USER', content: hindiQuestion }
    ]), changedTopic);
    assert.equal(buildContextualRetrievalQuery(
      'Mere saath online scam hua hai. Mujhe kya karna chahiye?',
      [{ sender: 'USER', content: 'How can I apply for an income certificate?' }]
    ), 'Mere saath online scam hua hai. Mujhe kya karna chahiye?',
    'a new online-scam report must replace the preceding certificate topic');
    assert.equal(buildContextualRetrievalQuery(hindiEvidenceFollowUp, []), hindiEvidenceFollowUp,
      'a fresh conversation cannot inherit a topic from another conversation');
  });

  it('retains the last named topic through chained follow-ups and immediate-danger questions', () => {
    const chains = [
      {
        topic: 'How can I apply for an income certificate?',
        middle: 'What documents should I prepare before filling out the application?',
        latest: 'Does the application require Aadhaar OTP verification?'
      },
      {
        topic: hindiQuestion,
        middle: hindiEvidenceFollowUp,
        latest: 'क्या मुझे अपने बैंक को भी सूचित करना चाहिए?'
      },
      {
        topic: 'Someone is experiencing domestic violence. What should they do?',
        middle: 'What support is available?',
        latest: 'If the person is in immediate danger, what should they do first?'
      }
    ];
    for (const chain of chains) {
      const history = [
        { sender: 'USER', content: chain.topic },
        { sender: 'AI', content: 'Assistant response is context only.' },
        { sender: 'USER', content: chain.middle },
        { sender: 'AI', content: 'Another assistant response is context only.' }
      ];
      const query = buildContextualRetrievalQuery(chain.latest, history);
      assert.ok(query.includes(chain.topic), query);
      assert.ok(query.includes(chain.latest), query);
      assert.doesNotMatch(query, /Assistant response is context only/);
    }

    const explicitTopicChange = 'How do I apply for an income certificate?';
    assert.equal(buildContextualRetrievalQuery(explicitTopicChange, [
      { sender: 'USER', content: hindiQuestion },
      { sender: 'USER', content: hindiEvidenceFollowUp }
    ]), explicitTopicChange);
  });

  it('retrieves relevant verified sources for Hindi, English and Hinglish two-turn conversations', async () => {
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    const originalThreshold = process.env.SIMILARITY_THRESHOLD;
    const originalProvider = process.env.LLM_PROVIDER;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    process.env.SIMILARITY_THRESHOLD = '0.30';
    process.env.LLM_PROVIDER = 'gemini';
    const trace = setupMocks();
    try {
      const pairs = [
        { topic: hindiQuestion, followUp: hindiEvidenceFollowUp, language: 'hi', expectedChunk: 'ncrp_preserve_evidence_and_financial_fraud' },
        { topic: 'I was scammed online. What should I do?', followUp: 'What evidence should I keep before reporting it?', language: 'en', expectedChunk: 'ncrp_preserve_evidence_and_financial_fraud' },
        { topic: 'Mere saath online scam hua hai, ab kya karun?', followUp: 'Report se pehle kaunse saboot collect karun?', language: 'hinglish', expectedChunk: 'ncrp_preserve_evidence_and_financial_fraud' },
        { topic: hindiQuestion, followUp: 'मैं इस धोखाधड़ी की रिपोर्ट कहाँ करूँ?', language: 'hi', expectedChunk: 'cybercrime_portal_reporting' },
        { topic: hindiQuestion, followUp: 'क्या मुझे अपने बैंक को भी सूचित करना चाहिए?', language: 'hi', expectedChunk: 'cybercrime_portal_reporting' }
      ];

      for (const [index, pair] of pairs.entries()) {
        const conversation = await createConversationService(`${userId}-${index}`, { language: pair.language });
        const first = await postMessageService(`${userId}-${index}`, conversation.conversationId, {
          question: pair.topic, language: pair.language
        });
        assert.equal(first.needsHuman, false, pair.topic);

        const result = await postMessageService(`${userId}-${index}`, conversation.conversationId, {
          question: pair.followUp, language: pair.language
        });
        const secondCallIndex = index * 2 + 1;
        const secondCall = trace.qdrantCalls[secondCallIndex];
        assert.equal(secondCall.collection, 'legal_rights_chunks', pair.followUp);
        assert.deepEqual(secondCall.filter.must, [
          { key: 'state', match: { value: 'Uttar Pradesh' } },
          { key: 'verified', match: { value: true } },
          { key: 'knowledge_domain', match: { value: 'legal_rights' } }
        ], pair.followUp);
        assert.match(secondCall.query, new RegExp(pair.topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(secondCall.query, new RegExp(pair.followUp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.deepEqual(trace.hydratedIds[secondCallIndex], [pair.expectedChunk]);
        assert.equal(result.needsHuman, false, pair.followUp);
        assert.equal(result.sources.length, 1, pair.followUp);
        assert.equal(result.sources[0].sourceUrl.startsWith('https://cybercrime.gov.in/'), true);
        assert.match(trace.prompts[secondCallIndex], new RegExp(`User question: ${pair.followUp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        assert.doesNotMatch(result.answer, /eDistrict/i);
        assert.equal(secondCall.filter.must.some((item) => item.key === 'service_id'), false);
        if (pair.expectedChunk === 'ncrp_preserve_evidence_and_financial_fraud') {
          assert.match(trace.prompts[secondCallIndex], /transaction ID or UTR, transaction date, and amount/);
          assert.equal(result.sources[0].sourceUrl, 'https://cybercrime.gov.in/Webform/Crime_AuthoLogin.aspx');
        }
      }
    } finally {
      resetMocks();
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK; else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
      if (originalThreshold === undefined) delete process.env.SIMILARITY_THRESHOLD; else process.env.SIMILARITY_THRESHOLD = originalThreshold;
      if (originalProvider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = originalProvider;
    }
  });

  it('does not answer from unverified or absent evidence, and does not leak topics across conversations', async () => {
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    const originalProvider = process.env.LLM_PROVIDER;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    process.env.LLM_PROVIDER = 'gemini';

    const unverifiedTrace = setupMocks({ rejectEvidenceHydration: true });
    try {
      const conversation = await createConversationService(`${userId}-unverified`, { language: 'hi' });
      await postMessageService(`${userId}-unverified`, conversation.conversationId, { question: hindiQuestion, language: 'hi' });
      const result = await postMessageService(`${userId}-unverified`, conversation.conversationId, { question: hindiEvidenceFollowUp, language: 'hi' });
      assert.equal(unverifiedTrace.qdrantCalls[1].collection, 'legal_rights_chunks');
      assert.deepEqual(unverifiedTrace.hydratedIds[1], ['ncrp_preserve_evidence_and_financial_fraud']);
      assert.equal(result.needsHuman, true);
      assert.deepEqual(result.sources, []);
    } finally {
      resetMocks();
    }

    const unsupportedTrace = setupMocks({ unsupportedFollowUp: true });
    try {
      const conversation = await createConversationService(`${userId}-unsupported`, { language: 'en' });
      await postMessageService(`${userId}-unsupported`, conversation.conversationId, { question: 'I was scammed online. What should I do?', language: 'en' });
      const result = await postMessageService(`${userId}-unsupported`, conversation.conversationId, { question: 'Who exactly is responsible and what is their address?', language: 'en' });
      assert.equal(unsupportedTrace.qdrantCalls[1].collection, 'legal_rights_chunks');
      assert.equal(result.needsHuman, true);
      assert.deepEqual(result.sources, []);
    } finally {
      resetMocks();
    }

    const isolatedTrace = setupMocks({ unsupportedFollowUp: true });
    try {
      const fresh = await createConversationService(`${userId}-isolated`, { language: 'hi' });
      const result = await postMessageService(`${userId}-isolated`, fresh.conversationId, { question: hindiEvidenceFollowUp, language: 'hi' });
      assert.equal(isolatedTrace.embeddings[0], hindiEvidenceFollowUp);
      assert.notEqual(isolatedTrace.qdrantCalls[0].collection, 'legal_rights_chunks');
      assert.equal(result.needsHuman, true);
      assert.deepEqual(result.sources, []);
    } finally {
      resetMocks();
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK; else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
      if (originalProvider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = originalProvider;
    }
  });

  it('allows an explicit income-certificate topic change to select citizen-service routing', async () => {
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    const currentQuestion = 'How do I apply for an income certificate?';
    const query = buildContextualRetrievalQuery(currentQuestion, [
      { sender: 'USER', content: hindiQuestion }
    ]);
    const calls = [];
    rag._setQdrantClient({ query: async (collection, options) => {
      calls.push({ collection, filter: options.filter });
      return [];
    } });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    try {
      await rag.retrieve(query);
      assert.equal(calls[0].collection, aiConfig.qdrant.collection);
      assert.ok(calls[0].filter.must.some((item) => item.key === 'service_id' && item.match.value === 'up_income_certificate'));
      assert.equal(calls[0].filter.must.some((item) => item.key === 'knowledge_domain'), false);
    } finally {
      rag._setQdrantClient(null);
      rag._setEmbedClient(null);
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK; else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });

  it('safely handles OTP sharing offers and certificate live-status requests in all three languages', async () => {
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    rag._setQdrantClient(false);
    rag._setEmbedClient(false);
    try {
      const credentialOffers = [
        { question: 'Can I send you my Aadhaar OTP so you can finish my application?', language: 'en' },
        { question: 'क्या मैं आपको अपना आधार ओटीपी भेज दूँ ताकि आप आवेदन पूरा कर दें?', language: 'hi' },
        { question: 'Kya main aapko apna Aadhaar OTP bhej sakta hoon?', language: 'hinglish' }
      ];
      for (const input of credentialOffers) {
        const result = await (await import('../../src/modules/ai/ai.service.js')).askService(input);
        assert.equal(result.guard_reason, 'sensitive_credential_offer', input.question);
        assert.equal(result.needs_human, true, input.question);
        assert.deepEqual(result.sources, [], input.question);
        assert.equal(result.retrieval_source, null, input.question);
      }

      const unsupportedTimes = [
        { question: 'Exactly how many days will approval take for an income certificate?', language: 'en' },
        { question: 'Income certificate approve hone mein exactly kitne din lagenge?', language: 'hinglish' },
        { question: 'मेरा आय प्रमाण पत्र स्वीकृत होने में ठीक कितने दिन लगेंगे?', language: 'hi' }
      ];
      for (const input of unsupportedTimes) {
        const result = await (await import('../../src/modules/ai/ai.service.js')).askService(input);
        assert.equal(result.guard_reason, 'unknown_field', input.question);
        assert.equal(result.needs_human, true, input.question);
        assert.deepEqual(result.sources, [], input.question);
      }

      const statusRequests = [
        { question: 'Can you access the government system and check the live status of my caste certificate application?', language: 'en', service: 'up_caste_certificate' },
        { question: 'क्या आप सरकारी प्रणाली में जाकर मेरे जाति प्रमाण पत्र के आवेदन की वर्तमान स्थिति जाँच सकते हैं?', language: 'hi', service: 'up_caste_certificate' },
        { question: 'Kya aap government system me mera caste certificate application ka live status check kar sakte ho?', language: 'hinglish', service: 'up_caste_certificate' }
      ];
      for (const input of statusRequests) {
        const result = await (await import('../../src/modules/ai/ai.service.js')).askService(input);
        assert.equal(result.guard_reason, 'live_status_unavailable', input.question);
        assert.equal(result.needs_human, true, input.question);
        assert.equal(result.suggested_service_id, input.service, input.question);
        assert.deepEqual(result.sources, [], input.question);
      }
    } finally {
      resetMocks();
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK; else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });
});
