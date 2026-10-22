import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SOURCE_ID = 'source-income-test';
const CHUNK_ID = 'chunk-income-test';

function setupRetrievalMocks() {
  let embeddingCalls = 0;
  const qdrant = {
    query: async () => [{
      id: 'qdrant-point',
      score: 0.9,
      payload: {
        chunk_id: CHUNK_ID,
        source_id: SOURCE_ID,
        service_id: 'up_income_certificate',
        source_ref: CHUNK_ID,
        verified: true,
        state: 'Uttar Pradesh',
        text: 'Income Certificate requires an applicant photo.'
      }
    }]
  };
  const embed = {
    models: {
      embedContent: async ({ contents }) => {
        embeddingCalls += 1;
        retrievalQueries.push(contents[0]);
        return { embeddings: [{ values: [0.1, 0.2, 0.3] }] };
      }
    }
  };
  const db = {
    knowledgeChunk: {
      findMany: async () => [{
        id: CHUNK_ID,
        sourceId: SOURCE_ID,
        text: 'Income Certificate requires an applicant photo.',
        section: 'Required Documents',
        language: 'en',
        region: 'Uttar Pradesh',
        verified: true,
        source: {
          id: SOURCE_ID,
          title: 'Income Certificate',
          sourceUrl: 'https://edistrict.up.gov.in',
          department: 'Government of Uttar Pradesh',
          sourceType: 'official_government_portal',
          verified: true
        }
      }]
    }
  };
  const retrievalQueries = [];
  return { qdrant, embed, db, getEmbeddingCalls: () => embeddingCalls, retrievalQueries };
}

function successfulGroq(content = 'Groq answer') {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content } }] })
      }
    }
  };
}

async function installMocks({ gemini, groq }) {
  const rag = await import('../../src/modules/ai/rag.service.js');
  const geminiService = await import('../../src/modules/ai/gemini.service.js');
  const groqService = await import('../../src/modules/ai/groq.service.js');
  const retrieval = setupRetrievalMocks();
  rag._setQdrantClient(retrieval.qdrant);
  rag._setEmbedClient(retrieval.embed);
  rag._setKnowledgeDbClient(retrieval.db);
  geminiService._setGeminiClient(gemini);
  groqService._setGroqClient(groq);
  return {
    ...retrieval,
    reset() {
      rag._setQdrantClient(null);
      rag._setEmbedClient(null);
      rag._setKnowledgeDbClient(null);
      geminiService._setGeminiClient(null);
      groqService._setGroqClient(null);
    }
  };
}

async function askIncomeCertificate() {
  const { askService } = await import('../../src/modules/ai/ai.service.js');
  return askService({
    question: 'What documents are required for an income certificate in UP?',
    language: 'en'
  });
}

describe('generation provider routing', () => {
  it('shares statutory-term preservation instructions across Gemini and Groq prompts', async () => {
    const geminiService = await import('../../src/modules/ai/gemini.service.js');
    const groqService = await import('../../src/modules/ai/groq.service.js');
    const context = [{
      topic: 'Article 23(1)', language: 'en',
      text: 'Article 23(1) prohibits trafficking in human beings, begar and other similar forms of forced labour.'
    }];
    let geminiPrompt;
    let groqMessages;
    geminiService._setGeminiClient({ models: { generateContent: async ({ contents }) => {
      geminiPrompt = contents[0];
      return { text: 'बेगार एक प्रकार का बलात् श्रम है।' };
    } } });
    groqService._setGroqClient({ chat: { completions: { create: async ({ messages }) => {
      groqMessages = messages;
      return { choices: [{ message: { content: 'Begar is a form of forced labour.' } }] };
    } } } });
    try {
      await geminiService.generateWithGemini('What is begar?', 'hi', context);
      await groqService.generateWithGroq('What is begar?', 'hi', context);

      const sharedRules = geminiService.SYSTEM_PROMPT;
      assert.equal(groqMessages[0].content, sharedRules);
      assert.match(sharedRules, /begar/i);
      assert.ok(sharedRules.includes('बेगार'));
      assert.ok(sharedRules.includes('बेघर'));
      assert.match(sharedRules, /only when the supplied\s+context explicitly supports that relationship/i);
      assert.match(sharedRules, /preserve the\s+original term rather than guessing/i);
      assert.ok(geminiPrompt.includes('begar and other similar forms of forced labour'));
      assert.ok(groqMessages[1].content.includes('begar and other similar forms of forced labour'));
    } finally {
      geminiService._setGeminiClient(null);
      groqService._setGroqClient(null);
    }
  });

  it('keeps follow-up retrieval context out of generation intent for both providers', async () => {
    const gemini = await import('../../src/modules/ai/gemini.service.js');
    const groq = await import('../../src/modules/ai/groq.service.js');
    const evidence = [{ topic: 'Income Certificate', language: 'en', text: 'Required documents: Passport Size Photograph, Self-Certified Declaration Form, and income proof. Aadhaar mobile OTP authentication (e-KYC) is used in the online application process. Apply on eDistrict, submit the form, and pay the application fee of ₹30.' }];
    const cases = [
      { latest: 'Is Aadhaar verification mentioned in the income-certificate process?', retrieval: 'Which documents are listed for an income certificate? Is Aadhaar verification mentioned in the income-certificate process?', intent: 'Give a direct yes/no answer first', language: 'en' },
      { latest: 'Is Aadhaar verification mentioned in the income-certificate process?', retrieval: 'income certificate', intent: 'Give a direct yes/no answer first', language: 'en' },
      { latest: 'What is the application fee?', retrieval: 'How do I apply for an income certificate? What is the application fee?', intent: 'State the requested fee or fact directly', language: 'en' },
      { latest: 'क्या आय प्रमाणपत्र की प्रक्रिया में आधार सत्यापन का उल्लेख है?', retrieval: 'आय प्रमाणपत्र के दस्तावेज़ कौन से हैं? क्या आय प्रमाणपत्र की प्रक्रिया में आधार सत्यापन का उल्लेख है?', intent: 'Give a direct yes/no answer first', language: 'hi' },
      { latest: 'Which documents are listed for an income certificate?', retrieval: 'Which documents are listed for an income certificate?', intent: 'Return only the requested, verified documents', language: 'en' },
      { latest: 'How do I apply for an income certificate?', retrieval: 'How do I apply for an income certificate?', intent: 'Give the necessary verified application steps', language: 'en' }
    ];

    for (const provider of ['gemini', 'groq']) {
      for (const item of cases) {
        let captured = '';
        const answer = item.intent.startsWith('Give a direct yes')
          ? item.language === 'hi' ? 'हाँ, प्रक्रिया में आधार मोबाइल OTP प्रमाणीकरण (e-KYC) का उल्लेख है।' : 'Yes. The process mentions Aadhaar mobile OTP authentication (e-KYC).'
          : item.intent.startsWith('Return')
            ? 'Required documents: Passport Size Photograph, Self-Certified Declaration Form, and income proof.'
            : item.intent.startsWith('Give the necessary')
              ? '1. Apply on eDistrict. 2. Submit the form and pay the stated fee.'
              : 'The application fee is ₹30.';
        if (provider === 'gemini') {
          gemini._setGeminiClient({ models: { generateContent: async ({ contents }) => { captured = contents[0]; return { text: answer }; } } });
        } else {
          groq._setGroqClient({ chat: { completions: { create: async ({ messages }) => { captured = messages[1].content; return { choices: [{ message: { content: answer } }] }; } } } });
        }
        const result = provider === 'gemini'
          ? await gemini.generateWithGemini(item.latest, item.language, evidence)
          : await groq.generateWithGroq(item.latest, item.language, evidence);
        assert.match(captured, new RegExp(item.intent, 'i'), `${provider}: ${item.latest}`);
        if (item.retrieval !== item.latest) {
          const earlierQuestion = item.retrieval.replace(item.latest, '').trim();
          if (earlierQuestion) assert.ok(!captured.includes(earlierQuestion), 'retrieval history must not be passed to generation');
        }
        assert.ok(captured.includes(item.latest));
        assert.ok(!captured.includes('conversation history'));
        assert.equal(result.answer, answer);
        if (item.intent.startsWith('Give a direct yes')) assert.match(result.answer, /^(Yes|हाँ)/);
        if (item.latest.startsWith('Which documents')) assert.match(result.answer, /Passport Size Photograph.*Self-Certified Declaration Form.*income proof/);
        if (item.latest.startsWith('How do I apply')) assert.match(result.answer, /1\./);
      }
    }
    gemini._setGeminiClient(null);
    groq._setGroqClient(null);
  });

  it('uses the latest question for generation while retaining follow-up context for retrieval', async () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    for (const provider of ['gemini', 'groq']) {
      process.env.LLM_PROVIDER = provider;
      let prompt = '';
      const answer = 'Yes. The process mentions Aadhaar mobile OTP authentication (e-KYC).';
      const mocks = await installMocks({
        gemini: { models: { generateContent: async ({ contents }) => { prompt = contents[0]; return { text: answer }; } } },
        groq: { chat: { completions: { create: async ({ messages }) => { prompt = messages[1].content; return { choices: [{ message: { content: answer } }] }; } } } }
      });
      try {
        const { askService } = await import('../../src/modules/ai/ai.service.js');
        const latest = 'Is Aadhaar verification mentioned in the income-certificate process?';
        const retrieval = 'Which documents are listed for an income certificate? ' + latest;
        const result = await askService({ question: latest, retrievalQuestion: retrieval, language: 'en' });
        assert.equal(result.needs_human, true);
        assert.equal(result.guard_reason, 'no_chunks');
        assert.deepEqual(result.sources, []);
        assert.doesNotMatch(result.answer, /OTP (?:is )?required/i);
        assert.equal(prompt, '', 'unsupported legacy evidence must not reach generation');
        assert.equal(mocks.retrievalQueries.at(-1), retrieval);
      } finally {
        mocks.reset();
      }
    }
    if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalProvider;
    if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
    else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
  });

  it('reproduces the hyphenated income-certificate checklist then Aadhaar follow-up sequence', async () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    for (const provider of ['gemini', 'groq']) {
      process.env.LLM_PROVIDER = provider;
      const prompts = [];
      const mocks = await installMocks({
        gemini: { models: { generateContent: async ({ contents }) => {
          prompts.push(contents[0]);
          return { text: prompts.length === 1
            ? 'Required documents: Passport Size Photograph, Self-Certified Declaration Form, and income proof.'
            : 'Yes. The income-certificate process mentions Aadhaar mobile OTP authentication (e-KYC) for the online application.' };
        } } },
        groq: { chat: { completions: { create: async ({ messages }) => {
          prompts.push(messages[1].content);
          return { choices: [{ message: { content: prompts.length === 1
            ? 'Required documents: Passport Size Photograph, Self-Certified Declaration Form, and income proof.'
            : 'Yes. The income-certificate process mentions Aadhaar mobile OTP authentication (e-KYC) for the online application.' } }] };
        } } } }
      });
      try {
        const { createConversationService, postMessageService } = await import('../../src/modules/ai/ai.service.js');
        const conversation = await createConversationService(`rag-followup-${provider}`, { language: 'en' });
        const first = await postMessageService(`rag-followup-${provider}`, conversation.conversationId, {
          question: 'Which documents are listed for an income certificate?'
        });
        const followup = await postMessageService(`rag-followup-${provider}`, conversation.conversationId, {
          question: 'Is Aadhaar verification mentioned in the income-certificate process?'
        });
        assert.match(first.answer, /Passport Size Photograph.*Self-Certified Declaration Form.*income proof/);
        assert.equal(followup.needsHuman, true);
        assert.deepEqual(followup.sources, []);
        assert.doesNotMatch(followup.answer, /OTP (?:is )?required/i);
        assert.equal(prompts.length, 1, 'follow-up without eligible Aadhaar evidence must not reach generation');
        assert.equal(mocks.retrievalQueries[1], 'Which documents are listed for an income certificate?. Is Aadhaar verification mentioned in the income-certificate process?');
      } finally {
        mocks.reset();
      }
    }
    if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalProvider;
    if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
    else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
  });

  it('uses Groq directly when LLM_PROVIDER=groq and still uses Gemini embeddings', async () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.LLM_PROVIDER = 'groq';
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    let geminiGenerationCalls = 0;
    let groqCalls = 0;
    const mocks = await installMocks({
      gemini: { models: { generateContent: async () => { geminiGenerationCalls += 1; } } },
      groq: {
        chat: { completions: { create: async () => {
          groqCalls += 1;
          return { choices: [{ message: { content: 'Groq direct answer' } }] };
        } } }
      }
    });
    try {
      const result = await askIncomeCertificate();
      assert.equal(result.generation_status, 'groq');
      assert.equal(geminiGenerationCalls, 0);
      assert.equal(groqCalls, 1);
      assert.equal(mocks.getEmbeddingCalls(), 1);
      assert.equal(result.sources[0].id, SOURCE_ID);
      assert.equal(result.sources[0].source_url, 'https://edistrict.up.gov.in');
    } finally {
      mocks.reset();
      if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = originalProvider;
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });

  it('uses Gemini generation when LLM_PROVIDER=gemini', async () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.LLM_PROVIDER = 'gemini';
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    let geminiCalls = 0;
    let groqCalls = 0;
    const mocks = await installMocks({
      gemini: { models: { generateContent: async () => {
        geminiCalls += 1;
        return { text: 'Gemini answer' };
      } } },
      groq: {
        chat: { completions: { create: async () => {
          groqCalls += 1;
          return { choices: [{ message: { content: 'Unexpected Groq answer' } }] };
        } } }
      }
    });
    try {
      const result = await askIncomeCertificate();
      assert.equal(result.generation_status, 'gemini');
      assert.equal(geminiCalls, 1);
      assert.equal(groqCalls, 0);
    } finally {
      mocks.reset();
      if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = originalProvider;
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });

  it('uses Gemini when selected and falls back to Groq after a transient failure', async () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.LLM_PROVIDER = 'gemini';
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    let geminiCalls = 0;
    let groqCalls = 0;
    const mocks = await installMocks({
      gemini: { models: { generateContent: async () => {
        geminiCalls += 1;
        const error = new Error('temporary outage');
        error.status = 503;
        throw error;
      } } },
      groq: {
        chat: { completions: { create: async () => {
          groqCalls += 1;
          return { choices: [{ message: { content: 'Groq fallback answer' } }] };
        } } }
      }
    });
    try {
      const result = await askIncomeCertificate();
      assert.equal(result.generation_status, 'groq');
      assert.equal(geminiCalls, 1);
      assert.equal(groqCalls, 1);
    } finally {
      mocks.reset();
      if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = originalProvider;
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });

  it('uses grounded chunk fallback after provider timeouts without live API calls', async () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.LLM_PROVIDER = 'gemini';
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    let geminiCalls = 0;
    let groqCalls = 0;
    const mocks = await installMocks({
      gemini: { models: { generateContent: async () => {
        geminiCalls += 1;
        const error = new Error('request timed out');
        error.code = 'ETIMEDOUT';
        throw error;
      } } },
      groq: { chat: { completions: { create: async () => {
        groqCalls += 1;
        const error = new Error('provider timeout');
        error.code = 'ETIMEDOUT';
        throw error;
      } } } }
    });
    try {
      const result = await askIncomeCertificate();
      assert.equal(geminiCalls, 1);
      assert.equal(groqCalls, 1);
      assert.equal(result.generation_status, 'fallback');
      assert.equal(result.needs_human, true);
      assert.match(result.answer, /Income Certificate requires an applicant photo/);
      assert.equal(result.sources[0].source_url, 'https://edistrict.up.gov.in');
    } finally {
      mocks.reset();
      if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = originalProvider;
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });

  it('does not retry Gemini after a quota response during its cooldown', async () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.LLM_PROVIDER = 'auto';
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    let geminiCalls = 0;
    let groqCalls = 0;
    const mocks = await installMocks({
      gemini: { models: { generateContent: async () => {
        geminiCalls += 1;
        const error = new Error('quota exhausted');
        error.status = 429;
        throw error;
      } } },
      groq: {
        chat: { completions: { create: async () => {
          groqCalls += 1;
          return { choices: [{ message: { content: 'Groq answer' } }] };
        } } }
      }
    });
    try {
      await askIncomeCertificate();
      await askIncomeCertificate();
      assert.equal(geminiCalls, 1);
      assert.equal(groqCalls, 2);
    } finally {
      mocks.reset();
      if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = originalProvider;
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });

  it('passes exact Hinglish language prompt instructions to LLM provider (Gemini & Groq)', async () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';

    for (const provider of ['gemini', 'groq']) {
      process.env.LLM_PROVIDER = provider;
      let capturedPrompt = '';
      const mocks = await installMocks({
        gemini: { models: { generateContent: async ({ contents }) => {
          capturedPrompt = contents[0];
          return { text: 'Aapko income certificate ke liye photo chahiye.' };
        } } },
        groq: { chat: { completions: { create: async ({ messages }) => {
          capturedPrompt = messages[1].content;
          return { choices: [{ message: { content: 'Aapko income certificate ke liye photo chahiye.' } }] };
        } } } }
      });

      try {
        const { askService } = await import('../../src/modules/ai/ai.service.js');
        const res = await askService({
          question: 'What documents are required for income certificate?',
          language: 'hinglish'
        });

        assert.equal(res.language_used, 'hinglish');
        assert.equal(res.answer, 'Aapko income certificate ke liye photo chahiye.');
        assert.match(capturedPrompt, /OUTPUT LANGUAGE: HINGLISH ONLY/);
        assert.match(capturedPrompt, /Roman\/Latin script/);
        assert.match(capturedPrompt, /Do NOT use Devanagari script/);
      } finally {
        mocks.reset();
      }
    }

    if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalProvider;
    if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
    else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
  });

  it('uses Roman Hindi in fallback path when language is hinglish and providers fail', async () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.LLM_PROVIDER = 'auto';
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';

    const mocks = await installMocks({
      gemini: { models: { generateContent: async () => { throw new Error('Gemini offline'); } } },
      groq: { chat: { completions: { create: async () => { throw new Error('Groq offline'); } } } }
    });

    try {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const res = await askService({
        question: 'What documents are required for an income certificate in UP?',
        language: 'hinglish'
      });

      assert.equal(res.generation_status, 'fallback');
      assert.ok(['groq_generation_failed', 'all_generation_providers_failed'].includes(res.generation_fallback_reason));
      assert.equal(res.language_used, 'hinglish');
      assert.match(res.answer, /Automatic answer generate nahi ho saka/);
      assert.equal(res.needs_human, true);

    } finally {
      mocks.reset();
      if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = originalProvider;
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });
});
