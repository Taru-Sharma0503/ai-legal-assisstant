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
        source_ref: CHUNK_ID
      }
    }]
  };
  const embed = {
    models: {
      embedContent: async () => {
        embeddingCalls += 1;
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
  return { qdrant, embed, db, getEmbeddingCalls: () => embeddingCalls };
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
      assert.equal(result.needs_human, false);
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
});
