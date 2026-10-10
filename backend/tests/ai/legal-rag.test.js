import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { aiConfig } from '../../src/config/ai.js';
import { buildChunks } from '../../src/modules/ai/chunkBuilder.js';

describe('legal knowledge routing', () => {
  it('detects legal questions in English, Hindi and Hinglish', async () => {
    const { isLegalQuestion } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(isLegalQuestion('What are my fundamental rights?'), true);
    assert.equal(isLegalQuestion('What should I do if the police refuse to record information about a cognizable offence in Uttar Pradesh?'), true);
    assert.equal(isLegalQuestion('\u0928\u093f\u0903\u0936\u0941\u0932\u094d\u0915 \u0935\u093f\u0927\u093f\u0915 \u0938\u0939\u093e\u092f\u0924\u093e \u092a\u093e\u0928\u0947 \u0915\u0940 \u092a\u093e\u0924\u094d\u0930\u0924\u093e \u0915\u094d\u092f\u093e \u0939\u0948?'), true);
    assert.equal(isLegalQuestion('\u0915\u093e\u0928\u0942\u0928\u0940 \u0938\u0939\u093e\u092f\u0924\u093e \u0915\u0947 \u0932\u093f\u090f \u0915\u094c\u0928 \u092a\u093e\u0924\u094d\u0930 \u0939\u0948?'), true);
    assert.equal(isLegalQuestion('\u092e\u0941\u092b\u094d\u0924 \u0915\u093e\u0928\u0942\u0928\u0940 \u0938\u0939\u093e\u092f\u0924\u093e \u0915\u0948\u0938\u0947 \u092e\u093f\u0932\u0924\u0940 \u0939\u0948?'), true);
    assert.equal(isLegalQuestion('What does Article 21 protect?'), true);
    assert.equal(isLegalQuestion('मौलिक अधिकार क्या हैं?'), true);
    assert.equal(isLegalQuestion('Free legal aid ke liye kaise apply karun?'), true);
    for (const question of [
      'What should I do if police refuse to register my FIR?',
      'क्या पुलिस मेरी FIR दर्ज नहीं कर रही है?',
      'Police meri FIR nahi likh rahi, kya karun?',
      'How can I get help for domestic violence?',
      'बच्चों की सुरक्षा के लिए शिकायत कहाँ करें?',
      'Bachchon ki safety ke liye report kaise karun?',
      'How do I report online cyber fraud?',
      'ऑनलाइन धोखाधड़ी की शिकायत कहाँ करूँ?',
      'Online thagi ho gayi, complaint kaise karun?',
      'Someone stole money through an online fraud. How should i report it?',
      'Someone stole money through an online payment fraud. How should they report it in India?',
      '\u0911\u0928\u0932\u093e\u0907\u0928 \u0927\u094b\u0916\u093e\u0927\u0921\u093c\u0940 \u092e\u0947\u0902 \u092e\u0947\u0930\u0947 \u092a\u0948\u0938\u0947 \u091a\u094b\u0930\u0940 \u0939\u094b \u0917\u090f, \u0915\u0939\u093e\u0901 \u0930\u093f\u092a\u094b\u0930\u094d\u091f \u0915\u0930\u0942\u0901?',
      'Online fraud mein mere paise chori ho gaye, report kaise karun?',
      'How can I complain about a defective product to the consumer helpline?',
      'उपभोक्ता शिकायत कहाँ दर्ज करूँ?',
      'Consumer complaint kaise file karun?'
    ]) assert.equal(isLegalQuestion(question), true, question);
    assert.equal(isLegalQuestion('How do I apply for a birth certificate?'), false);
    assert.equal(isLegalQuestion('What time does the police station open?'), false);
    assert.equal(isLegalQuestion('What is the helpline number for a bus timetable?'), false);
  });

  it('keeps newly approved official legal sources schema-valid and human-reviewed', () => {
    const legalDir = path.resolve(process.cwd(), 'data/legal');
    const files = [
      'bnss_2023_police_procedure.json', 'pwdva_2005_women_protection.json',
      'pocso_2012_reporting.json', 'juvenile_justice_2015_child_protection.json',
      'women_helpline_181.json', 'child_helpline_1098.json',
      'national_cybercrime_reporting_portal.json', 'i4c_cybercrime_reporting_guidance.json',
      'consumer_protection_act_2019.json', 'national_consumer_helpline.json'
    ];
    const ids = new Set();
    for (const file of files) {
      const document = JSON.parse(fs.readFileSync(path.join(legalDir, file), 'utf8'));
      assert.equal(document.knowledge_domain, 'legal_rights', file);
      assert.equal(document.service_metadata.verified, true, file);
      assert.equal(document.service_metadata.review_status, 'human_reviewed', file);
      assert.ok(document.service_metadata.portal_url.startsWith('https://'), file);
      assert.ok(document.vector_db_chunks.length > 0, file);
      for (const authored of document.vector_db_chunks) {
        assert.ok(authored.chunk_id && authored.text, file);
        assert.equal(authored.metadata.verified, true, authored.chunk_id);
        assert.equal(authored.metadata.review_status, 'human_reviewed', authored.chunk_id);
        assert.equal(authored.metadata.source_url, document.service_metadata.portal_url, authored.chunk_id);
        assert.ok(!ids.has(authored.chunk_id), `duplicate chunk id: ${authored.chunk_id}`);
        ids.add(authored.chunk_id);
      }
      const chunks = buildChunks(document, file);
      assert.equal(chunks.length, document.vector_db_chunks.length, file);
      assert.ok(chunks.every((chunk) => chunk.knowledge_domain === 'legal_rights' && chunk.verified === true), file);
    }
  });

  it('routes online financial theft to cybercrime and keeps ordinary complaints on consumer knowledge', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const { filterLegalChunksForQuestion } = await import('../../src/modules/ai/ai.service.js');
    const cyberQuestions = [
      'Someone stole money through an online fraud. How should i report it?',
      'Someone stole money through an online payment fraud. How should they report it in India?',
      '\u0911\u0928\u0932\u093e\u0907\u0928 \u0927\u094b\u0916\u093e\u0927\u0921\u093c\u0940 \u092e\u0947\u0902 \u092e\u0947\u0930\u0947 \u092a\u0948\u0938\u0947 \u091a\u094b\u0930\u0940 \u0939\u094b \u0917\u090f, \u0915\u0939\u093e\u0901 \u0930\u093f\u092a\u094b\u0930\u094d\u091f \u0915\u0930\u0942\u0901?',
      'Online fraud mein mere paise chori ho gaye, report kaise karun?'
    ];
    const calls = [];
    rag._setQdrantClient({ query: async (collection, options) => { calls.push({ collection, options }); return []; } });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    try {
      for (const question of cyberQuestions) {
        assert.equal(rag.isLegalQuestion(question), true, question);
        await rag.retrieve(question);
      }
      const ordinaryComplaint = 'My new phone is defective and the seller refuses a refund.';
      assert.equal(rag.isLegalQuestion(ordinaryComplaint), true);
      await rag.retrieve(ordinaryComplaint);
      assert.deepEqual(calls.map((call) => call.collection), [
        ...cyberQuestions.map(() => 'legal_rights_chunks'), 'legal_rights_chunks'
      ]);

      const candidates = [
        { id: 'nch', topic: 'National Consumer Helpline grievance', title: 'National Consumer Helpline', text: 'Call 1915 for a product complaint.' },
        { id: 'consumer-act', topic: 'Consumer complaint scope', title: 'Consumer Protection Act', text: 'Consumer Commission handles eligible consumer disputes.' },
        { id: 'portal', topic: 'Cybercrime reporting', title: 'National Cyber Crime Reporting Portal', text: 'Report online financial fraud at cybercrime.gov.in or call 1930.' }
      ];
      assert.deepEqual(filterLegalChunksForQuestion(cyberQuestions[0], candidates).map((chunk) => chunk.id), ['portal']);
      assert.deepEqual(filterLegalChunksForQuestion(ordinaryComplaint, candidates).map((chunk) => chunk.id), ['nch', 'consumer-act']);
      assert.deepEqual(filterLegalChunksForQuestion('Someone stole money through an online fraud and NCH did not help; where do I report it?', candidates).map((chunk) => chunk.id), ['portal']);
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null);
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });

  it('routes legal and certificate questions to their separate collections', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const calls = [];
    rag._setQdrantClient({ query: async (collection, opts) => { calls.push({ collection, opts }); return []; } });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    const origFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    try {
      await rag.retrieve('What are fundamental rights?');
      await rag.retrieve('What should I do if police refuse to register my FIR?');
      await rag.retrieve('How can I get help for domestic violence?');
      await rag.retrieve('How do I report online cyber fraud?');
      await rag.retrieve('Consumer complaint kaise file karun?');
      await rag.retrieve('क्या पुलिस मेरी FIR दर्ज नहीं कर रही है?');
      await rag.retrieve('बच्चों की सुरक्षा के लिए शिकायत कहाँ करें?');
      await rag.retrieve('ऑनलाइन धोखाधड़ी की शिकायत कहाँ करूँ?');
      await rag.retrieve('How do I get an income certificate?');
      assert.deepEqual(calls.map((c) => c.collection), [
        'legal_rights_chunks', 'legal_rights_chunks', 'legal_rights_chunks', 'legal_rights_chunks',
        'legal_rights_chunks', 'legal_rights_chunks', 'legal_rights_chunks', 'legal_rights_chunks',
        aiConfig.qdrant.collection
      ]);
      assert.deepEqual(calls[0].opts.filter.must, [
        { key: 'state', match: { value: 'Uttar Pradesh' } },
        { key: 'verified', match: { value: true } },
        { key: 'knowledge_domain', match: { value: 'legal_rights' } }
      ]);
      assert.deepEqual(calls[8].opts.filter.must, [
        { key: 'state', match: { value: 'Uttar Pradesh' } },
        { key: 'verified', match: { value: true } },
        { key: 'service_id', match: { value: 'up_income_certificate' } }
      ]);
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null);
      if (origFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = origFallback;
    }
  });

  it('detects cybercrime reporting questions in English, Hindi and Hinglish and keeps certificate routing separate', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const legalQuestions = [
      'Someone stole money through an online payment fraud. How should they report it in India?',
      'ऑनलाइन पेमेंट फ्रॉड में पैसे चोरी हो गए। भारत में रिपोर्ट कैसे करें?',
      'ऑनलाइन भुगतान धोखाधड़ी में रुपये चोरी हुए, 1930 पर कैसे रिपोर्ट करूँ?',
      'Online payment fraud mein paise chori ho gaye. cybercrime.gov.in par report kaise karun?',
      'Financial cyber fraud hua hai; 1930 par complaint kaise karun?'
    ];
    const calls = [];
    rag._setQdrantClient({ query: async (collection, options) => {
      calls.push({ collection, options });
      return [];
    } });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    try {
      for (const question of legalQuestions) {
        assert.equal(rag.isLegalQuestion(question), true, question);
        await rag.retrieve(question);
      }
      await rag.retrieve('How do I get an income certificate?');

      assert.deepEqual(calls.map(({ collection }) => collection), [
        ...legalQuestions.map(() => 'legal_rights_chunks'),
        aiConfig.qdrant.collection
      ]);
      for (const { options } of calls.slice(0, legalQuestions.length)) {
        assert.ok(options.filter.must.some((condition) =>
          condition.key === 'knowledge_domain' && condition.match.value === 'legal_rights'));
      }
      assert.ok(calls.at(-1).options.filter.must.some((condition) =>
        condition.key === 'service_id' && condition.match.value === 'up_income_certificate'));
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null);
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });

  it('accepts a verified cybercrime reporting result at the configured legal threshold', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const calls = [];
    rag._setQdrantClient({ query: async (collection, options) => {
      calls.push({ collection, options });
      return [{ score: 0.60, payload: { chunk_id: 'cybercrime-portal', source_id: 'cybercrime-source', source_ref: 'cybercrime_portal_reporting' } }];
    } });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async ({ where }) => [{
      id: where.id.in[0], sourceId: 'cybercrime-source',
      text: 'The Government of India National Cyber Crime Reporting Portal at cybercrime.gov.in provides an online channel for cybercrime complaints and directs people affected by online financial fraud to report promptly online or call 1930.',
      section: 'cybercrime_reporting_portal', language: 'en', region: 'Uttar Pradesh', verified: true,
      source: { id: 'cybercrime-source', title: 'National Cyber Crime Reporting Portal', sourceUrl: 'https://cybercrime.gov.in/', verified: true }
    }] } });
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    const originalThreshold = process.env.SIMILARITY_THRESHOLD;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    process.env.SIMILARITY_THRESHOLD = '0.30';
    try {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const result = await askService({
        question: 'Someone stole money through an online payment fraud. How should they report it in India?',
        language: 'en', skipLlm: true
      });

      assert.equal(calls[0].collection, 'legal_rights_chunks');
      assert.equal(result.retrieval_score, 0.60);
      assert.equal(result.needs_human, false);
      assert.equal(result.guard_reason, 'in_scope');
      assert.equal(result.suggested_service_id, null);
      assert.equal(result.sources[0].source_url, 'https://cybercrime.gov.in/');
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null); rag._setKnowledgeDbClient(null);
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
      if (originalThreshold === undefined) delete process.env.SIMILARITY_THRESHOLD;
      else process.env.SIMILARITY_THRESHOLD = originalThreshold;
    }
  });

  it('keeps legal answer context and citations on the question topic', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const { askService, filterLegalChunksForQuestion } = await import('../../src/modules/ai/ai.service.js');
    const rows = [
      { id: 'cyber-portal', sourceId: 'cyber-source', text: 'Report online financial fraud at cybercrime.gov.in or call 1930.', section: 'cybercrime portal', title: 'National Cyber Crime Reporting Portal', sourceUrl: 'https://cybercrime.gov.in/' },
      { id: 'pocso-report', sourceId: 'pocso-source', text: 'Section 19 of the POCSO Act addresses reporting suspected sexual offences against children.', section: 'POCSO reporting', title: 'POCSO Act', sourceUrl: 'https://example.gov/pocso' },
      { id: 'consumer-nch', sourceId: 'consumer-source', text: 'The National Consumer Helpline is a pre-litigation grievance channel; callers may use 1915.', section: 'National Consumer Helpline 1915', title: 'National Consumer Helpline', sourceUrl: 'https://consumerhelpline.gov.in/public/about' },
      { id: 'pwdva-remedy', sourceId: 'pwdva-source', text: 'Under the Protection of Women from Domestic Violence Act, a Magistrate may grant a protection order under section 18.', section: 'PWDVA protection order', title: 'Protection of Women from Domestic Violence Act, 2005', sourceUrl: 'https://www.indiacode.nic.in/bitstream/123456789/2021/5/A2005-43.pdf' },
      { id: 'constitution-writs', sourceId: 'constitution-source', text: 'Article 226 concerns High Court writ jurisdiction.', section: 'Constitutional remedies', title: 'Fundamental Rights', sourceUrl: 'https://example.gov/constitution' },
      { id: 'women-181', sourceId: 'women-source', text: 'Women Helpline 181 can connect callers with emergency support and police services.', section: 'Women Helpline 181', title: 'Women Helpline 181', sourceUrl: 'https://wcd.gov.in/offerings/women--helpline--scheme' }
    ].map((row) => ({
      ...row, language: 'en', region: 'Uttar Pradesh', verified: true,
      source: { id: row.sourceId, title: row.title, sourceUrl: row.sourceUrl, verified: true }
    }));
    const scenarios = [
      {
        question: 'Someone stole money through an online payment fraud. How should they report it in India?',
        hitIds: ['pocso-report', 'cyber-portal'], expectedSources: ['https://cybercrime.gov.in/']
      },
      {
        question: 'Someone stole money through an online fraud. How should i report it?',
        hitIds: ['consumer-nch', 'cyber-portal'], expectedSources: ['https://cybercrime.gov.in/']
      },
      {
        question: 'How can I contact the National Consumer Helpline for a grievance?',
        hitIds: ['cyber-portal', 'consumer-nch'], expectedSources: ['https://consumerhelpline.gov.in/public/about']
      },
      {
        question: 'Domestic violence mein protection order kaise milta hai?',
        hitIds: ['constitution-writs', 'pwdva-remedy', 'women-181'],
        expectedSources: [
          'https://www.indiacode.nic.in/bitstream/123456789/2021/5/A2005-43.pdf',
          'https://wcd.gov.in/offerings/women--helpline--scheme'
        ]
      }
    ];
    const calls = [];
    rag._setQdrantClient({ query: async (_collection, options) => {
      const scenario = scenarios[calls.length];
      calls.push(scenario.question);
      return scenario.hitIds.map((id, index) => ({
        score: 0.96 - index * 0.05,
        payload: { chunk_id: id, source_id: rows.find((row) => row.id === id).sourceId }
      }));
    } });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async ({ where }) => rows.filter((row) => where.id.in.includes(row.id)) } });
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    const originalThreshold = process.env.SIMILARITY_THRESHOLD;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    process.env.SIMILARITY_THRESHOLD = '0.30';
    try {
      for (const scenario of scenarios) {
        const result = await askService({ question: scenario.question, language: 'en', skipLlm: true });
        assert.deepEqual(result.sources.map((source) => source.source_url), scenario.expectedSources);
      }

      const cyberCandidates = filterLegalChunksForQuestion(scenarios[0].question, rows);
      assert.deepEqual(cyberCandidates.map((chunk) => chunk.id), ['cyber-portal']);
      const exactFraudCandidates = filterLegalChunksForQuestion(scenarios[1].question, rows);
      assert.deepEqual(exactFraudCandidates.map((chunk) => chunk.id), ['cyber-portal']);
      const consumerCandidates = filterLegalChunksForQuestion(scenarios[2].question, rows);
      assert.deepEqual(consumerCandidates.map((chunk) => chunk.id), ['consumer-nch']);
      const domesticCandidates = filterLegalChunksForQuestion(scenarios[3].question, rows);
      assert.deepEqual(domesticCandidates.map((chunk) => chunk.id), ['pwdva-remedy', 'women-181']);
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null); rag._setKnowledgeDbClient(null);
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
      if (originalThreshold === undefined) delete process.env.SIMILARITY_THRESHOLD;
      else process.env.SIMILARITY_THRESHOLD = originalThreshold;
    }
  });

  it('grounds domestic-violence guidance in the Magistrate and police-assistance distinction and blocks placeholder language', async () => {
    const { SYSTEM_PROMPT, buildUserMessage } = await import('../../src/modules/ai/gemini.service.js');
    const document = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data/legal/pwdva_2005_women_protection.json'), 'utf8'));
    const chunk = buildChunks(document, 'pwdva_2005_women_protection.json')
      .find((candidate) => candidate.id === 'pwdva_2005_remedies');

    assert.ok(chunk.text.includes('a protection order is made by the Magistrate'));
    assert.ok(chunk.text.includes('section 19(5) permits the Magistrate to direct'));
    assert.ok(chunk.text.includes('assist') && chunk.text.includes('implementation of that residence order'));
    assert.match(SYSTEM_PROMPT, /Do not add constitutional\s+remedies, unrelated statutes/);
    assert.match(SYSTEM_PROMPT, /Never include drafting\s+notes, placeholders, unfinished parentheticals/);
    assert.match(SYSTEM_PROMPT, /not as a\s+"police or court order\.?"/);
    assert.match(SYSTEM_PROMPT, /police only as assisting with\s+implementation when directed by the Magistrate/);

    const prompt = buildUserMessage('Domestic violence mein protection order kaise milta hai?', 'hinglish', [chunk]);
    assert.ok(prompt.includes(chunk.text));
    assert.ok(!prompt.includes('(if further case-specific advice or document list is required)'));
  });

  it('accepts a verified Hindi legal result above the configured threshold', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const calls = [];
    rag._setQdrantClient({ query: async (collection) => {
      calls.push(collection);
      return [{ score: 0.62, payload: { chunk_id: 'hindi-legal', source_id: 'legal-source' } }];
    } });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async ({ where }) => [{
      id: where.id.in[0], sourceId: 'legal-source', text: 'Approved legal aid eligibility information.',
      section: 'eligibility', language: 'en', region: 'Uttar Pradesh', verified: true,
      source: { id: 'legal-source', title: 'Legal aid', sourceUrl: 'https://example.gov/legal-aid', verified: true }
    }] } });
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    const originalThreshold = process.env.SIMILARITY_THRESHOLD;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    process.env.SIMILARITY_THRESHOLD = '0.30';
    try {
      const question = '\u0928\u093f\u0903\u0936\u0941\u0932\u094d\u0915 \u0935\u093f\u0927\u093f\u0915 \u0938\u0939\u093e\u092f\u0924\u093e \u092a\u093e\u0928\u0947 \u0915\u0940 \u092a\u093e\u0924\u094d\u0930\u0924\u093e \u0915\u094d\u092f\u093e \u0939\u0948?';
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const result = await askService({ question, language: 'auto', skipLlm: true });
      assert.deepEqual(calls, ['legal_rights_chunks']);
      assert.equal(result.language_used, 'hi');
      assert.equal(result.needs_human, false);
      assert.equal(result.guard_reason, 'in_scope');
      assert.equal(result.sources[0].source_url, 'https://example.gov/legal-aid');
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null); rag._setKnowledgeDbClient(null);
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
      if (originalThreshold === undefined) delete process.env.SIMILARITY_THRESHOLD;
      else process.env.SIMILARITY_THRESHOLD = originalThreshold;
    }
  });

  it('routes the cognizable-offence refusal question to legal RAG and accepts a verified relevant result at the legal threshold', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const calls = [];
    rag._setQdrantClient({ query: async (collection, options) => {
      calls.push({ collection, options });
      return [{ score: 0.67, payload: { chunk_id: 'bnss-refusal-route', source_id: 'bnss-source', source_ref: 'bnss_2023_refusal_route' } }];
    } });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async ({ where }) => [{
      id: where.id.in[0], sourceId: 'bnss-source',
      text: 'If an officer in charge refuses to record information about a cognizable offence, section 173(4) permits sending the substance in writing and by post to the Superintendent of Police concerned. If appropriate action is not taken, an application may be made to a Magistrate under section 175(3), subject to its statutory conditions.',
      section: 'BNSS sections 173(4), 175(3) and 210', language: 'en', region: 'Uttar Pradesh', verified: true,
      source: { id: 'bnss-source', title: 'Bharatiya Nagarik Suraksha Sanhita, 2023', sourceUrl: 'https://www.indiacode.nic.in/indiacode/handle/123456789/20099?view_type=browse', verified: true }
    }] } });
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    const originalThreshold = process.env.SIMILARITY_THRESHOLD;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    process.env.SIMILARITY_THRESHOLD = '0.30';
    try {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const result = await askService({
        question: 'What should I do if the police refuse to record information about a cognizable offence in Uttar Pradesh?',
        language: 'en', skipLlm: true
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].collection, 'legal_rights_chunks');
      assert.deepEqual(calls[0].options.filter.must, [
        { key: 'state', match: { value: 'Uttar Pradesh' } },
        { key: 'verified', match: { value: true } },
        { key: 'knowledge_domain', match: { value: 'legal_rights' } }
      ]);
      assert.equal(result.retrieval_score, 0.67);
      assert.equal(result.needs_human, false);
      assert.equal(result.guard_reason, 'in_scope');
      assert.equal(result.suggested_service_id, null);
      assert.equal(result.sources[0].source_url, 'https://www.indiacode.nic.in/indiacode/handle/123456789/20099?view_type=browse');
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null); rag._setKnowledgeDbClient(null);
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
      if (originalThreshold === undefined) delete process.env.SIMILARITY_THRESHOLD;
      else process.env.SIMILARITY_THRESHOLD = originalThreshold;
    }
  });

  it('keeps unrelated low-score questions on the strict certificate threshold and escalates', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const calls = [];
    rag._setQdrantClient({ query: async (collection) => {
      calls.push(collection);
      return [{ score: 0.62, payload: { chunk_id: 'unrelated-low-score', source_id: 'service-source', service_id: 'up_income_certificate' } }];
    } });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    rag._setKnowledgeDbClient({
      knowledgeChunk: {
        findMany: async ({ where }) => {
          return [{
            id: where.id.in[0], sourceId: 'service-source', text: 'Income certificate information.',
            section: 'overview', language: 'en', region: 'Uttar Pradesh', verified: true,
            source: { id: 'service-source', title: 'Income Certificate', sourceUrl: 'https://example.gov/service', verified: true }
          }];
        }
      }
    });
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    const originalThreshold = process.env.SIMILARITY_THRESHOLD;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    process.env.SIMILARITY_THRESHOLD = '0.30';
    try {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const result = await askService({ question: 'How do I repair a bicycle?', language: 'en', skipLlm: true });
      assert.deepEqual(calls, [aiConfig.qdrant.collection]);
      assert.equal(result.needs_human, true);
      assert.equal(result.guard_reason, 'similarity_threshold');
      assert.deepEqual(result.sources, []);
      assert.equal(result.suggested_service_id, null);
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null); rag._setKnowledgeDbClient(null);
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
      if (originalThreshold === undefined) delete process.env.SIMILARITY_THRESHOLD;
      else process.env.SIMILARITY_THRESHOLD = originalThreshold;
    }
  });

  it('does not return legal collection hits whose PostgreSQL source is unverified', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    rag._setQdrantClient({ query: async () => [{ score: 0.99, payload: { chunk_id: 'draft', source_id: 'draft-source' } }] });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async ({ where }) => {
      assert.equal(where.verified, true);
      return [{
        id: 'draft', sourceId: 'draft-source', text: 'Unverified legal content.',
        section: 'draft', language: 'en', region: 'Uttar Pradesh', verified: false,
        source: { id: 'draft-source', title: 'Draft legal source', verified: false }
      }];
    } } });
    const origFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    try {
      const result = await rag.retrieve('What is legal aid?');
      assert.deepEqual(result.chunks, []);
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const answer = await askService({ question: 'What is legal aid?', language: 'en', skipLlm: true });
      assert.equal(answer.suggested_service_id, null);
      assert.equal(answer.needs_human, true);
      assert.equal(answer.guard_reason, 'no_chunks');
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null); rag._setKnowledgeDbClient(null);
      if (origFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = origFallback;
    }
  });

  it('does not suggest a certificate service for verified legal results', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    rag._setQdrantClient({ query: async () => [{ score: 0.99, payload: { chunk_id: 'verified-legal', source_id: 'legal-source', source_ref: 'rights-article-14' } }] });
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.1] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: { findMany: async ({ where }) => [{
      id: where.id.in[0], sourceId: 'legal-source', text: 'Article 14 protects equality before law.',
      section: 'equality', language: 'en', region: 'Uttar Pradesh', verified: true,
      source: { id: 'legal-source', title: 'Fundamental Rights', sourceUrl: 'https://example.gov/constitution', department: 'Government of India', sourceType: 'legislation', verified: true }
    }] } });
    const origFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    try {
      const { askService } = await import('../../src/modules/ai/ai.service.js');
      const result = await askService({ question: 'What does Article 14 say about fundamental rights?', language: 'en', skipLlm: true });
      assert.equal(result.suggested_service_id, null);
      assert.equal(result.needs_human, false);
      assert.equal(result.sources[0].source_url, 'https://example.gov/constitution');
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null); rag._setKnowledgeDbClient(null);
      if (origFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = origFallback;
    }
  });

  it('removes only obsolete legal vectors so stale legal points cannot crowd current results', async () => {
    const { deleteObsoleteLegalPoints, stableLegalUuid, stableLegalPointId } = await import('../../scripts/legalIngestionHelpers.js');
    assert.equal(stableLegalUuid('legal-chunk:a'), stableLegalUuid('legal-chunk:a'));
    assert.equal(stableLegalPointId('legal:a'), stableLegalPointId('legal:a'));
    const deleted = [];
    const qdrant = {
      scroll: async (_collection, request) => {
        assert.deepEqual(request.filter, { must: [{ key: 'knowledge_domain', match: { value: 'legal_rights' } }] });
        return { points: [{ id: 1 }, { id: 2 }, { id: 99 }], next_page_offset: null };
      },
      delete: async (_collection, request) => deleted.push(...request.points)
    };
    const obsolete = await deleteObsoleteLegalPoints(qdrant, 'legal_rights_chunks', [1, 2]);
    assert.deepEqual(obsolete, [99]);
    assert.deepEqual(deleted, [99]);
  });

  it('preserves obsolete PostgreSQL chunks when legal Qdrant upsert or cleanup fails', async () => {
    const { upsertLegalVectorsAndPrunePostgres } = await import('../../scripts/legalIngestionHelpers.js');
    const obsoleteChunkRecords = [{ id: 'old-chunk', sourceId: 'legal-source' }];
    const points = [{ id: 1, vector: [0.1], payload: { knowledge_domain: 'legal_rights' } }];
    let postgresDeletes = 0;
    let sourceDeletes = 0;
    const knowledgeChunkDb = { deleteMany: async () => { postgresDeletes += 1; } };
    const knowledgeSourceDb = { deleteMany: async () => { sourceDeletes += 1; return { count: 1 }; } };

    await assert.rejects(upsertLegalVectorsAndPrunePostgres({
      qdrant: { upsert: async () => { throw new Error('upsert failed'); } },
      collection: 'legal_rights_chunks', points, obsoleteChunkRecords, obsoleteSourceIds: ['old-source'], knowledgeChunkDb, knowledgeSourceDb
    }), /upsert failed/);
    assert.equal(postgresDeletes, 0);
    assert.equal(sourceDeletes, 0);

    await assert.rejects(upsertLegalVectorsAndPrunePostgres({
      qdrant: {
        upsert: async () => {},
        scroll: async () => { throw new Error('legal vector cleanup failed'); }
      },
      collection: 'legal_rights_chunks', points, obsoleteChunkRecords, obsoleteSourceIds: ['old-source'], knowledgeChunkDb, knowledgeSourceDb
    }), /legal vector cleanup failed/);
    assert.equal(postgresDeletes, 0);
    assert.equal(sourceDeletes, 0);
  });

  it('retires obsolete sources only after vector cleanup and only when no chunks reference them', async () => {
    const { upsertLegalVectorsAndPrunePostgres } = await import('../../scripts/legalIngestionHelpers.js');
    const calls = [];
    const result = await upsertLegalVectorsAndPrunePostgres({
      qdrant: {
        upsert: async () => calls.push('qdrant-upsert'),
        scroll: async () => { calls.push('qdrant-scroll'); return { points: [], next_page_offset: null }; }
      },
      collection: 'legal_rights_chunks',
      points: [{ id: 1, vector: [0.1], payload: { knowledge_domain: 'legal_rights' } }],
      obsoleteChunkRecords: [{ id: 'old-chunk', sourceId: 'old-source' }],
      obsoleteSourceIds: ['old-source'],
      knowledgeChunkDb: { deleteMany: async ({ where }) => { calls.push('postgres-chunk-delete'); assert.equal(where.sourceId, 'old-source'); } },
      knowledgeSourceDb: { deleteMany: async ({ where }) => {
        calls.push('postgres-source-delete');
        assert.deepEqual(where, { id: 'old-source', chunks: { none: {} } });
        return { count: 0 }; // A retained chunk means Prisma does not retire this source.
      } }
    });
    assert.deepEqual(calls, ['qdrant-upsert', 'qdrant-scroll', 'postgres-chunk-delete', 'postgres-source-delete']);
    assert.equal(result.retiredSourceCount, 0);
  });

  it('keeps old vectors, chunks, and source metadata when revised source metadata upsert fails', async () => {
    const {
      stableLegalSourceRevisionId,
      stableLegalChunkRevisionId,
      stableLegalPointId,
      upsertLegalVectorsAndPrunePostgres
    } = await import('../../scripts/legalIngestionHelpers.js');
    const file = 'free_legal_aid_uttar_pradesh.json';
    const oldSource = {
      title: 'Free Legal Aid in Uttar Pradesh',
      sourceUrl: 'https://uttarpradesh.nalsa.gov.in/legal-aid/',
      department: 'Uttar Pradesh State Legal Services Authority (UPSLSA)',
      sourceType: 'official_government_authority',
      verified: true
    };
    const revisedSource = { ...oldSource, title: 'Revised Legal Aid Guidance', sourceUrl: 'https://uttarpradesh.nalsa.gov.in/updated-legal-aid/' };
    const sourceId = stableLegalSourceRevisionId(file, oldSource);
    const revisedSourceId = stableLegalSourceRevisionId(file, revisedSource);
    assert.equal(stableLegalSourceRevisionId(file, oldSource), sourceId, 'unchanged source metadata must keep its ID');
    assert.notEqual(revisedSourceId, sourceId, 'source metadata revisions must receive distinct PostgreSQL source IDs');
    const oldChunk = {
      id: 'up_free_legal_aid_eligibility', service_id: 'up_free_legal_aid',
      text: 'Original income eligibility wording.', source_url: 'https://uttarpradesh.nalsa.gov.in/legal-aid/',
      source_type: 'official_government_authority', state: 'Uttar Pradesh', verified: true,
      language: 'en', topic: 'eligibility', title: 'Free Legal Aid in Uttar Pradesh', department: oldSource.department
    };
    const revisedChunk = { ...oldChunk, title: revisedSource.title, source_url: revisedSource.sourceUrl, department: revisedSource.department };
    const oldChunkId = stableLegalChunkRevisionId(file, sourceId, oldChunk);
    const revisedChunkId = stableLegalChunkRevisionId(file, revisedSourceId, revisedChunk);
    const pointId = stableLegalPointId(`legal:${file}:${oldChunk.id}`);
    assert.notEqual(revisedChunkId, oldChunkId, 'text revisions must receive distinct PostgreSQL IDs');
    assert.equal(stableLegalPointId(`legal:${file}:${revisedChunk.id}`), pointId, 'the point ID remains stable for the same source/chunk identity');

    let postgresDeletes = 0;
    let sourceDeletes = 0;
    const oldRecord = {
      id: oldChunkId, sourceId, text: oldChunk.text, section: 'eligibility', language: 'en',
      region: 'Uttar Pradesh', verified: true,
      source: { id: sourceId, title: oldChunk.title, sourceUrl: oldChunk.source_url, department: oldChunk.department, sourceType: oldChunk.source_type, verified: true }
    };
    const qdrant = {
      upsert: async () => { throw new Error('simulated Qdrant upsert failure'); },
      query: async () => [{ id: pointId, score: 0.92, payload: { chunk_id: oldChunkId, source_id: sourceId, source_ref: oldChunk.id } }]
    };
    const knowledgeChunkDb = {
      findMany: async ({ where }) => where.id.in.includes(oldChunkId) ? [oldRecord] : [],
      deleteMany: async () => { postgresDeletes += 1; }
    };
    const knowledgeSourceDb = { deleteMany: async () => { sourceDeletes += 1; return { count: 1 }; } };

    await assert.rejects(upsertLegalVectorsAndPrunePostgres({
      qdrant, collection: 'legal_rights_chunks',
      points: [{ id: pointId, vector: [0.2], payload: { chunk_id: revisedChunkId, source_id: revisedSourceId, knowledge_domain: 'legal_rights' } }],
      obsoleteChunkRecords: [{ id: oldChunkId, sourceId }], obsoleteSourceIds: [sourceId], knowledgeChunkDb, knowledgeSourceDb
    }), /simulated Qdrant upsert failure/);
    assert.equal(postgresDeletes, 0);
    assert.equal(sourceDeletes, 0);

    const rag = await import('../../src/modules/ai/rag.service.js');
    rag._setQdrantClient(qdrant);
    rag._setEmbedClient({ models: { embedContent: async () => ({ embeddings: [{ values: [0.2] }] }) } });
    rag._setKnowledgeDbClient({ knowledgeChunk: knowledgeChunkDb });
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'false';
    try {
      const result = await rag.retrieve('Who may qualify for free legal aid?');
      assert.equal(result.chunks[0].text, oldChunk.text);
      assert.equal(result.chunks[0].source_id, sourceId);
      assert.equal(result.chunks[0].source_url, oldSource.sourceUrl);
      assert.equal(result.chunks[0].title, oldSource.title);
      assert.equal(postgresDeletes, 0);
      assert.equal(sourceDeletes, 0);
    } finally {
      rag._setQdrantClient(null); rag._setEmbedClient(null); rag._setKnowledgeDbClient(null);
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });

  it('loads legal local files but keeps fallback results verified and domain-separated', async () => {
    const rag = await import('../../src/modules/ai/rag.service.js');
    const localChunks = rag.loadLocalChunks();
    assert.ok(localChunks.some((chunk) => chunk.knowledge_domain === 'legal_rights'));
    assert.ok(localChunks.some((chunk) => chunk.knowledge_domain === 'citizen_service'));

    rag._setQdrantClient(false);
    rag._setEmbedClient(false);
    const originalFallback = process.env.RAG_ALLOW_LOCAL_FALLBACK;
    process.env.RAG_ALLOW_LOCAL_FALLBACK = 'true';
    try {
      const legal = await rag.retrieve('What free legal aid is available?');
      assert.ok(legal.chunks.length > 0, 'Approved legal chunks should be available in local fallback');
      assert.ok(legal.chunks.every((chunk) => chunk.knowledge_domain === 'legal_rights'));
      assert.ok(legal.chunks.every((chunk) => chunk.verified === true));

      const certificate = await rag.retrieve('income certificate');
      assert.ok(certificate.chunks.length > 0);
      assert.ok(certificate.chunks.every((chunk) => chunk.knowledge_domain === 'citizen_service' && chunk.verified));
      assert.ok(legal.chunks.every((legalChunk) =>
        certificate.chunks.every((serviceChunk) => legalChunk.id !== serviceChunk.id)
      ), 'Legal and citizen-service fallback results should remain separate');
    } finally {
      rag._setQdrantClient(null);
      rag._setEmbedClient(null);
      if (originalFallback === undefined) delete process.env.RAG_ALLOW_LOCAL_FALLBACK;
      else process.env.RAG_ALLOW_LOCAL_FALLBACK = originalFallback;
    }
  });
});
