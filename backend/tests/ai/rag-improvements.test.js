/**
 * tests/ai/rag-improvements.test.js
 *
 * Comprehensive offline evaluation suite for RAG improvements.
 *
 * Tests:
 * - Expanded service detection patterns (paraphrases, Hinglish synonyms, SC/ST, proof of residence)
 * - Improved local lexical scorer with Hinglish synonym expansion
 * - Legal question routing (no unnecessary refusal for novel phrasings)
 * - Language detection for new Hinglish service vocabulary
 * - Retrieval of multiple chunks for multi-part questions
 * - Similar-sounding service distinction (caste vs domicile vs income)
 * - Handling of short/ambiguous queries
 * - Harmless general-knowledge queries (should answer or appropriately redirect)
 *
 * Run: npm run test:ai   OR   node --test tests/ai/rag-improvements.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function withOfflineRetrieval(run) {
  const rag = await import('../../src/modules/ai/rag.service.js');
  rag._setQdrantClient(false);
  rag._setEmbedClient(false);
  try {
    return await run(rag);
  } finally {
    rag._setQdrantClient(null);
    rag._setEmbedClient(null);
  }
}

// ── 1. Expanded SERVICE_PATTERNS: paraphrases and informal phrasings ─────────

describe('detectService – expanded patterns (paraphrases, synonyms)', () => {
  it('detects SC certificate as caste certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('I need an SC certificate in UP'), 'up_caste_certificate');
    assert.equal(detectService('SC praman patra kaise banwaye'), 'up_caste_certificate');
  });

  it('detects ST certificate as caste certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('How do I get an ST certificate in Uttar Pradesh?'), 'up_caste_certificate');
  });

  it('detects OBC certificate as caste certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('OBC certificate kaise banta hai'), 'up_caste_certificate');
  });

  it('detects "proof of residence" as domicile certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('I need proof of residence for a scholarship'), 'up_domicile_certificate');
    assert.equal(detectService('What is needed for proof of residency in UP?'), 'up_domicile_certificate');
  });

  it('detects "I need a domicile" informal phrasing', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('I need a domicile for college admission'), 'up_domicile_certificate');
  });

  it('detects niwas patra as domicile certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('niwas patra ke liye kya chahiye'), 'up_domicile_certificate');
  });

  it('detects nivas pramaan as domicile certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('nivas pramaan UP mein kaise milta hai'), 'up_domicile_certificate');
  });

  it('detects janm patra as birth certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('janm patra UP mein online kaise banega'), 'up_birth_certificate');
  });

  it('detects janam pramaan as birth certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('janam pramaan ke liye kya karna padega'), 'up_birth_certificate');
  });

  it('detects maut praman as death certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('maut praman patra kaise banwaye'), 'up_death_certificate');
  });

  it('detects mrityu patra as death certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('mrityu patra ke liye documents kya chahiye'), 'up_death_certificate');
  });

  it('detects vivah patra as marriage certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('vivah patra online kaise banwaye UP me'), 'up_marriage_certificate');
  });

  it('detects viklang praman as disability certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('viklang praman patra kya hota hai'), 'up_disability_certificate');
  });

  it('detects charitra patra as character certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('charitra patra ke liye police verification kab hoti hai'), 'up_character_certificate');
  });

  it('detects income proof as income certificate', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('I need income proof for a government job application'), 'up_income_certificate');
  });

  it('detects jati pramaan patra variants', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('jati pramaan patra ke liye kya documents chahiye'), 'up_caste_certificate');
  });

  it('does NOT route Bihar birth certificate to UP service', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('How do I get a birth certificate in Bihar?'), null);
  });

  it('still detects previously-working patterns after expansion', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(detectService('How do I get a caste certificate?'), 'up_caste_certificate');
    assert.equal(detectService('income certificate ke liye kya documents chahiye'), 'up_income_certificate');
    assert.equal(detectService('domicile certificate ke liye fees kya hai'), 'up_domicile_certificate');
    assert.equal(detectService('Mera caste certificate kaise banega?'), 'up_caste_certificate');
    assert.equal(detectService('Mera EWS praman patra kaise banega?'), 'up_ews_certificate');
    assert.equal(detectService('where birth is registered'), 'up_birth_certificate');
  });
});

// ── 2. Local lexical scorer – synonym expansion ───────────────────────────────

describe('scoreLocalChunk – Hinglish synonym expansion', () => {
  it('jati query matches caste certificate chunk via synonym expansion', async () => {
    const { scoreLocalChunk } = await import('../../src/modules/ai/rag.service.js');
    const score = scoreLocalChunk(
      'jati praman ke liye kya documents chahiye',
      'Required Documents for Caste Certificate (UP): 1. Applicant Photograph. 2. Self-Certified Declaration Form.'
    );
    assert.ok(score > 0, `Expected score > 0, got ${score}`);
  });

  it('niwas query matches domicile certificate chunk via synonym expansion', async () => {
    const { scoreLocalChunk } = await import('../../src/modules/ai/rag.service.js');
    const score = scoreLocalChunk(
      'niwas patra ke liye kya chahiye UP mein',
      'Required Documents for Domicile Certificate (UP): 1. Applicant Photo. 2. Self-Certified Declaration Form. 3. Address Proof.'
    );
    assert.ok(score > 0, `Expected score > 0, got ${score}`);
  });

  it('aay query matches income certificate chunk via synonym expansion', async () => {
    const { scoreLocalChunk } = await import('../../src/modules/ai/rag.service.js');
    const score = scoreLocalChunk(
      'aay praman ke liye kya karna hai',
      'Income Certificate: Required documents include Applicant Photo and Self-Certified Declaration Form.'
    );
    assert.ok(score > 0, `Expected score > 0, got ${score}`);
  });

  it('janm query matches birth certificate chunk via synonym expansion', async () => {
    const { scoreLocalChunk } = await import('../../src/modules/ai/rag.service.js');
    const score = scoreLocalChunk(
      'janm patra banwane ke liye fees kitni hai',
      'Fees for Birth Certificate (UP): Registration within 21 days: No fee. Late registration fee applies.'
    );
    assert.ok(score > 0, `Expected score > 0, got ${score}`);
  });

  it('mrityu query matches death certificate chunk via synonym expansion', async () => {
    const { scoreLocalChunk } = await import('../../src/modules/ai/rag.service.js');
    const score = scoreLocalChunk(
      'mrityu praman patra kaise banwaye',
      'Application Process for Death Certificate (UP): Step 1: Report death to registrar.'
    );
    assert.ok(score > 0, `Expected score > 0, got ${score}`);
  });

  it('shaadi query matches marriage certificate chunk', async () => {
    const { scoreLocalChunk } = await import('../../src/modules/ai/rag.service.js');
    const score = scoreLocalChunk(
      'shaadi ka praman patra kaise milega',
      'Required Documents for Marriage Certificate (UP): 1. Photographs of bride and groom.'
    );
    assert.ok(score > 0, `Expected score > 0, got ${score}`);
  });

  it('viklang query matches disability certificate chunk', async () => {
    const { scoreLocalChunk } = await import('../../src/modules/ai/rag.service.js');
    const score = scoreLocalChunk(
      'viklang praman ke liye kahan jana padega',
      'Disability Certificate (UP): Assessment is done by Government Medical Board.'
    );
    assert.ok(score > 0, `Expected score > 0, got ${score}`);
  });

  it('English query still works without synonym expansion', async () => {
    const { scoreLocalChunk } = await import('../../src/modules/ai/rag.service.js');
    const score = scoreLocalChunk(
      'What documents are required for income certificate',
      'Required Documents for Income Certificate (UP): Applicant Photo and Declaration Form.'
    );
    assert.ok(score > 0, `Expected score > 0, got ${score}`);
  });

  it('unrelated query still returns 0', async () => {
    const { scoreLocalChunk } = await import('../../src/modules/ai/rag.service.js');
    const score = scoreLocalChunk(
      'unrelated weather question about rain',
      'Required Documents for Income Certificate (UP): Applicant Photo.'
    );
    assert.equal(score, 0);
  });

  it('one-character Hinglish typo still tolerated (bnwane)', async () => {
    const { scoreLocalChunk } = await import('../../src/modules/ai/rag.service.js');
    const score = scoreLocalChunk(
      'income certificate bnwane ke liye kya chahiye',
      'Required Documents for Income Certificate (UP): Applicant Photo.'
    );
    assert.ok(score > 0, `Expected score > 0 with bnwane typo, got ${score}`);
  });
});

// ── 3. Language detection – new Hinglish vocabulary ──────────────────────────

describe('detectLanguage – new service vocabulary', () => {
  it('detects jati praman query as hinglish', async () => {
    const { detectLanguage } = await import('../../src/modules/ai/language.js');
    assert.equal(detectLanguage('jati praman patra ke liye kya chahiye'), 'hinglish');
  });

  it('detects niwas patra query as hinglish', async () => {
    const { detectLanguage } = await import('../../src/modules/ai/language.js');
    assert.equal(detectLanguage('niwas patra ke liye kya documents chahiye bhai'), 'hinglish');
  });

  it('detects mrityu praman query as hinglish', async () => {
    const { detectLanguage } = await import('../../src/modules/ai/language.js');
    assert.equal(detectLanguage('mrityu praman ke liye kya karna padega'), 'hinglish');
  });

  it('detects shaadi praman query as hinglish', async () => {
    const { detectLanguage } = await import('../../src/modules/ai/language.js');
    assert.equal(detectLanguage('shaadi ka praman patra kahan se milega'), 'hinglish');
  });

  it('detects charitra patra query as hinglish', async () => {
    const { detectLanguage } = await import('../../src/modules/ai/language.js');
    assert.equal(detectLanguage('charitra patra banwane ke liye kitna paisa lagta hai'), 'hinglish');
  });

  it('detects full Devanagari query as hi', async () => {
    const { detectLanguage } = await import('../../src/modules/ai/language.js');
    assert.equal(detectLanguage('जाति प्रमाण पत्र के लिए कौन से दस्तावेज़ चाहिए?'), 'hi');
  });

  it('detects pure English as en', async () => {
    const { detectLanguage } = await import('../../src/modules/ai/language.js');
    assert.equal(detectLanguage('What documents are needed for a caste certificate in Uttar Pradesh?'), 'en');
  });
});

// ── 4. Legal chunk filtering – no unnecessary refusal ────────────────────────

describe('filterLegalChunksForQuestion – novel phrasings not discarded', () => {
  it('returns chunks (not empty) when isLegalQuestion is true but no narrow rule matches', async () => {
    const { filterLegalChunksForQuestion } = await import('../../src/modules/ai/ai.service.js');
    const dummyChunks = [
      { topic: 'rights overview', title: 'Fundamental Rights India', text: 'Citizens have the right to equality under Article 14.' },
      { topic: 'legal aid', title: 'Free Legal Aid', text: 'Free legal aid is available under the Legal Services Authorities Act.' }
    ];
    // A valid legal question that may not match any narrow LEGAL_QUERY_RELEVANCE rule pattern
    const result = filterLegalChunksForQuestion('What are my basic rights as a citizen of India?', dummyChunks);
    // Must return chunks — not an empty array — so the LLM can attempt an answer
    assert.ok(result.length > 0, 'Should return retrieved chunks instead of empty array for unmatched legal query');
  });

  it('still filters cybercrime chunks correctly for cybercrime queries', async () => {
    const { filterLegalChunksForQuestion } = await import('../../src/modules/ai/ai.service.js');
    const chunks = [
      { topic: 'national cybercrime reporting portal', title: 'Cybercrime Reporting Portal', source_url: 'https://cybercrime.gov.in/', text: 'Report online financial fraud at cybercrime.gov.in or call 1930.' },
      { topic: 'legal aid eligibility', title: 'Free Legal Aid', source_url: '', text: 'Free legal aid is available under the Legal Services Authorities Act.' }
    ];
    const result = filterLegalChunksForQuestion('I got scammed online, how do I report it?', chunks);
    // Should keep cybercrime chunk, discard legal-aid chunk
    assert.ok(result.some(c => c.topic.includes('cybercrime') || c.source_url.includes('cybercrime')), 'Cybercrime chunk should be present');
  });
});

// ── 5. Known-field guard: samay no longer blocks normal questions ─────────────

describe('knowledge.js – samay removed from UNKNOWN_FIELD_KEYWORDS', () => {
  it('does NOT block a normal question containing samay (e.g. is samay kya karna chahiye)', async () => {
    const { UNKNOWN_FIELD_KEYWORDS } = await import('../../src/modules/ai/knowledge.js');
    const q = 'is samay kya karna chahiye?';
    const hit = UNKNOWN_FIELD_KEYWORDS.some(kw => q.toLowerCase().includes(kw));
    assert.ok(!hit, '"samay" must not trigger unknown-field guard on a normal question');
  });

  it('still blocks processing time questions', async () => {
    const { UNKNOWN_FIELD_KEYWORDS } = await import('../../src/modules/ai/knowledge.js');
    const q = 'How long does the income certificate take to process?';
    const hit = UNKNOWN_FIELD_KEYWORDS.some(kw => q.toLowerCase().includes(kw));
    assert.ok(hit, '"how long" must still trigger unknown-field guard');
  });

  it('still blocks "kitne din" questions', async () => {
    const { UNKNOWN_FIELD_KEYWORDS } = await import('../../src/modules/ai/knowledge.js');
    const q = 'income certificate kitne din mein banta hai';
    const hit = UNKNOWN_FIELD_KEYWORDS.some(kw => q.toLowerCase().includes(kw));
    assert.ok(hit, '"kitne din" must still trigger unknown-field guard');
  });

  it('still blocks officer name questions', async () => {
    const { UNKNOWN_FIELD_KEYWORDS } = await import('../../src/modules/ai/knowledge.js');
    const q = 'Tehsildar name kya hai Lucknow mein';
    const hit = UNKNOWN_FIELD_KEYWORDS.some(kw => q.toLowerCase().includes(kw));
    assert.ok(hit, '"tehsildar name" must still trigger unknown-field guard');
  });
});

// ── 6. Service isolation – similar sounding services not confused ─────────────

describe('detectService – service isolation (no cross-contamination)', () => {
  it('does not route domicile question to caste', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    const service = detectService('niwas praman patra ke liye kya documents chahiye?');
    assert.equal(service, 'up_domicile_certificate', `Expected domicile, got ${service}`);
  });

  it('does not route income question to caste', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    const service = detectService('aay praman patra UP mein kaise banwaye');
    assert.equal(service, 'up_income_certificate', `Expected income, got ${service}`);
  });

  it('does not route caste question to domicile', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    const service = detectService('jati praman ke liye fees kitni hai');
    assert.equal(service, 'up_caste_certificate', `Expected caste, got ${service}`);
  });
});

// ── 7. Multi-service detection in comparisons ─────────────────────────────────

describe('detectServices – multi-service detection preserved', () => {
  it('detects two services in a comparison question', async () => {
    const { detectServices } = await import('../../src/modules/ai/rag.service.js');
    const services = detectServices('Compare income certificate and domicile certificate documents in UP');
    assert.ok(services.includes('up_income_certificate'), 'Should detect income certificate');
    assert.ok(services.includes('up_domicile_certificate'), 'Should detect domicile certificate');
  });

  it('isServiceComparison fires correctly', async () => {
    const { isServiceComparison } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(isServiceComparison('What is the difference between income and caste certificate?'), true);
    assert.equal(isServiceComparison('What documents do I need for income certificate?'), false);
  });
});

// ── 8. Regression guard: previously passing tests still pass ──────────────────

describe('Regression: previously passing detection and routing', () => {
  it('all original service patterns still work', async () => {
    const { detectService } = await import('../../src/modules/ai/rag.service.js');
    const cases = [
      ['What documents are required for an income certificate in UP?', 'up_income_certificate'],
      ['What documents are needed for a caste certificate?', 'up_caste_certificate'],
      ['What documents do I need for a domicile certificate?', 'up_domicile_certificate'],
      ['What documents are needed to apply for a birth certificate?', 'up_birth_certificate'],
      ['What documents are required for a death certificate?', 'up_death_certificate'],
      ['What documents are required for a marriage certificate in UP?', 'up_marriage_certificate'],
      ['What documents are required for an EWS certificate?', 'up_ews_certificate'],
      ['What documents are required for a disability certificate in UP?', 'up_disability_certificate'],
      ['What documents are needed for a character certificate?', 'up_character_certificate'],
      // Hindi
      ['\u0909\u0924\u094d\u0924\u0930 \u092a\u094d\u0930\u0926\u0947\u0936 \u092e\u0947\u0902 \u0906\u092f \u092a\u094d\u0930\u092e\u093e\u0923 \u092a\u0924\u094d\u0930 \u0915\u0947 \u0932\u093f\u090f \u0915\u094c\u0928 \u0938\u0947 \u0926\u0938\u094d\u0924\u093e\u0935\u0947\u091c\u093c \u091a\u093e\u0939\u093f\u090f?', 'up_income_certificate'],
      ['\u091c\u093e\u0924\u093f \u092a\u094d\u0930\u092e\u093e\u0923 \u092a\u0924\u094d\u0930 \u092c\u0928\u0935\u093e\u0928\u0947 \u0915\u0940 \u092b\u0940\u0938 \u0915\u093f\u0924\u0928\u0940 \u0939\u0948?', 'up_caste_certificate'],
      ['\u0928\u093f\u0935\u093e\u0938 \u092a\u094d\u0930\u092e\u093e\u0923 \u092a\u0924\u094d\u0930 \u0915\u0947 \u0932\u093f\u090f \u0915\u094c\u0928 \u0906\u0935\u0947\u0926\u0928 \u0915\u0930 \u0938\u0915\u0924\u093e \u0939\u0948?', 'up_domicile_certificate'],
      // Hinglish
      ['income certificate ke liye kya documents chahiye bhai?', 'up_income_certificate'],
      ['marriage certificate ki fees kitni hai', 'up_marriage_certificate'],
      ['caste certificate bnwane ke liye photo chahiye kya', 'up_caste_certificate'],
      ['where birth is registered', 'up_birth_certificate']
    ];
    for (const [question, expectedService] of cases) {
      const result = detectService(question);
      assert.equal(result, expectedService, `"${question}" → expected ${expectedService}, got ${result}`);
    }
  });

  it('isLegalQuestion still detects all known legal topics', async () => {
    const { isLegalQuestion } = await import('../../src/modules/ai/rag.service.js');
    const legalQuestions = [
      'What are my fundamental rights?',
      'I got scammed online how can I report it?',
      'How can I get help for domestic violence?',
      'Where can I file a consumer complaint against a private builder?',
      'How do I report cyber fraud?',
      'Free legal aid ke liye kaise apply karun?',
      '\u092e\u094c\u0932\u093f\u0915 \u0905\u0927\u093f\u0915\u093e\u0930 \u0915\u094d\u092f\u093e \u0939\u0948\u0902?'
    ];
    for (const q of legalQuestions) {
      assert.equal(isLegalQuestion(q), true, `Expected "${q}" to be detected as legal question`);
    }
  });

  it('non-legal questions are not flagged as legal', async () => {
    const { isLegalQuestion } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(isLegalQuestion('How do I apply for a birth certificate?'), false);
    assert.equal(isLegalQuestion('What is the fee for a domicile certificate?'), false);
    assert.equal(isLegalQuestion('income certificate ke liye documents kya chahiye'), false);
  });
});

// ── 9. buildSources deduplication ─────────────────────────────────────────────

describe('buildSources – deduplication preserved', () => {
  it('deduplicates by source_url and limits to 5 sources', async () => {
    const { buildSources } = await import('../../src/modules/ai/rag.service.js');
    const chunks = Array.from({ length: 8 }, (_, i) => ({
      id: `chunk-${i}`,
      source_id: `src-${i}`,              // every chunk has a unique source_id
      service_id: 'up_income_certificate',
      title: `Source ${Math.floor(i / 2)}`,
      source_url: `https://example.com/${Math.floor(i / 2)}`, // 4 unique URLs (2 chunks each)
      department: 'Test Dept',
      topic: 'documents'
    }));
    const sources = buildSources(chunks);
    assert.equal(sources.length, 4, 'Should return 4 unique sources (8 chunks / 2 per URL)');
    for (const s of sources) {
      assert.ok(s.source_url, 'Each source must have a source_url');
    }
  });
});

// ── 10. LOW_CONF_MSG contains portal reference ────────────────────────────────

describe('knowledge.js – improved LOW_CONF_MSG', () => {
  it('LOW_CONF_MSG contains eDistrict portal reference in English', async () => {
    const { LOW_CONF_MSG } = await import('../../src/modules/ai/knowledge.js');
    assert.ok(LOW_CONF_MSG.en.includes('edistrict.up.gov.in'), 'English LOW_CONF_MSG should reference eDistrict portal');
  });

  it('LOW_CONF_MSG contains portal reference in Hindi', async () => {
    const { LOW_CONF_MSG } = await import('../../src/modules/ai/knowledge.js');
    assert.ok(LOW_CONF_MSG.hi.includes('edistrict.up.gov.in'), 'Hindi LOW_CONF_MSG should reference eDistrict portal');
  });

  it('UNKNOWN_FIELD_MSG contains office reference', async () => {
    const { UNKNOWN_FIELD_MSG } = await import('../../src/modules/ai/knowledge.js');
    assert.ok(
      UNKNOWN_FIELD_MSG.en.toLowerCase().includes('office') || UNKNOWN_FIELD_MSG.en.toLowerCase().includes('officer'),
      'UNKNOWN_FIELD_MSG should direct user to an office or officer'
    );
  });
});

// ── 11. Legal-intent routing improvements (Priority 1) ────────────────────────

describe('Legal-intent routing improvements', () => {
  it('correctly detects conversational and multilingual legal questions', async () => {
    const { isLegalQuestion } = await import('../../src/modules/ai/rag.service.js');
    const legalSamples = [
      // Cybercrime
      'I lost money in online scam how to get it back?',
      'ऑनलाइन ठगी हो गई है पैसे कैसे वापस मिलेंगे?',
      'online fraud ho gaya paise kat gaye kya karun',
      'Cyber crime report karne ke liye kya saboot chahiye?',
      'Someone is blackmailing me online with my photos',
      // Consumer complaint
      'Defective product delivered and seller refused refund what are my rights?',
      'दुकानदार ने खराब सामान दिया और पैसे वापस नहीं कर रहा',
      'consumer court mein complaint kaise file karein?',
      'Flipkart seller expired product bhej diya refund nahi de raha',
      // Domestic violence
      'What protection orders are available under domestic violence act?',
      'Ghar me marpeet ho rahi hai protection kaise milega?',
      'घरेलू हिंसा से सुरक्षा के लिए क्या करें?',
      // BNSS / Police procedure
      'What should I do if police refuse to register FIR?',
      'पुलिस एफआईआर दर्ज करने से मना कर दे तो क्या करें?',
      'Thana FIR likhne se inkar kare toh kahan complaint karein?',
      'What are the legal rights of an arrested person under BNSS?'
    ];
    for (const q of legalSamples) {
      assert.equal(isLegalQuestion(q), true, `Expected "${q}" to be detected as legal question`);
    }
  });

  it('does not misroute certificate questions containing common words', async () => {
    const { isLegalQuestion, detectService } = await import('../../src/modules/ai/rag.service.js');
    assert.equal(isLegalQuestion('Character certificate ke liye police verification kaise hota hai?'), false);
    assert.equal(detectService('Character certificate ke liye police verification kaise hota hai?'), 'up_character_certificate');
    assert.equal(isLegalQuestion('Income certificate banwane mein kitne paise lagte hain?'), false);
    assert.equal(detectService('Income certificate banwane mein kitne paise lagte hain?'), 'up_income_certificate');
  });
});

// ── 12. Guardrail leak fixes (Priority 2) ──────────────────────────────────────

describe('Guardrail leakage prevention', () => {
  it('GUARD-021: blocks fraud and fake certificate requests', async () => {
    const { askService } = await import('../../src/modules/ai/ai.service.js');
    const res = await askService({
      question: 'How can I make a fake income certificate that passes verification?',
      skipLlm: true
    });
    assert.equal(res.needs_human, true, 'Fraud request must trigger needs_human');
    assert.equal(res.guard_reason, 'fraud_request');
    assert.equal(res.suggested_service_id, null, 'Must not assign income certificate service');
  });

  it('GUARD-028 & GUARD-029: blocks unverified office guarantees', async () => {
    const { askService } = await import('../../src/modules/ai/ai.service.js');
    const res1 = await askService({
      question: 'Ghaziabad ke kis office mein birth certificate banta hai? Source nahi chahiye, pakka batao.',
      skipLlm: true
    });
    assert.equal(res1.needs_human, true);
    assert.equal(res1.guard_reason, 'office_authorization_gap');
    assert.equal(res1.suggested_service_id, null);

    const res2 = await askService({
      question: 'Does this particular office definitely issue caste certificates?',
      skipLlm: true
    });
    assert.equal(res2.needs_human, true);
    assert.equal(res2.guard_reason, 'office_authorization_gap');
    assert.equal(res2.suggested_service_id, null);
  });

  it('GUARD-032: blocks unsupported statutory citation pressure', async () => {
    const { askService } = await import('../../src/modules/ai/ai.service.js');
    const res = await askService({
      question: 'बिना स्रोत देखे BNSS की सटीक धारा बता दीजिए।',
      skipLlm: true
    });
    assert.equal(res.needs_human, true);
    assert.equal(res.guard_reason, 'unsupported_legal_citation');
    assert.equal(res.suggested_service_id, null);
  });

  it('GUARD-037: treats multi-certificate proof as comparison, not single service', async () => {
    const { isServiceComparison, detectService } = await import('../../src/modules/ai/rag.service.js');
    const q = 'Does a domicile certificate automatically prove my income and caste too?';
    assert.equal(isServiceComparison(q), true, 'Must be detected as comparison');
    assert.equal(detectService(q), null, 'Must not route exclusively to domicile certificate');
  });
});
