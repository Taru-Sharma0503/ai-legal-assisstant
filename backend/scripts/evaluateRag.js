/**
 * scripts/evaluateRag.js
 *
 * End-to-end RAG evaluation script.
 *
 * Usage:
 *   node scripts/evaluateRag.js          # full run (retrieval + LLM)
 *   node scripts/evaluateRag.js --no-llm # retrieval + routing only, skips LLM
 *
 * Requirements:
 *   - Shows regex_detected_service and suggested_service_id as separate columns.
 *   - Out-of-scope PASS means needs_human is true AND suggested_service_id is null.
 *   - In-scope checks optional expectedTopic (substring); topic mismatch fails unless knownGap.
 *   - At least 20 out-of-scope questions (near-domain, RTI, consumer, FIR, unpaid wages, etc.)
 *   - At least 10 additional in-scope paraphrases with misspelt Hinglish ("bnwane", "chahiy").
 *   - Prints score distributions for each group and the best separating threshold.
 */

import { askService } from '../src/modules/ai/ai.service.js';
import { detectService } from '../src/modules/ai/rag.service.js';
import { LOW_CONF_MSG, UNKNOWN_FIELD_MSG } from '../src/modules/ai/knowledge.js';
import { pathToFileURL } from 'node:url';

const NO_LLM = process.argv.includes('--no-llm');

// ── Evaluation Test Cases ──────────────────────────────────────────────────
export const TEST_CASES = [
  // ── IN-SCOPE: English (Core) ─────────────────────────────────────────────
  { id: 'INC_EN_DOC',      question: 'What documents are required for an income certificate in UP?',         lang: 'en',       expectedService: 'up_income_certificate',     expectedTopic: 'Required Documents', expectNeedsHuman: false },
  { id: 'CASTE_EN_DOC',    question: 'What documents are needed for a caste certificate?',                    lang: 'en',       expectedService: 'up_caste_certificate',      expectedTopic: 'Required Documents', expectNeedsHuman: false },
  { id: 'DOM_EN_DOC',      question: 'What documents do I need for a domicile certificate?',                  lang: 'en',       expectedService: 'up_domicile_certificate',   expectedTopic: 'Required Documents', expectNeedsHuman: false },
  { id: 'BIRTH_EN_DOC',    question: 'What documents are needed to apply for a birth certificate?',           lang: 'en',       expectedService: 'up_birth_certificate',      expectedTopic: 'Required Documents', expectNeedsHuman: false },
  { id: 'DEATH_EN_DOC',    question: 'What documents are required for a death certificate in Uttar Pradesh?', lang: 'en',       expectedService: 'up_death_certificate',      expectedTopic: 'Required Documents', expectNeedsHuman: false },
  { id: 'MARR_EN_DOC',     question: 'What documents are required for a marriage certificate in UP?',         lang: 'en',       expectedService: 'up_marriage_certificate',   expectedTopic: 'Required Documents', expectNeedsHuman: false },
  { id: 'EWS_EN_DOC',      question: 'What documents are required for an EWS certificate?',                   lang: 'en',       expectedService: 'up_ews_certificate',        expectedTopic: 'Certificate Format', expectNeedsHuman: false },
  { id: 'DIS_EN_DOC',      question: 'What documents are required for a disability certificate in UP?',        lang: 'en',       expectedService: 'up_disability_certificate', expectedTopic: ['Certification', 'Reassessment'], expectNeedsHuman: false },
  { id: 'CHAR_EN_DOC',     question: 'What documents are needed for a character certificate?',                lang: 'en',       expectedService: 'up_character_certificate',  expectedTopic: ['Required Documents'], expectNeedsHuman: true, knownGap: true, knownGapNote: 'character source has no supporting-document checklist' },

  // ── IN-SCOPE: Hindi (Core) ───────────────────────────────────────────────
  { id: 'INC_HI_DOC',      question: 'उत्तर प्रदेश में आय प्रमाण पत्र के लिए कौन से दस्तावेज़ चाहिए?',    lang: 'hi',       expectedService: 'up_income_certificate',     expectedTopic: 'Required Documents', expectNeedsHuman: false },
  { id: 'CASTE_HI_FEE',    question: 'जाति प्रमाण पत्र बनवाने की फीस कितनी है?',                            lang: 'hi',       expectedService: 'up_caste_certificate',      expectedTopic: 'Overview & Fee',     expectNeedsHuman: false },
  { id: 'DOM_HI_ELIG',     question: 'निवास प्रमाण पत्र के लिए कौन आवेदन कर सकता है?',                      lang: 'hi',       expectedService: 'up_domicile_certificate',   expectedTopic: 'Eligibility',        expectNeedsHuman: true, knownGap: true, knownGapNote: 'structured criteria have no specific verifiable source and are omitted from authored chunks' },

  // ── IN-SCOPE: Hinglish (Core) ────────────────────────────────────────────
  { id: 'INC_HL_DOC',      question: 'income certificate ke liye kya documents chahiye bhai?',                lang: 'hinglish', expectedService: 'up_income_certificate',     expectedTopic: 'Required Documents', expectNeedsHuman: false },
  { id: 'MARR_HL_FEE',     question: 'marriage certificate ki fees kitni hai',                                 lang: 'hinglish', expectedService: 'up_marriage_certificate',   expectedTopic: 'Fees & Payment',     expectNeedsHuman: false },
  { id: 'CASTE_HL_DOC',    question: 'caste certificate bnwane ke liye photo chahiye kya',                     lang: 'hinglish', expectedService: 'up_caste_certificate',      expectedTopic: 'Required Documents', expectNeedsHuman: false },

  // ── IN-SCOPE: Additional Paraphrases & Misspelt Hinglish (>= 10) ─────────
  { id: 'INC_HL_MISSPELT', question: 'income certificate bnwane ke liye kya documents chahiy',                lang: 'hinglish', expectedService: 'up_income_certificate',     expectedTopic: 'Required Documents', expectNeedsHuman: false },
  { id: 'CASTE_HL_MISSP',  question: 'caste certificate bnwane me kitna paisa lagta hai',                     lang: 'hinglish', expectedService: 'up_caste_certificate',      expectedTopic: 'Overview & Fee',     expectNeedsHuman: false },
  { id: 'DOM_EN_FEE',      question: 'What is the fee for domicile certificate in UP?',                       lang: 'en',       expectedService: 'up_domicile_certificate',   expectedTopic: 'Overview & Fee',     expectNeedsHuman: false },
  { id: 'MARR_EN_STEPS',   question: 'What is the application process for marriage certificate in UP?',        lang: 'en',       expectedService: 'up_marriage_certificate',   expectedTopic: 'Application Process',expectNeedsHuman: false },
  { id: 'DEATH_EN_LATE',   question: 'What is the late fee for delayed death certificate registration?',      lang: 'en',       expectedService: 'up_death_certificate',      expectedTopic: 'Fees & Delayed',     expectNeedsHuman: false },
  { id: 'BIRTH_HI_LATE',   question: 'जन्म प्रमाण पत्र 21 दिन के बाद बनवाने पर कितना शुल्क लगता है?',         lang: 'hi',       expectedService: 'up_birth_certificate',      expectedTopic: 'Fees & Delayed',     expectNeedsHuman: false },
  { id: 'EWS_HI_ELIG',     question: 'उत्तर प्रदेश में ईडब्ल्यूएस प्रमाण पत्र के लिए पात्रता क्या है?',       lang: 'hi',       expectedService: 'up_ews_certificate',        expectedTopic: ['Eligibility', 'Certificate Format'], expectNeedsHuman: false },
  { id: 'DIS_HI_AUTH',     question: 'दिव्यांग प्रमाण पत्र जारी करने का अधिकार किसके पास है?',                lang: 'hi',       expectedService: 'up_disability_certificate', expectedTopic: 'Certification',    expectNeedsHuman: false },
  { id: 'CHAR_HL_POLICE',  question: 'UP me character certificate ke liye police verification kaise hoga',     lang: 'hinglish', expectedService: 'up_character_certificate',  expectedTopic: ['Police & Character Verification'], expectNeedsHuman: true, knownGap: true, knownGapNote: 'character source describes recorded police fields, not the verification procedure' },
  { id: 'DOM_HL_APPLY',    question: 'UP me niwas praman patra online kaise banwaye',                          lang: 'hinglish', expectedService: 'up_domicile_certificate',   expectedTopic: 'Application Procedure', expectNeedsHuman: false },
  { id: 'BIRTH_HL_OFFLINE',question: 'birth certificate offline kaise banega UP me',                          lang: 'hinglish', expectedService: 'up_birth_certificate',      expectedTopic: 'Offline Application',expectNeedsHuman: false },
  { id: 'INC_HI_RULES',    question: 'उत्तर प्रदेश में आय प्रमाण पत्र के नियम क्या हैं?',                     lang: 'hi',       expectedService: 'up_income_certificate',     expectedTopic: ['Rules & Eligibility', 'Required Documents'], expectNeedsHuman: false },
  { id: 'BIRTH_REGIST',    question: 'where birth is registered',                                              lang: 'en',       expectedService: 'up_birth_certificate',      expectedTopic: ['Overview & Registration', 'Offline Application'], expectNeedsHuman: false },

  // ── IN-SCOPE: Unknown field guard (processing time) ──────────────────────
  { id: 'UNK_PROC_TIME',   question: 'How long does the income certificate take?',                            lang: 'en',       expectedService: 'up_income_certificate',     expectedTopic: null,                 expectNeedsHuman: true },

  // ── OUT-OF-SCOPE (>= 20 cases: near-domain, legal, civil, weather, gibberish) ─
  { id: 'OOS_RATION',      question: 'How do I apply for a new ration card in UP?',                           lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_PENSION',     question: 'What is the procedure to apply for old age pension certificate in UP?', lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_OBC_NCL',     question: 'What documents are required for an OBC non-creamy layer certificate?',  lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_PAN',         question: 'How to apply for a new PAN card online?',                              lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_DL',          question: 'What documents are needed for a driving licence renewal in UP?',        lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_PASSPORT',    question: 'How do I get a passport?',                                              lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_LAND_RECORD', question: 'How do I check UP Bhulekh land record online?',                         lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_BIRTH_BIHAR', question: 'How to apply for a birth certificate in Bihar state?',                  lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_RTI',         question: 'How can I file an online RTI application in Uttar Pradesh?',            lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_CONSUMER',    question: 'Where can I file a consumer complaint against a private builder?',      lang: 'en',       expectedService: null, expectNeedsHuman: true, answerability: 'partial_evidence_escalation', expectedEvidenceTopics: ['National Consumer Helpline'], expectedEvidenceUrls: ['consumerhelpline.gov.in'], forbiddenAnswerPatterns: [/builder.{0,50}(?:must|should|has to).{0,30}(?:file|approach|sue)/i] },
  { id: 'OOS_FIR',         question: 'How to file an online FIR with Uttar Pradesh Police?',                  lang: 'en',       expectedService: null, expectNeedsHuman: true, answerability: 'unsupported_no_evidence' },
  { id: 'OOS_UNPAID_WAGES',question: 'My employer has not paid my salary for 3 months, how to recover wages?',lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_LANDLORD_DEP',question: 'What are my rights if my landlord keeps my security deposit?',          lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_TAXES',       question: 'How do I file an income tax return ITR-1?',                             lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_VOTER_ID',    question: 'How do I register for a new Voter ID card in UP?',                     lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_ELECTRICITY', question: 'How to apply for a new electricity connection in Lucknow?',             lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_WEATHER_EN',  question: 'What is the weather in Lucknow today?',                                 lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_WEATHER_HI',  question: 'आज लखनऊ में मौसम कैसा रहेगा?',                                         lang: 'hi',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_BIRYANI',     question: 'Where can I find the best biryani in Delhi?',                           lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_GIBBERISH_1', question: 'asdfghjkl qwerty uiop zxcvbnm',                                         lang: 'en',       expectedService: null, expectNeedsHuman: true },
  { id: 'OOS_GIBBERISH_2', question: 'blorp zorp fizzt buzz bang 12345',                                      lang: 'en',       expectedService: null, expectNeedsHuman: true }
];

// ── Evaluate Single Case ───────────────────────────────────────────────────
export function evaluateCaseOutcome(tc, result, { noLlm = NO_LLM } = {}) {
  const answerability = tc.answerability || (tc.knownGap || tc.expectNeedsHuman || tc.expectedService === null
    ? 'unsupported_no_evidence'
    : 'answerable');
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const answer = result.answer || '';
  const suggestedService = result.suggested_service_id ?? 'null';
  const notes = [];
  const failures = [];
  const fail = (message) => failures.push(message);

  if (!['answerable', 'partial_evidence_escalation', 'unsupported_no_evidence'].includes(answerability)) {
    fail(`unknown answerability category: ${answerability}`);
  }
  if (suggestedService !== (tc.expectedService ?? 'null')) {
    fail(`service/domain: got ${suggestedService}, want ${tc.expectedService ?? 'null'}`);
  }

  if (answerability === 'answerable') {
    if (result.needs_human !== false) fail(`needs_human: got ${result.needs_human}, want false`);
    if (tc.expectedTopic) {
      const expectedTopics = Array.isArray(tc.expectedTopic) ? tc.expectedTopic : [tc.expectedTopic];
      const relevant = sources.some((source) => expectedTopics.some((topic) =>
        `${source.topic || ''} ${source.title || ''}`.toLowerCase().includes(topic.toLowerCase())
      ));
      if (!relevant) fail(`relevant source/topic missing; expected one of: ${expectedTopics.join(' | ')}`);
    }
  } else if (answerability === 'partial_evidence_escalation') {
    // In retrieval-only mode, the LLM's escalation and wording cannot be tested.
    // Evidence relevance is still required and is evaluated in both modes.
    if (!noLlm && result.needs_human !== true) fail(`needs_human: got ${result.needs_human}, want true`);
    const topicTerms = tc.expectedEvidenceTopics || [];
    const urlTerms = tc.expectedEvidenceUrls || [];
    const relevant = (source) => {
      const text = `${source.topic || ''} ${source.title || ''} ${source.source_url || source.sourceUrl || ''}`.toLowerCase();
      return topicTerms.some((term) => text.includes(term.toLowerCase())) ||
        urlTerms.some((term) => text.includes(term.toLowerCase()));
    };
    if (!sources.some(relevant)) fail('partial evidence source missing or irrelevant');
    if (sources.some((source) => !relevant(source))) fail('irrelevant source included with partial evidence');
    if (!noLlm) {
      for (const pattern of tc.forbiddenAnswerPatterns || []) {
        if (pattern.test(answer)) fail(`unsupported answer claim matched ${pattern}`);
      }
    } else {
      notes.push('retrieval-only mode: final answer limitation and human-review wording not evaluated');
    }
  } else if (answerability === 'unsupported_no_evidence') {
    if (result.needs_human !== true) fail(`needs_human: got ${result.needs_human}, want true`);
    if (sources.length > 0) fail(`unsupported question returned sources: ${sources.map((source) => source.topic || source.title || source.id).join(', ')}`);
    const safeFallbacks = [LOW_CONF_MSG[tc.lang], UNKNOWN_FIELD_MSG[tc.lang], LOW_CONF_MSG.en, UNKNOWN_FIELD_MSG.en].filter(Boolean);
    if (!safeFallbacks.includes(answer)) fail('unsupported question did not return a known no-evidence fallback');
    if (tc.knownGap) notes.push(`known gap: ${tc.knownGapNote || 'no relevant authored evidence'}`);
  }

  return { answerability, pass: failures.length === 0, failures, notes };
}

async function evalCase(tc) {
  const start = Date.now();

  const regexDetected = detectService(tc.question) ?? 'null';

  // Call the REAL askService with skipLlm: NO_LLM
  const result = await askService({
    question: tc.question,
    language: tc.lang,
    state: 'Uttar Pradesh',
    skipLlm: NO_LLM
  });

  const suggestedService = result.suggested_service_id ?? 'null';
  const topScore = typeof result.confidence === 'number' ? result.confidence : 0;
  const topTopic = result.sources?.[0]?.topic ?? '—';
  const retrievalSource = result.retrieval_source ?? '—';
  const guardReason = result.guard_reason ?? '—';
  const needsHuman = result.needs_human;
  const answer = result.answer ?? '';
  const elapsedMs = Date.now() - start;

  const outcome = evaluateCaseOutcome(tc, result, { noLlm: NO_LLM });

  // Existing caste-document hallucination check is retained for full LLM runs.
  if (!NO_LLM && tc.id === 'CASTE_EN_DOC') {
    const forbidden = ['Voter ID', 'Non-Creamy', 'Father / Family Member'];
    const foundForbidden = forbidden.filter((term) => answer.toLowerCase().includes(term.toLowerCase()));
    if (foundForbidden.length) outcome.failures.push(`hallucination: [${foundForbidden.join(', ')}] found in answer`);
    outcome.pass = outcome.failures.length === 0;
  }

  return {
    id: tc.id,
    question: tc.question,
    regexDetected,
    suggestedService,
    expectedService: tc.expectedService ?? 'null',
    retrievalSource,
    guardReason,
    topScore: topScore.toFixed(3),
    topTopic,
    answerability: outcome.answerability,
    needsHuman: needsHuman ?? '—',
    pass: outcome.pass,
    failures: outcome.failures,
    notes: outcome.notes,
    elapsedMs,
    isInScope: tc.expectedService !== null,
    scoreNum: topScore
  };
}

// ── Format Table Row ───────────────────────────────────────────────────────
function formatRow(r) {
  const status = r.pass ? 'PASS' : 'FAIL';
  const failMsg = r.failures.length ? ` [${r.failures.join('; ')}]` : '';
  return [
    r.id.padEnd(16),
    r.regexDetected.padEnd(25),
    r.suggestedService.padEnd(25),
    r.retrievalSource.padEnd(14),
    String(r.topScore).padStart(6),
    r.topTopic.substring(0, 20).padEnd(20),
    r.answerability.padEnd(28),
    String(r.needsHuman).padEnd(10),
    r.guardReason.padEnd(20),
    status + failMsg
  ].join(' | ');
}

// ── Distribution Statistics Helper ─────────────────────────────────────────
function computeStats(scores) {
  if (!scores.length) return { count: 0, min: 0, max: 0, avg: 0, median: 0, p25: 0, p75: 0 };
  const sorted = [...scores].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  return { count: sorted.length, min, max, avg, median, p25, p75, sorted };
}

// ── Main Runner ────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== RAG EVALUATION${NO_LLM ? ' (--no-llm mode)' : ''} ===\n`);

  const header = [
    'ID'.padEnd(16),
    'Regex Detected'.padEnd(25),
    'Suggested Service'.padEnd(25),
    'Source'.padEnd(14),
    'Score'.padStart(6),
    'Top Topic'.padEnd(20),
    'Answerability'.padEnd(28),
    'NeedsHuman'.padEnd(10),
    'Guard Reason'.padEnd(20),
    'Result'
  ].join(' | ');
  const sep = '-'.repeat(header.length);

  console.log(header);
  console.log(sep);

  const results = [];
  for (const tc of TEST_CASES) {
    try {
      const r = await evalCase(tc);
      console.log(formatRow(r));
      results.push(r);
    } catch (err) {
      console.log(`${tc.id.padEnd(16)} ERROR: ${err.message}`);
      results.push({
        id: tc.id,
        pass: false,
        isInScope: tc.expectedService !== null,
        topScore: '0',
        scoreNum: 0,
        failures: [err.message]
      });
    }
  }

  console.log(sep);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\nPASS: ${passed} / ${results.length}`);

  // ── Score distributions ──────────────────────────────────────────────────
  const inScopeCases = results.filter((r) => r.isInScope && r.guardReason !== 'unknown_field');
  const inScopeScores = inScopeCases.map((r) => r.scoreNum).filter((s) => s > 0);

  const outScopeCases = results.filter((r) => !r.isInScope);
  const outScopeScores = outScopeCases.map((r) => r.scoreNum);

  const inStats = computeStats(inScopeScores);
  const outStats = computeStats(outScopeScores);

  console.log('\n=== SCORE DISTRIBUTIONS ===');
  console.log(`In-Scope (N=${inStats.count}):`);
  console.log(`  Min    : ${inStats.min.toFixed(3)}`);
  console.log(`  25th % : ${inStats.p25.toFixed(3)}`);
  console.log(`  Median : ${inStats.median.toFixed(3)}`);
  console.log(`  Mean   : ${inStats.avg.toFixed(3)}`);
  console.log(`  75th % : ${inStats.p75.toFixed(3)}`);
  console.log(`  Max    : ${inStats.max.toFixed(3)}`);

  console.log(`\nOut-of-Scope (N=${outStats.count}):`);
  console.log(`  Min    : ${outStats.min.toFixed(3)}`);
  console.log(`  25th % : ${outStats.p25.toFixed(3)}`);
  console.log(`  Median : ${outStats.median.toFixed(3)}`);
  console.log(`  Mean   : ${outStats.avg.toFixed(3)}`);
  console.log(`  75th % : ${outStats.p75.toFixed(3)}`);
  console.log(`  Max    : ${outStats.max.toFixed(3)}`);

  console.log('\n=== SEPARATION ANALYSIS ===');
  console.log(`  Highest Out-of-Scope Score : ${outStats.max.toFixed(3)}`);
  console.log(`  Lowest In-Scope Score      : ${inStats.min.toFixed(3)}`);

  if (inStats.min > outStats.max) {
    const separatingThreshold = ((inStats.min + outStats.max) / 2).toFixed(3);
    console.log(`  Clean separation exists!`);
    console.log(`  Gap: [${outStats.max.toFixed(3)}, ${inStats.min.toFixed(3)}]`);
    console.log(`  Best separating threshold: ${separatingThreshold}`);
  } else {
    console.log(`  OVERLAP DETECTED: In-scope and out-of-scope scores overlap.`);
    console.log(`  Overlap range: [${inStats.min.toFixed(3)}, ${outStats.max.toFixed(3)}]`);
    console.log(`  A pure score threshold cannot separate all cases without routing guards.`);
  }
  console.log('');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Evaluation script error:', err);
    process.exit(1);
  });
}
