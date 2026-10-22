import { detectLanguage } from './language.js';
import { UNKNOWN_FIELD_KEYWORDS, UNKNOWN_FIELD_MSG, LOW_CONF_MSG } from './knowledge.js';
import { generateWithGemini } from './gemini.service.js';
import { generateWithGroq } from './groq.service.js';
import {
  retrieve,
  retrieveLocal,
  detectService,
  detectServices,
  serviceName,
  isServiceComparison,
  isLegalQuestion,
  isCybercrimeReportingQuestion,
  filterChunksByService,
  buildSources,
  CYBERCRIME_INTENT_RE,
  CONSUMER_INTENT_RE,
  DOMESTIC_VIOLENCE_INTENT_RE,
  BNSS_POLICE_INTENT_RE,
  isFraudRequest,
  isOfficeAuthorizationDemand,
  isUnsupportedCitationDemand
} from './rag.service.js';
import { aiConfig } from '../../config/ai.js';


const ONLINE_FIR_QUESTION_RE = /\b(?:online|internet|e-?filing|e-?fir)\b.{0,50}\b(?:fir|first information report)\b|\b(?:fir|first information report)\b.{0,50}\b(?:online|internet|portal)\b/i;
const BUILDER_COMPLAINT_QUESTION_RE = /\b(?:builder|real estate|property developer|housing project)\b.{0,100}\bconsumer complaint\b|\bconsumer complaint\b.{0,100}\b(?:builder|real estate|property developer|housing project)\b/i;
const CONSUMER_ACT_QUESTION_RE = /consumer protection act|section\s+2\s*\(\s*6\s*\)|statutory definition of a consumer complaint/i;

const SENSITIVE_CREDENTIAL_OFFER_RE = /\b(?:can i|may i|should i|let me|i can|send you|share (?:my|the))\b.{0,60}\b(?:otp|one.time password|pin|password)\b|\b(?:otp|one.time password|pin|password)\b.{0,50}\b(?:send|share|give|tell)\b.{0,30}\b(?:you|assistant|chatbot|bot)\b|\b(?:kya main|kya mein|aapko|tumhe|bhej(?:u|oon|un)|share kar(?:u|oon)|bata(?:u|oon))\b.{0,55}\b(?:otp|pin|password|aadhaar)\b|\b(?:otp|pin|password)\b.{0,50}\b(?:aapko|tumhe|bhej|share|bata)\b|(?:क्या मैं|आपको|तुम्हें).{0,45}(?:ओटीपी|ओटिपी|otp|पिन|पासवर्ड).{0,35}(?:भेज|बत|साझा)|(?:ओटीपी|ओटिपी|otp|पिन|पासवर्ड).{0,50}(?:आपको|भेज|बत|साझा)/iu;
const LIVE_CERTIFICATE_STATUS_RE = /\b(?:live|current|latest|real.time|check|access|look up|track|tracking)\b.{0,70}\b(?:application|certificate|request)\b.{0,40}\b(?:status|progress)\b|\b(?:application|certificate|request)\b.{0,50}\b(?:status|progress)\b.{0,45}\b(?:live|current|check|access|system|portal)\b|\b(?:status|track|tracking)\b.{0,45}\b(?:application|certificate)\b|\b(?:live|current|check|access|track|tracking)\b.{0,60}\b(?:status|progress)\b.{0,50}\b(?:certificate|application|sarkari|government|system)\b|(?:वर्तमान स्थिति|अभी की स्थिति|लाइव स्टेटस|आवेदन की स्थिति|स्थिति जाँच|स्थिति जांच|स्टेटस चेक|सरकारी प्रणाली).{0,60}(?:जाँच|जांच|देख|कर|स्टेटस|स्थिति)|(?:status|tracking|track).{0,45}(?:application|certificate|aavedan|praman|patra|system|sarkari|check|dekh)/iu;

function isSensitiveCredentialOffer(question) {
  return SENSITIVE_CREDENTIAL_OFFER_RE.test(question);
}

function isLiveCertificateStatusRequest(question) {
  const hindiStatusLookup = /(?:स्टेटस|स्थिति).{0,30}कैसे.{0,20}देखें/u.test(question);
  return Boolean(detectService(question)) && (LIVE_CERTIFICATE_STATUS_RE.test(question) || hindiStatusLookup);
}

function asksGuaranteedFraudRecovery(question) {
  return /\b(?:guarantee|guaranteed|sure|certain)\b.{0,70}\b(?:money|funds|recover|recovery|return|back)\b|\b(?:money|funds|recover|recovery|return|back)\b.{0,70}\b(?:guarantee|guaranteed|sure|certain)\b|\b(?:paise|paisa|rupaye|rupees?)\b.{0,60}\b(?:wapas|mil(?:e|enge|ega)|recover|guarantee|sure)\b|\b(?:paise|paisa|rupaye)\b.{0,45}\b(?:wapas|milenge)\b|(?:गारंटी|निश्चित|पक्का).{0,60}(?:पैसे|रकम|धन).{0,50}(?:वापस|मिल|बरामद)|(?:पैसे|रकम|धन).{0,50}(?:वापस|मिल|बरामद).{0,60}(?:गारंटी|निश्चित|पक्का)/iu.test(question);
}

const LEGAL_QUERY_RELEVANCE = [
  {
    question: CYBERCRIME_INTENT_RE,
    candidate: /national\s+cyber\s+crime\s+reporting|cybercrime\.gov\.in|\b1930\b|\bi4c\b|online\s+financial\s+fraud|financial\s+cyber\s+fraud/i
  },
  {
    question: ONLINE_FIR_QUESTION_RE,
    candidate: /\b(?:online|e-?fir|portal|e-?filing)\b.{0,60}\b(?:fir|police|complaint)\b|\b(?:fir|police|complaint)\b.{0,60}\b(?:online|portal|e-?filing)\b/i
  },
  {
    question: BUILDER_COMPLAINT_QUESTION_RE,
    candidate: /\b(?:builder|real estate|property developer|housing project|RERA)\b/i
  },
  {
    question: CONSUMER_ACT_QUESTION_RE,
    candidate: /consumer_protection_act|consumer protection act|section\s+2\s*\(\s*6\s*\)/i
  },
  {
    question: CONSUMER_INTENT_RE,
    candidate: /consumer|\bnch\b|\b1915\b|consumer\s+commission/i
  },
  {
    question: /legal aid|free legal|legal services authorities?|lok adalat|विधिक सहायता|कानूनी सहायता|muft kanooni madad/i,
    candidate: /legal aid|legal services authorities?|legal services authorities act|lok adalat|free legal services?/i
  },
  {
    question: /fundamental rights?|constitutional rights?|basic rights?|rights? as a citizen|citizen(?:s')? rights?|article\s*(?:14|15|19|21a?|23|24|25|32|226)|मौलिक अधिकार|संवैधानिक अधिकार/i,
    candidate: /fundamental rights?|constitutional rights?|rights overview|basic rights?|article\s*(?:14|15|19|21a?|23|24|25|32|226)|मौलिक अधिकार|संवैधानिक अधिकार/i
  },
  {
    question: BNSS_POLICE_INTENT_RE,
    candidate: /\bbnss\b|bharatiya nagarik suraksha sanhita|cognizable|cognisable|section\s+173|police.{0,50}(?:record|refus|arrest|information)|\bfir\b/i
  },
  {
    question: /child protection|child safety|child abuse|pocso|juvenile justice|bachchon ki safety|bachon ki safety|बाल सुरक्षा|बच्चों की सुरक्षा|बाल शोषण/i,
    candidate: /pocso|juvenile justice|child welfare|child helpline|child protection|बाल सुरक्षा|बाल संरक्षण/i
  },
  {
    question: DOMESTIC_VIOLENCE_INTENT_RE,
    candidate: /domestic\s+violence|pwdva|protection\s+order|protection\s+officer|residence\s+order|women\s+helpline|\b181\b|legal\s+aid|free\s+legal\s+services?|legal\s+services\s+authorities?\s+act/i
  }
];
const CYBERCRIME_PRIORITY_RE = /\b(?:stole|stolen|theft|unauthori[sz]ed|unapproved|fraudulent)\b.{0,50}\b(?:money|funds|payment|transaction|transfer|account)\b|\b(?:money|funds)\b.{0,50}\b(?:stolen|taken|deducted)\b|\b(?:online|internet|bank|account|payment|transaction|transfer)\b.{0,50}\b(?:fraud|scam|theft|stole|stolen|unauthori[sz]ed|unapproved)\b|\b(?:online|payment)\s+(?:payment\s+)?fraud\b|ऑनलाइन\s+(?:पेमेंट|भुगतान)?\s*(?:फ्रॉड|धोखाधड़ी)|(?:पैसे|रुपये)\s*(?:चोरी|कट|निकाल)|अनधिकृत\s+(?:भुगतान|लेनदेन)|(?:ऑनलाइन|बैंक|खाते|लेनदेन).{0,50}(?:पैसे|रुपये).{0,35}(?:चोरी|कट|निकाल)/i;

// Keep topic-specific legal results together for both generation and citations.
// When this question belongs to a known topic but retrieval returns no matching
// passage, the normal empty-candidate guard escalates instead of citing unrelated hits.
export function filterLegalChunksForQuestion(question, chunks) {
  const cybercrimeRule = LEGAL_QUERY_RELEVANCE[0];
  // Theft, unauthorized transactions, and financial fraud are cyber-reporting
  // intents even if the question also mentions a consumer grievance channel.
  if (isCybercrimeReportingQuestion(question) || CYBERCRIME_PRIORITY_RE.test(question)) {
    return chunks.filter((chunk) =>
      cybercrimeRule.candidate.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.source_url || ''}`)
    );
  }
  if (ONLINE_FIR_QUESTION_RE.test(question)) {
    const onlineFirRule = LEGAL_QUERY_RELEVANCE.find(({ question: pattern }) => pattern === ONLINE_FIR_QUESTION_RE);
    return chunks.filter((chunk) =>
      onlineFirRule.candidate.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`)
    );
  }
  if (BUILDER_COMPLAINT_QUESTION_RE.test(question)) {
    const builderRule = LEGAL_QUERY_RELEVANCE.find(({ question: pattern }) => pattern === BUILDER_COMPLAINT_QUESTION_RE);
    return chunks.filter((chunk) =>
      builderRule.candidate.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`)
    );
  }
  if (CONSUMER_ACT_QUESTION_RE.test(question)) {
    const consumerActRule = LEGAL_QUERY_RELEVANCE.find(({ question: pattern }) => pattern === CONSUMER_ACT_QUESTION_RE);
    return chunks.filter((chunk) =>
      consumerActRule.candidate.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`)
    );
  }
  if (/\b(?:compare|comparison|versus|vs\.?|difference between)\b|\b(?:constitution|constitutional|article\s*226|writ jurisdiction)\b/i.test(question)) {
    return chunks;
  }
  const rules = LEGAL_QUERY_RELEVANCE.filter(({ question: pattern }) => pattern.test(question));
  if (rules.length === 0) return [];
  // For cross-topic questions, retain the union of candidates relevant to at
  // least one detected intent. Never treat an unrelated legal hit as support.


  return chunks.filter((chunk) => {
    const content = `${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`;
    return rules.some((rule) => rule.candidate.test(content));
  });
}

function filterServiceChunksForQuestion(question, chunks, serviceId) {
  if (serviceId === 'up_income_certificate') {
    const aadhaarQuestion = /\b(?:aadhaar|aadhar|otp|authentication|e-?kyc)\b|\u{0906}\u{0927}\u{093e}\u{0930}|\u{0913}\u{091f}\u{0940}\u{092a}\u{0940}/iu.test(question);
    if (aadhaarQuestion) {
      return chunks.filter((chunk) => chunk.verified === true && /aadhaar identity requirement|565\/1-9-2023-R-9/i.test(`${chunk.topic || ''} ${chunk.text || ''}`));
    }
    const feeQuestion = /\b(?:fee|fees|charge|cost)\b|\u{092b}\u{0940}\u{0938}|\u{0936}\u{0941}\u{0932}\u{094d}\u{0915}/iu.test(question);
    if (feeQuestion) {
      return chunks.filter((chunk) => chunk.verified === true && /\bfee|\bfees|\bcharge|\bcost|\u{092b}\u{0940}\u{0938}|\u{0936}\u{0941}\u{0932}\u{094d}\u{0915}/iu.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`));
    }
    const documentsQuestion = /\b(?:documents?|paperwork|checklist)\b|\u{0926}\u{0938}\u{094d}\u{0924}\u{093e}\u{0935}\u{0947}\u{091c}|\u{0915}\u{093e}\u{0917}\u{091c}/iu.test(question);
    if (documentsQuestion) {
      return chunks.filter((chunk) => chunk.verified === true && /document|checklist/i.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`) && !/auto.?fetch|otp|\u{20b9}\s*30/i.test(chunk.text || ''));
    }
    const applicationQuestion = /\b(?:apply|application|procedure|process|steps?|banwaye|banvaye|banaye)\b|आवेदन|प्रक्रिया|तरीका/iu.test(question);
    if (applicationQuestion) {
      return chunks.flatMap((chunk) => {
        const sentences = String(chunk.text || '').split(/(?:[.!?]\s+|\n+)/).map((sentence) => sentence.trim()).filter(Boolean);
        const unsupportedPositiveClaim = (sentence) => {
          const mentionsLegacyDetail = /\bOTP\b|\u{20b9}\s*\d+|\b(?:INR|Rs\.?)\s*\d+|\bfees?\b|\b(?:charge|cost)\b|auto.?fetch|auto.?fetched/i.test(sentence);
          const explicitlyDisclaimsDetail = /\b(?:not|never|no|unverified|unsupported|unknown|unclear|does not|doesn't|cannot|can't)\b|not established|not specified/i.test(sentence);
          return mentionsLegacyDetail && !explicitlyDisclaimsDetail;
        };
        // The verified service listing supports only the online route and
        // registration requirement. Keep only complete, clean sentences that
        // express those claims; discard a contaminated sentence as a whole.
        // Topic/title words alone must not make unrelated or legacy content
        // eligible, and unsafe claims are never passed to answer generation.
        const supportedRouteSentences = sentences.filter((sentence) =>
          /\bonline\b/i.test(sentence) &&
          /\b(?:application|service)\b/i.test(sentence) &&
          /\b(?:register|registration)\b/i.test(sentence) &&
          !unsupportedPositiveClaim(sentence)
        );
        const rejectionReasons = [];
        if (chunk.verified !== true) rejectionReasons.push('hydrated_chunk_not_verified');
        if (supportedRouteSentences.length === 0) rejectionReasons.push('no_supported_application_route_claim');
        if (sentences.some(unsupportedPositiveClaim)) rejectionReasons.push('unsupported_legacy_claim');
        if (rejectionReasons.includes('hydrated_chunk_not_verified') || supportedRouteSentences.length === 0) {
          console.info('[RAG] Candidate rejection', JSON.stringify({
            qdrantPointId: chunk.qdrant_point_id ?? null,
            qdrantChunkId: chunk.qdrant_chunk_id ?? chunk.id ?? null,
            hydratedChunkId: chunk.id ?? null,
            sourceRef: chunk.source_ref ?? null,
            serviceId: chunk.service_id ?? null,
            domain: chunk.knowledge_domain || 'citizen_service',
            qdrantVerified: chunk.qdrant_verified ?? null,
            hydratedChunkVerified: chunk.verified ?? null,
            postgresChunkVerified: chunk.postgres_chunk_verified ?? null,
            postgresSourceVerified: chunk.postgres_source_verified ?? null,
            sourceIdentityMatch: chunk.source_identity_match ?? null,
            qdrantTextMatchesHydratedText: chunk.qdrant_text_matches_hydrated_text ?? null,
            rejectionReasons
          }));
          return [];
        }
        return [{
          ...chunk,
          // Keep only independently supported route claims. This prevents a
          // neighboring legacy OTP/fee assertion from reaching the model.
          text: supportedRouteSentences.join('. ')
        }];
      });
    }
  }

  if (serviceId === 'up_caste_certificate' &&
      /recommendation|ward\s+(?:member|councillor)|gram\s+pradhan|caste\s+proof|\bpradhan\b|\bward\b|à¤¸à¤¿à¤«à¤¾à¤°à¤¿à¤¶|à¤µà¤¾à¤°à¥à¤¡ à¤¸à¤¦à¤¸à¥à¤¯|à¤—à¥à¤°à¤¾à¤® à¤ªà¥à¤°à¤§à¤¾à¤¨/iu.test(question)) {
    return chunks.filter((chunk) =>
      /recommendation|ward\s+(?:member|councillor)|gram\s+pradhan|caste\s+proof|à¤¸à¤¿à¤«à¤¾à¤°à¤¿à¤¶|à¤µà¤¾à¤°à¥à¤¡ à¤¸à¤¦à¤¸à¥à¤¯|à¤—à¥à¤°à¤¾à¤® à¤ªà¥à¤°à¤§à¤¾à¤¨/i.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`)
    );
  }

  // The current caste JSON contains a verified document checklist but no
  // source-verified eligibility passage. Do not answer an eligibility question
  // with a merely related checklist chunk.
  if (serviceId === 'up_caste_certificate' && /\b(?:eligib(?:le|ility)|who\s+(?:can|may)\s+apply|qualif(?:y|ies|ication)|categories?)\b|पात्रता|पात्र|किन श्रेणियों|कौन(?:-कौन)? आवेदन कर सकता|kaun eligible|kaun apply kar sakta/i.test(question)) {
    return chunks.filter((chunk) => chunk.verified === true && /eligib(?:le|ility)|qualif(?:y|ies|ication)|categories|पात्रता|पात्र/i.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`));
  }

  if (serviceId === 'up_birth_certificate') {
    const rejectedApplication = /\b(?:application|request)\b.{0,50}\b(?:reject(?:ed|ion)?|den(?:y|ied|ial))\b|\b(?:reject(?:ed|ion)?|den(?:y|ied|ial))\b.{0,50}\b(?:application|request)\b|रिजेक्ट|अस्वीकार|खारिज/i.test(question);
    const correctionRequest = /\b(?:correct|correction|fix|change|amend)\b.{0,40}\b(?:mistake|error|application|certificate|record|detail)\b|\b(?:mistake|error)\b.{0,40}\b(?:application|certificate|record|detail)\b|\b(?:correction|galti|sudhar)\b|गलती|सुधार|संशोधन/i.test(question);
    const statusRequest = /\b(?:status|track|tracking)\b|स्टेटस|स्थिति/i.test(question);
    if (rejectedApplication) {
      return chunks.filter((chunk) => /reject|rejection|denial|appeal|review/i.test(`${chunk.topic || ''} ${chunk.text || ''}`));
    }
    if (correctionRequest) {
      return chunks.filter((chunk) =>
        /correction|correct(?:ion)?|rectification/i.test(`${chunk.topic || ''} ${chunk.title || ''}`) ||
        /correct(?:ion)?\s+(?:to|of)\s+(?:a\s+)?(?:birth|death)\s+(?:certificate|record)/i.test(chunk.text || '')
      );
    }
    if (statusRequest) {
      return chunks.filter((chunk) => /tracking|track(?:ing)?|status|service request number/i.test(`${chunk.topic || ''} ${chunk.text || ''}`));
    }
  }

  // These two sources have known gaps: the Character Certificate source has
  // no supporting-document checklist or verification procedure, and the
  // domicile authored chunks omit eligibility. Apply the narrow checks only
  // to those document-level gaps; don't suppress other service knowledge.
  if (serviceId !== 'up_character_certificate' && serviceId !== 'up_domicile_certificate') return chunks;
  const has = /\b(?:documents?|document\s+list|supporting\s+documents?|paperwork|kagaz|dastavez)\b|कागज़|कागजात|दस्तावेज़/i.test(question);
  if (serviceId === 'up_character_certificate' && has) {
    return chunks.filter((chunk) =>
      /required\s+documents?|document\s+(?:checklist|requirements?)|supporting\s+documents?|\bdocuments\b/i.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`)
    );
  }

  const eligibilityQuestion = /\b(?:eligib(?:le|ility)|who\s+(?:can|may)\s+apply|qualif(?:y|ies|ication))\b|पात्रता|कौन आवेदन कर सकता|kaun apply kar sakta|kaun eligible/i.test(question);
  if (serviceId === 'up_domicile_certificate' && eligibilityQuestion) {
    return chunks.filter((chunk) =>
      /eligib(?:le|ility)|who\s+(?:can|may)\s+apply|qualif(?:y|ies|ication)|पात्रता|कौन आवेदन कर सकता/i.test(`${chunk.topic || ''} ${chunk.title || ''} ${chunk.text || ''}`)
    );
  }

  const policeProcessQuestion = /\b(?:how|process|procedure|steps?)\b.{0,80}\bpolice\b.{0,30}\bverif(?:y|ication)\b|\bpolice\b.{0,30}\bverif(?:y|ication)\b.{0,80}\b(?:how|process|procedure|steps?)\b|\bverif(?:y|ication)\b.{0,30}\bkaise\b/i.test(question);
  if (serviceId === 'up_character_certificate' && policeProcessQuestion) {
    return chunks.filter((chunk) =>
      /police.{0,80}(?:verification|verify).{0,80}(?:process|procedure|conducted|steps?|contact|visit)|(?:process|procedure|conducted|steps?).{0,80}police.{0,80}(?:verification|verify)/i.test(chunk.text || '')
    );
  }
  return chunks;
}

function touchesUnknownField(question) {
  if (!question) return false;
  const qLower = question.toLowerCase();
  return UNKNOWN_FIELD_KEYWORDS.some((kw) => qLower.includes(kw));
}

function fallbackFromChunks(chunks, language, question = '') {
  if (!chunks || chunks.length === 0) {
    const noInfo = {
      en: "I don't have verified information about this in the current knowledge base.",
      hi: "वर्तमान ज्ञान आधार में इसके बारे में सत्यापित जानकारी उपलब्ध नहीं है।",
      hinglish: "Mere current verified knowledge base mein is information ke baare mein data available nahi hai."
    };
    return { answer: noInfo[language] || noInfo.en, needs_human: true, generation_status: 'fallback' };
  }

  const isStatusQuestion = /\b(?:status|track|tracking)\b|स्टेटस|स्थिति/i.test(question);
  if (isStatusQuestion && chunks.some((chunk) => /service request number.{0,50}track/i.test(chunk.text || ''))) {
    const statusAnswers = {
      en: 'The verified instructions say to keep your Service Request Number for tracking. They do not specify which page or steps to use to check the current status. Please consult the eDistrict UP portal or an official officer.',
      hi: 'सत्यापित निर्देशों में ट्रैकिंग के लिए अपना Service Request Number संभालकर रखने को कहा गया है। मौजूदा स्थिति देखने के लिए कौन-सा पेज या प्रक्रिया इस्तेमाल करनी है, यह जानकारी उपलब्ध नहीं है। कृपया eDistrict UP पोर्टल या किसी आधिकारिक अधिकारी से पुष्टि करें।',
      hinglish: 'Verified instructions ke mutabik tracking ke liye apna Service Request Number sambhal kar rakhein. Current status check karne ka page ya process yahan specify nahi hai. Kripya eDistrict UP portal ya official officer se confirm karein.'
    };
    return { answer: statusAnswers[language] || statusAnswers.en, needs_human: true, generation_status: 'fallback' };
  }

  const missingDocumentQuestion = /\b(?:do not have|don't have|without|missing|lost)\b.{0,60}\b(?:documents?|papers?|proof|certificate)\b|\b(?:documents?|papers?|proof)\b.{0,60}\b(?:missing|unavailable)\b|नहीं है|न हो|गुम/i.test(question);
  if (missingDocumentQuestion && chunks.some((chunk) => /required documents?/i.test(`${chunk.topic || ''} ${chunk.text || ''}`))) {
    const missingDocumentAnswers = {
      en: 'The verified document list mentions “other identity proof” as an option. It does not explain what to do if you have none of the listed identity or birth proofs. Please confirm the accepted next step with an official officer.',
      hi: 'सत्यापित दस्तावेज़ सूची में “अन्य पहचान प्रमाण” का विकल्प दिया गया है। यदि आपके पास सूची में दिया कोई पहचान या जन्म प्रमाण नहीं है, तो आगे क्या करना है इसकी जानकारी उपलब्ध नहीं है। कृपया आधिकारिक अधिकारी से स्वीकार्य अगला कदम पूछें।',
      hinglish: 'Verified document list mein “other identity proof” ka option diya hai. Agar aapke paas listed identity ya birth proof mein se kuch bhi nahi hai, to next step kya hai yeh information available nahi hai. Kripya official officer se confirm karein.'
    };
    return { answer: missingDocumentAnswers[language] || missingDocumentAnswers.en, needs_human: true, generation_status: 'fallback' };
  }

  const seen = new Set();
  const uniqueTexts = [];
  for (const c of chunks) {
    if (!seen.has(c.text)) { seen.add(c.text); uniqueTexts.push(c.text); }
  }
  const prefix = {
    en: "Automatic answer generation failed. The retrieved verified passage(s) are shown below, but may not fully answer your question. Please check with an official officer.\n\n",
    hi: "स्वचालित उत्तर तैयार नहीं हो सका। नीचे प्राप्त सत्यापित अंश दिए हैं, लेकिन वे आपके प्रश्न का पूरा उत्तर न भी हों। कृपया आधिकारिक अधिकारी से पुष्टि करें।\n\n",
    hinglish: "Automatic answer generate nahi ho saka. Neeche retrieved verified passages hain, lekin yeh aapke question ka complete answer shayad na hon. Kripya official officer se confirm karein.\n\n"
  };
  const answer = (prefix[language] || prefix.en) + uniqueTexts.map((t) => "- " + t).join("\n\n");
  return { answer, needs_human: true, generation_status: 'fallback' };
}

const GEMINI_QUOTA_COOLDOWN_MS = 60_000;
let geminiQuotaCooldownUntil = 0;

function isQuotaError(error) {
  return Number(error?.status ?? error?.statusCode) === 429 ||
    /quota|resource_exhausted/i.test(String(error?.code || error?.message || ''));
}

function safeProviderError(error) {
  const status = Number(error?.status ?? error?.statusCode);
  return Number.isFinite(status) && status > 0
    ? `HTTP ${status}`
    : String(error?.name || 'ProviderError').slice(0, 60);
}

export async function askService({ question, retrievalQuestion = question, language, state = 'Uttar Pradesh', skipLlm = false }) {
  // Task C-1: treat 'auto', undefined, empty string as 'detect'; call detectLanguage
  const lang =
    !language || language === 'auto' ? (detectLanguage(question) || 'en') : language;

  // Short-circuit for fields we cannot answer (no LLM call)
  if (touchesUnknownField(question, retrievalQuestion)) {
    const detectedService = isLegalQuestion(question) ? null : (detectService(question) || detectService(retrievalQuestion));
    return {
      answer: UNKNOWN_FIELD_MSG[lang] || UNKNOWN_FIELD_MSG.en,
      needs_human: true, needsHuman: true,
      generation_status: 'fallback',
      confidence: 0, retrieval_score: 0,
      retrieval_source: null, fallback_reason: 'unknown_field',
      guard_reason: 'unknown_field',
      sources: [],
      suggested_service_id: detectedService || null,
      suggestedService: detectedService || null,
      language_used: lang, language: lang
    };
  }

  // Priority 2 Guardrails: Fraud / fake document requests (e.g. GUARD-021)
  if (isFraudRequest(question)) {
    const fraudMsg = {
      en: "I cannot assist with obtaining, creating, or submitting fake or fraudulent certificates or documents. Please apply through legitimate official government portals (e.g. edistrict.up.gov.in).",
      hi: "मैं फर्जी, नकली या गैर-कानूनी प्रमाण पत्र बनाने या प्राप्त करने में सहायता नहीं कर सकता। कृपया आधिकारिक सरकारी पोर्टल (जैसे edistrict.up.gov.in) के माध्यम से ही वैध आवेदन करें।",
      hinglish: "Main fake ya fraudulent certificate banane ya prapt karne me sahayata nahi kar sakta. Kripya official portal (jaise edistrict.up.gov.in) se lawful application karein."
    };
    return {
      answer: fraudMsg[lang] || fraudMsg.en,
      needs_human: true, needsHuman: true,
      generation_status: 'guardrail',
      confidence: 0, retrieval_score: 0,
      retrieval_source: null, fallback_reason: 'fraud_request',
      guard_reason: 'fraud_request',
      sources: [],
      suggested_service_id: null,
      suggestedService: null,
      language_used: lang, language: lang
    };
  }

  if (isSensitiveCredentialOffer(question)) {
    const credentialMsg = {
      en: "Please do not send or share an Aadhaar OTP, PIN, password, or other login credential here. I cannot receive or use it. Enter an OTP only yourself on the official service page when you initiate a request.",
      hi: "कृपया यहाँ Aadhaar OTP, PIN, पासवर्ड या कोई अन्य लॉगिन जानकारी न भेजें और न साझा करें। मैं इसे प्राप्त या इस्तेमाल नहीं कर सकता। OTP केवल आधिकारिक सेवा पृष्ठ पर स्वयं दर्ज करें, जब आप अनुरोध शुरू करें।",
      hinglish: "Kripya Aadhaar OTP, PIN, password ya koi login credential yahan mat bhejein ya share karein. Main ise receive ya use nahi kar sakta. OTP sirf official service page par khud enter karein jab aap request shuru karein."
    };
    return {
      answer: credentialMsg[lang] || credentialMsg.en,
      needs_human: true, needsHuman: true,
      generation_status: 'guardrail',
      confidence: 0, retrieval_score: 0,
      retrieval_source: null, fallback_reason: 'sensitive_credential_offer',
      guard_reason: 'sensitive_credential_offer',
      sources: [], suggested_service_id: null, suggestedService: null,
      language_used: lang, language: lang
    };
  }

  if (isLiveCertificateStatusRequest(question)) {
    const statusMsg = {
      en: "I cannot access government systems or check a live certificate application status. Use the official eDistrict UP portal and the Service Request Number for status enquiries.",
      hi: "मैं सरकारी प्रणाली तक पहुँचकर प्रमाण-पत्र आवेदन की वर्तमान स्थिति नहीं देख सकता। स्थिति पूछने के लिए आधिकारिक eDistrict UP पोर्टल पर अपना Service Request Number इस्तेमाल करें।",
      hinglish: "Main government system access karke certificate application ka live status check nahi kar sakta. Status dekhne ke liye official eDistrict UP portal par apna Service Request Number use karein."
    };
    const statusService = detectService(question);
    return {
      answer: statusMsg[lang] || statusMsg.en,
      needs_human: true, needsHuman: true,
      generation_status: 'guardrail',
      confidence: 0, retrieval_score: 0,
      retrieval_source: null, fallback_reason: 'live_status_unavailable',
      guard_reason: 'live_status_unavailable',
      sources: [], suggested_service_id: statusService, suggestedService: statusService,
      language_used: lang, language: lang
    };
  }

  // Priority 2 Guardrails: Office authorization demands without verification (e.g. GUARD-028, GUARD-029)
  if (isOfficeAuthorizationDemand(question)) {
    const officeMsg = {
      en: "Office jurisdiction and authorization depend on official local administrative orders and cannot be guaranteed without verified official records. Please verify with the relevant municipal or tehsil office.",
      hi: "कार्यालय का अधिकार क्षेत्र और प्राधिकार स्थानीय प्रशासनिक आदेशों पर निर्भर करता है और सत्यापित आधिकारिक रिकॉर्ड के बिना इसकी गारंटी नहीं दी जा सकती। कृपया संबंधित नगर निगम या तहसील कार्यालय से पुष्टि करें।",
      hinglish: "Office jurisdiction aur authorization official local administrative records par depend karti hai aur bina verified proof ke guarantee nahi ki ja sakti. Kripya local tehsil ya municipal office se confirm karein."
    };
    return {
      answer: officeMsg[lang] || officeMsg.en,
      needs_human: true, needsHuman: true,
      generation_status: 'guardrail',
      confidence: 0, retrieval_score: 0,
      retrieval_source: null, fallback_reason: 'office_authorization_gap',
      guard_reason: 'office_authorization_gap',
      sources: [],
      suggested_service_id: null,
      suggestedService: null,
      language_used: lang, language: lang
    };
  }

  // Priority 2 Guardrails: Unsupported citation pressure (e.g. GUARD-032)
  if (isUnsupportedCitationDemand(question)) {
    const citationMsg = {
      en: "Legal sections and statutory provisions cannot be cited without verified supporting legal sources. Please consult the official text of the Bharatiya Nagarik Suraksha Sanhita (BNSS) or a qualified legal practitioner.",
      hi: "सत्यापित कानूनी स्रोतों के बिना कानूनी धाराओं या सांविधिक प्रावधानों का उल्लेख नहीं किया जा सकता। कृपया भारतीय नागरिक सुरक्षा संहिता (BNSS) के आधिकारिक पाठ या किसी योग्य कानूनी विशेषज्ञ से परामर्श लें।",
      hinglish: "Verified legal sources ke bina statutory sections ya dharaon ka daawa nahi kiya ja sakta. Kripya Bharatiya Nagarik Suraksha Sanhita (BNSS) ke official text ya legal expert se consult karein."
    };
    return {
      answer: citationMsg[lang] || citationMsg.en,
      needs_human: true, needsHuman: true,
      generation_status: 'guardrail',
      confidence: 0, retrieval_score: 0,
      retrieval_source: null, fallback_reason: 'unsupported_legal_citation',
      guard_reason: 'unsupported_legal_citation',
      sources: [],
      suggested_service_id: null,
      suggestedService: null,
      language_used: lang, language: lang
    };
  }

  // Retrieve – returns { chunks, retrievalSource, fallbackReason }
  // Keep follow-up context in the retrieval query, while generation always
  // receives the original latest user question.
  const comparison = isServiceComparison(question) ? detectServices(question) : [];
  const isComparison = isServiceComparison(question);

  const { chunks, retrievalSource, fallbackReason } = await retrieve(retrievalQuestion, state);
  // A contextual retrieval query may restore the legal topic omitted by a
  // short follow-up. Use it for domain/filter decisions, while generation
  // continues to receive the user's original wording below.
  const legalQuestion = isLegalQuestion(question) || isLegalQuestion(retrievalQuestion);

  // Two-tier threshold strategy:
  //   • regex-matched service or legal queries: use aiConfig.similarityThreshold (lenient) –
  //     the domain is already known, so chunks only need to meet the configured relevance bar.
  //   • non-regex Qdrant queries: use NON_REGEX_THRESHOLD (0.75) so near-domain OOS queries
  //     (max eval score = 0.74) are correctly rejected. Evaluation data:
  //       In-scope min: 0.70 (all regex-routed, threshold irrelevant)
  //       OOS max:      0.74 (no regex match, strict threshold needed)
  // A short follow-up may omit the service name; its retrieval query carries
  // the prior service reference for routing while generation still sees only
  // the latest question.
  const explicitQuestionService = detectService(question);
  const regexService = isComparison ? null : (
    explicitQuestionService || (legalQuestion ? null : detectService(retrievalQuestion))
  );

  let activeChunks = chunks;
  let activeRetrievalSource = retrievalSource;
  let activeFallbackReason = fallbackReason;

  // If regex matched, filter by that service; otherwise candidate is all retrieved chunks
  let candidateChunks = legalQuestion && !explicitQuestionService
    ? filterLegalChunksForQuestion(retrievalQuestion, activeChunks)
    : isComparison ? activeChunks.filter((chunk) => chunk.score >= (regexService || legalQuestion ? (activeRetrievalSource === 'qdrant' ? aiConfig.similarityThreshold : Math.min(aiConfig.similarityThreshold, 0.3)) : Math.max(0.76, aiConfig.similarityThreshold)))
      : regexService ? filterServiceChunksForQuestion(explicitQuestionService ? question : retrievalQuestion, filterChunksByService(activeChunks, regexService), regexService) : activeChunks;

  // When Qdrant retrieval returned hits but candidate filtering rejected all of them
  // (e.g. hits were legacy unsupported claims or calculation rules without supported route claims),
  // check local verified knowledge if local fallback is allowed.
  if (candidateChunks.length === 0 && activeRetrievalSource === 'qdrant' && aiConfig.allowLocalFallback) {
    const localTargetDomain = legalQuestion ? 'legal_rights' : 'citizen_service';
    const localServiceId = regexService || null;
    const localFallbackHits = retrieveLocal(retrievalQuestion, state, 15, localServiceId, localTargetDomain);
    const localCandidates = legalQuestion && !explicitQuestionService
      ? filterLegalChunksForQuestion(retrievalQuestion, localFallbackHits)
      : isComparison ? localFallbackHits.filter((chunk) => chunk.score >= Math.min(aiConfig.similarityThreshold, 0.3))
        : regexService ? filterServiceChunksForQuestion(explicitQuestionService ? question : retrievalQuestion, filterChunksByService(localFallbackHits, regexService), regexService) : localFallbackHits;
    if (localCandidates.length > 0) {
      activeChunks = localFallbackHits;
      activeRetrievalSource = 'local_fallback';
      activeFallbackReason = 'qdrant_no_eligible_candidates';
      candidateChunks = localCandidates;
    }
  }

  const topScore = candidateChunks[0]?.score ?? 0;
  const NON_REGEX_THRESHOLD = 0.76; // above highest observed OOS score (0.750 in local fallback, 0.740 in Qdrant)
  const threshold = regexService || legalQuestion
    ? (activeRetrievalSource === 'qdrant' ? aiConfig.similarityThreshold : Math.min(aiConfig.similarityThreshold, 0.3))
    : Math.max(NON_REGEX_THRESHOLD, aiConfig.similarityThreshold);

  // Rule: use detectService(question) if it matches; otherwise use top chunk's service ONLY
  // if retrieval is semantic (qdrant) and top score >= threshold (stricter for non-regex path); otherwise null.
  // In local fallback, lexical keyword overlap alone must never fabricate a service assignment.
  let suggestedServiceId = regexService;
  if (!suggestedServiceId) {
    if (activeRetrievalSource === 'qdrant' && candidateChunks.length > 0 && topScore >= threshold) {
      suggestedServiceId = legalQuestion ? null : candidateChunks[0]?.service_id ?? null;
    } else {
      suggestedServiceId = null;
    }
  }

  const filteredChunks = legalQuestion
    ? candidateChunks
    : isComparison ? candidateChunks
      : suggestedServiceId ? filterChunksByService(candidateChunks, suggestedServiceId) : [];
  const confidence = Math.round(topScore * 100) / 100;
  const sources = buildSources(filteredChunks.length > 0 ? filteredChunks : candidateChunks);
  const retrievedServices = new Set(filteredChunks.map((chunk) => chunk.service_id));
  const missingComparisonServices = isComparison
    ? comparison.filter((serviceId) => !retrievedServices.has(serviceId)).map((serviceId) => ({ service_id: serviceId, title: serviceName(serviceId) }))
    : [];

  const incomeCertificateQuestion = regexService === 'up_income_certificate';
  const asksIncomeFee = incomeCertificateQuestion && /\b(?:fee|fees|charge|cost)\b|\u{092b}\u{0940}\u{0938}|\u{0936}\u{0941}\u{0932}\u{094d}\u{0915}/iu.test(question);
  if (asksIncomeFee) {
    const feeUnavailable = {
      en: "I can't verify the current application fee for the Uttar Pradesh income certificate from the official sources available to me. Check the amount shown on the eDistrict UP portal before paying.",
      hi: "उत्तर प्रदेश आय प्रमाण पत्र का मौजूदा आवेदन शुल्क उपलब्ध आधिकारिक स्रोतों से सत्यापित नहीं कर पा रहा हूँ। भुगतान से पहले eDistrict UP पोर्टल पर दिखाई गई राशि जाँचें।",
      hinglish: "UP income certificate ki current application fee mere available official sources se verify nahi hoti. Payment se pehle eDistrict UP portal par dikhayi gayi amount check karein."
    };
    return {
      answer: feeUnavailable[lang] || feeUnavailable.en,
      needs_human: true, needsHuman: true, generation_status: 'guardrail',
      confidence: 0, retrieval_score: 0, retrieval_source: activeRetrievalSource,
      fallback_reason: 'income_certificate_fee_unverified', guard_reason: 'income_certificate_fee_unverified',
      sources: [], suggested_service_id: 'up_income_certificate', suggestedService: 'up_income_certificate',
      language_used: lang, language: lang
    };
  }

  const asksOtpMethod = incomeCertificateQuestion && /\b(?:aadhaar|aadhar|otp|one.time password|verification code|authentication|e-?kyc)\b|\u{0906}\u{0927}\u{093e}\u{0930}|\u{0913}\u{091f}\u{0940}\u{092a}\u{0940}/iu.test(question);
  if (asksOtpMethod) {
    const aadhaarRule = filteredChunks.find((chunk) => chunk.verified === true && /aadhaar identity requirement|565\/1-9-2023-R-9/i.test(`${chunk.topic || ''} ${chunk.text || ''}`));
    if (aadhaarRule) {
      const otpAnswers = {
        en: "The UP Revenue Department notification requires proof of Aadhaar possession or Aadhaar authentication for certificate issuance. It does not specify that OTP is the authentication method, so I can't confirm an OTP requirement from this source.",
        hi: "उत्तर प्रदेश राजस्व विभाग की अधिसूचना प्रमाण पत्र जारी करने के लिए आधार संख्या के प्रमाण या आधार प्रमाणीकरण की आवश्यकता बताती है। यह OTP को प्रमाणीकरण विधि नहीं बताती, इसलिए इस स्रोत से OTP की आवश्यकता की पुष्टि नहीं कर सकता।",
        hinglish: "UP Revenue Department ki notification certificate issue karne ke liye Aadhaar possession ka proof ya Aadhaar authentication maangti hai. Isme OTP ko method nahi bataya gaya, isliye is source se OTP requirement confirm nahi hoti."
      };
      return {
        answer: otpAnswers[lang] || otpAnswers.en,
        needs_human: false, needsHuman: false, generation_status: 'grounded_guardrail',
        confidence, retrieval_score: confidence, retrieval_source: activeRetrievalSource,
        fallback_reason: activeFallbackReason, guard_reason: 'aadhaar_authentication_method_unspecified',
        sources: buildSources([aadhaarRule]), suggested_service_id: 'up_income_certificate', suggestedService: 'up_income_certificate',
        language_used: lang, language: lang
      };
    }
  }

  if (filteredChunks.length === 0 || topScore < threshold) {
    const guardReason = candidateChunks.length === 0 ? 'no_chunks' : 'similarity_threshold';
    console.info('[RAG] Decision', JSON.stringify({
      domain: legalQuestion ? 'legal_rights' : 'citizen_service',
      language: lang,
      retrievalSource: activeRetrievalSource,
      scoreMeaning: activeRetrievalSource === 'local_fallback' ? 'lexical_overlap' : 'vector_similarity',
      retrievedCount: activeChunks.length,
      candidateCount: candidateChunks.length,
      selectedCount: filteredChunks.length,
      retrievalScore: topScore,
      threshold,
      guardReason,
      sourceIds: []
    }));
    // When the guard_reason is similarity_threshold or no_chunks and no service was detected by regex, suggested_service_id must be null.
    const finalSuggestedService = regexService || null;
    return {
      answer: LOW_CONF_MSG[lang] || LOW_CONF_MSG.en,
      needs_human: true, needsHuman: true,
      generation_status: 'fallback',
      confidence, retrieval_score: confidence,
      retrieval_source: activeRetrievalSource, fallback_reason: activeFallbackReason || 'low_confidence',
      guard_reason: guardReason,
      sources: filteredChunks.length > 0 ? sources : [],
      suggested_service_id: finalSuggestedService,
      suggestedService: finalSuggestedService,
      language_used: lang, language: lang
    };
  }

  if (asksGuaranteedFraudRecovery(question)) {
    const guaranteeEvidence = filteredChunks.find((chunk) =>
      /does not guarantee.{0,100}(?:funds|money).{0,40}(?:recover|return)|does not guarantee recovery of funds/i.test(chunk.text || '')
    );
    if (guaranteeEvidence) {
      const guaranteeAnswer = {
        en: "No. Reporting does not guarantee that the money will be recovered. The official guidance also says it cannot guarantee a particular police or provider action.",
        hi: "नहीं। शिकायत दर्ज करने से पैसे वापस मिलने की गारंटी नहीं होती। आधिकारिक मार्गदर्शन किसी विशेष पुलिस या भुगतान-सेवा कार्रवाई की भी गारंटी नहीं देता।",
        hinglish: "Nahi. Complaint report karne se paise wapas milne ki guarantee nahi hoti. Official guidance kisi particular police ya provider action ki bhi guarantee nahi deti."
      };
      return {
        answer: guaranteeAnswer[lang] || guaranteeAnswer.en,
        needs_human: false, needsHuman: false,
        generation_status: 'grounded_guardrail',
        confidence, retrieval_score: confidence,
        retrieval_source: activeRetrievalSource, fallback_reason: activeFallbackReason,
        guard_reason: 'verified_no_recovery_guarantee',
        sources: buildSources([guaranteeEvidence]),
        suggested_service_id: null, suggestedService: null,
        language_used: lang, language: lang
      };
    }
  }

  if (skipLlm) {
    return {
      answer: 'LLM skipped (--no-llm)',
      needs_human: false, needsHuman: false,
      generation_status: 'skipped',
      confidence, retrieval_score: confidence,
      retrieval_source: activeRetrievalSource, fallback_reason: activeFallbackReason,
      guard_reason: 'in_scope',
      sources,
      suggested_service_id: suggestedServiceId, suggestedService: suggestedServiceId,
      language_used: lang, language: lang
    };
  }

  let genResult = null;
  let generationFallbackReason = null;
  const provider = aiConfig.generationProvider;
  const useGemini = provider !== 'groq' && Date.now() >= geminiQuotaCooldownUntil;
  console.info('[AI] Generation invoked', JSON.stringify({
    provider: useGemini ? 'gemini' : 'groq',
    candidateCount: filteredChunks.length,
    sourceIds: sources.map((source) => source.id)
  }));

  const generationOptions = isComparison
    ? { comparedServices: comparison.map((serviceId) => ({ service_id: serviceId, title: serviceName(serviceId) })), missingComparisonServices }
    : undefined;

  if (!useGemini) {
    try {
      genResult = await generateWithGroq(question, lang, filteredChunks, generationOptions);
    } catch (groqErr) {
      generationFallbackReason = 'groq_generation_failed';
      console.error('[AI] Groq generation failed; using grounded chunk fallback:', safeProviderError(groqErr));
      genResult = fallbackFromChunks(filteredChunks, lang, question);
    }
  } else {
    try {
      genResult = await generateWithGemini(question, lang, filteredChunks, generationOptions);
      geminiQuotaCooldownUntil = 0;
    } catch (geminiErr) {
      generationFallbackReason = 'gemini_generation_failed';
      if (isQuotaError(geminiErr)) geminiQuotaCooldownUntil = Date.now() + GEMINI_QUOTA_COOLDOWN_MS;
      console.warn('[AI] Gemini unavailable, attempting Groq fallback:', safeProviderError(geminiErr));
      try {
        genResult = await generateWithGroq(question, lang, filteredChunks, generationOptions);
      } catch (groqErr) {
        generationFallbackReason = 'all_generation_providers_failed';
        console.error('[AI] Both generation providers failed; using grounded chunk fallback:', safeProviderError(groqErr));
        genResult = fallbackFromChunks(filteredChunks, lang, question);
      }
    }
  }

  console.info('[RAG] Decision', JSON.stringify({
    domain: legalQuestion ? 'legal_rights' : 'citizen_service',
    language: lang,
    retrievalSource: activeRetrievalSource,
    scoreMeaning: activeRetrievalSource === 'local_fallback' ? 'lexical_overlap' : 'vector_similarity',
    retrievedCount: activeChunks.length,
    candidateCount: candidateChunks.length,
    selectedCount: filteredChunks.length,
    retrievalScore: topScore,
    threshold,
    guardReason: genResult.needs_human ? 'llm_needs_human' : 'in_scope',
    generationStatus: genResult.generation_status,
    generationFallbackReason,
    sourceIds: sources.map((source) => source.id)
  }));
  return {
    answer: genResult.answer,
    needs_human: genResult.needs_human, needsHuman: genResult.needs_human,
    generation_status: genResult.generation_status,
    confidence, retrieval_score: confidence,
    retrieval_source: activeRetrievalSource, fallback_reason: activeFallbackReason,
    generation_fallback_reason: generationFallbackReason,
    guard_reason: genResult.needs_human ? 'llm_needs_human' : 'in_scope',
    sources,
    suggested_service_id: suggestedServiceId, suggestedService: suggestedServiceId,
    language_used: lang, language: lang
  };
}

// ── Conversation API Implementation ──────────────────────────────────────────
import crypto from 'crypto';
import { prisma, isDbConnected } from '../../config/db.js';
import { INITIAL_SERVICES } from '../services/service.service.js';
import { logger } from '../../utils/logger.js';
import { ApiError } from '../../utils/apiError.js';

export const SLUG_TO_SERVICE_NAME = {
  up_income_certificate: 'Income Certificate',
  up_caste_certificate: 'Caste Certificate',
  up_domicile_certificate: 'Domicile Certificate',
  up_birth_certificate: 'Birth Certificate',
  up_death_certificate: 'Death Certificate',
  up_marriage_certificate: 'Marriage Certificate',
  up_ews_certificate: 'EWS Certificate',
  up_disability_certificate: 'Disability Certificate',
  up_character_certificate: 'Character Certificate'
};

export async function resolveSuggestedService(slug) {
  if (!slug) return null;
  const serviceName = SLUG_TO_SERVICE_NAME[slug];
  if (!serviceName) {
    logger.warn(`[AI] Unknown service slug: ${slug}`);
    return null;
  }

  let service = null;
  if (prisma && isDbConnected) {
    try {
      service = await prisma.service.findFirst({
        where: {
          name: { equals: serviceName, mode: 'insensitive' },
          isActive: true
        },
        select: { id: true, name: true }
      });
    } catch (err) {
      // Fall through to fallback
    }
  }

  if (!service) {
    service = INITIAL_SERVICES.find(
      (s) => s.name.toLowerCase() === serviceName.toLowerCase() && s.isActive
    );
  }

  if (service) {
    return { id: service.id, name: service.name };
  }

  logger.warn(`[AI] Service not found for slug: ${slug} (name: ${serviceName})`);
  return null;
}

// In-memory fallback store for when DB is disconnected
let inMemoryLogged = false;
export const inMemoryConversations = new Map();
export const inMemoryMessages = new Map();

function logInMemoryActive() {
  if (!inMemoryLogged) {
    logger.info('[AI] In-memory conversation store is active');
    inMemoryLogged = true;
  }
}

export async function createConversationService(userId, { language = 'en', title }) {
  const convId = crypto.randomUUID();
  const now = new Date();
  const convTitle = title || 'New Conversation';

  let conv = null;
  if (prisma && isDbConnected) {
    try {
      conv = await prisma.aiConversation.create({
        data: {
          id: convId,
          userId,
          language,
          title: convTitle,
          createdAt: now,
          updatedAt: now
        }
      });
    } catch (err) {
      // Fallback to in-memory
    }
  }

  if (!conv) {
    logInMemoryActive();
    conv = {
      id: convId,
      userId,
      language,
      title: convTitle,
      createdAt: now,
      updatedAt: now
    };
    inMemoryConversations.set(convId, conv);
    inMemoryMessages.set(convId, []);
  }

  return {
    conversationId: conv.id,
    language: conv.language,
    title: conv.title,
    createdAt: conv.createdAt
  };
}

export async function listConversationsService(userId) {
  let conversations = null;
  if (prisma && isDbConnected) {
    try {
      conversations = await prisma.aiConversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          language: true,
          updatedAt: true
        }
      });
    } catch (err) {
      // Fallback
    }
  }

  if (!conversations) {
    logInMemoryActive();
    conversations = Array.from(inMemoryConversations.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({
        id: c.id,
        title: c.title,
        language: c.language,
        updatedAt: c.updatedAt
      }));
  }

  return conversations;
}

export async function getConversationDetailsService(userId, conversationId) {
  let conv = null;
  let rawMessages = [];

  if (prisma && isDbConnected) {
    try {
      conv = await prisma.aiConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
      if (conv) {
        if (conv.userId !== userId) {
          throw ApiError.notFound('Conversation not found');
        }
        rawMessages = conv.messages;
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Fallback
    }
  }

  if (!conv) {
    logInMemoryActive();
    conv = inMemoryConversations.get(conversationId);
    if (!conv || conv.userId !== userId) {
      throw ApiError.notFound('Conversation not found');
    }
    rawMessages = inMemoryMessages.get(conversationId) || [];
  }

  const messages = rawMessages.map((m) => ({
    id: m.id,
    sender: m.sender,
    content: m.content,
    createdAt: m.createdAt
  }));

  return {
    id: conv.id,
    title: conv.title,
    language: conv.language,
    messages
  };
}

const CONTEXTUAL_FOLLOW_UP_RE = /\b(?:it|that|they|them|their|this|those|first|before|after|then|also|and|what about|where|which|how|is that|does that|what happens|mentioned|mentions|evidence|proof|report|complaint|notify|inform|bank|fee|documents?)\b|\b(?:iske|uske|unka|unhe|unko|yeh|woh|iske baad|aur|phir|kya|kaise|kahan|kaunse|kaun se|saboot|pramaan|sabak|report|shikayat|bank|notify|inform|pehle|baad)\b|(?:क्या|कहाँ|किस|कैसे|पहले|बाद|रिपोर्ट|शिकायत|सबूत|प्रमाण|साक्ष्य|जमा|इकट्ठा|बैंक|बताएं|बताएँ|सूचित|करूं|करूँ)/iu;

const CONTEXTUAL_APPLICATION_FOLLOW_UP_RE = /\b(?:the\s+)?application\b|\bform\b|आवेदन|फॉर्म|प्रपत्र|बैंक|सूचित|लेन-देन|अनधिकृत/iu;

/**
 * Build a retrieval-only query from the latest user turn and the nearest
 * earlier user turn that names a topic. Assistant text is deliberately
 * excluded: it can help identify context, but must never be source evidence.
 */
export function buildContextualRetrievalQuery(question, messages = []) {
  if (detectService(question)) return question;
  // A newly named legal topic is an explicit topic change. Generic legal
  // classifications (for example, immediate-danger wording) are not enough to
  // discard a named topic from earlier in the conversation.
  const explicitLegalTopic = /\b(?:cybercrime|cyber\s+crime|online\s+(?:payment\s+)?fraud|online\s+scam|scam(?:med)?\s+online|upi\s+fraud|fraud(?:ulent)?\s+(?:upi|transaction|payment)|unauthori[sz]ed\s+(?:transaction|payment)|consumer(?:\s+protection)?|domestic\s+violence|protection\s+order|legal\s+aid|bnss|fir|fundamental\s+rights?|constitutional\s+rights?)\b|(?:साइबर अपराध|साइबर धोखाधड़ी|ऑनलाइन धोखाधड़ी|ऑनलाइन ठगी|ऑनलाइन स्कैम|यूपीआई धोखाधड़ी|यूपीआई फ्रॉड|अनधिकृत लेन-देन|उपभोक्ता शिकायत|घरेलू हिंसा|कानूनी सहायता|मौलिक अधिकार|संवैधानिक अधिकार)/iu.test(question);
  if (explicitLegalTopic) return question;
  if (!CONTEXTUAL_FOLLOW_UP_RE.test(question) && !CONTEXTUAL_APPLICATION_FOLLOW_UP_RE.test(question)) return question;

  // Follow-ups often form a chain (topic, documents, Aadhaar detail). Looking
  // only at the immediately preceding turn loses the original topic after the
  // first short follow-up, so find the nearest earlier user turn that names a
  // service or legal topic. Assistant text is never used as source evidence.
  const previousTopic = [...messages].reverse().find((message) =>
    message.sender === 'USER' && message.content &&
    (detectService(message.content) || isLegalQuestion(message.content))
  )?.content || '';
  if (!previousTopic) return question;

  // Preserve the existing citizen-service query format. For legal topics,
  // carry only the prior user topic, never the prior assistant's assertions.
  if (detectService(previousTopic)) return `${previousTopic}. ${question}`;
  return `Topic: ${previousTopic}. Follow-up: ${question}`;
}

export async function postMessageService(userId, conversationId, { question, language }) {
  let conv = null;
  let existingMessages = [];

  if (prisma && isDbConnected) {
    try {
      conv = await prisma.aiConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } }
        }
      });
      if (conv) {
        if (conv.userId !== userId) {
          throw ApiError.notFound('Conversation not found');
        }
        existingMessages = conv.messages;
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Fallback
    }
  }

  if (!conv) {
    logInMemoryActive();
    conv = inMemoryConversations.get(conversationId);
    if (!conv || conv.userId !== userId) {
      throw ApiError.notFound('Conversation not found');
    }
    existingMessages = inMemoryMessages.get(conversationId) || [];
  }

  const userMsgId = crypto.randomUUID();
  const nowUser = new Date();
  const userMsgData = {
    id: userMsgId,
    conversationId,
    sender: 'USER',
    content: question,
    createdAt: nowUser
  };

  // Resolve an omitted topic from the immediately preceding user turn. Keep
  // the submitted question unchanged for generation and conversation display.
  const retrievalText = buildContextualRetrievalQuery(question, existingMessages);

  const langToUse = language || conv.language || 'en';
  const result = await askService({
    question,
    retrievalQuestion: retrievalText,
    language: langToUse,
    state: 'Uttar Pradesh'
  });

  const suggestedService = await resolveSuggestedService(result.suggested_service_id);

  const formattedSources = (result.sources || []).map((s) => ({
    id: s.id || s.source_id || s.source_ref || s.chunk_id || '',
    title: s.title || s.topic || '',
    sourceUrl: s.source_url || s.url || s.sourceUrl || '',
    department: s.department || '',
    serviceId: s.service_id || '',
    sourceType: s.source_type || '',
    topic: s.topic || ''
  }));

  const aiMsgId = crypto.randomUUID();
  const nowAi = new Date();
  const confidenceNum = typeof result.confidence === 'number' ? result.confidence : 0;
  const needsHumanBool = Boolean(result.needs_human ?? result.needsHuman ?? false);

  const aiMsgData = {
    id: aiMsgId,
    conversationId,
    sender: 'AI',
    content: result.answer,
    confidence: confidenceNum,
    needsHuman: needsHumanBool,
    sources: formattedSources,
    suggestedServiceId: suggestedService?.id || null,
    suggestedServiceName: suggestedService?.name || null,
    createdAt: nowAi
  };

  let savedInDb = false;
  if (prisma && isDbConnected) {
    try {
      await prisma.aiMessage.createMany({
        data: [
          {
            id: userMsgData.id,
            conversationId,
            sender: 'USER',
            content: userMsgData.content,
            createdAt: userMsgData.createdAt
          },
          {
            id: aiMsgData.id,
            conversationId,
            sender: 'AI',
            content: aiMsgData.content,
            confidence: aiMsgData.confidence,
            needsHuman: aiMsgData.needsHuman,
            sources: aiMsgData.sources,
            suggestedServiceId: aiMsgData.suggestedServiceId,
            suggestedServiceName: aiMsgData.suggestedServiceName,
            createdAt: aiMsgData.createdAt
          }
        ]
      });

      const newTitle = conv.title === 'New Conversation' ? question.slice(0, 40) : conv.title;
      await prisma.aiConversation.update({
        where: { id: conversationId },
        data: { title: newTitle, language: langToUse, updatedAt: nowAi }
      });
      conv.language = langToUse;
      savedInDb = true;
    } catch (dbErr) {
      // Fallback
    }
  }

  if (!savedInDb) {
    logInMemoryActive();
    const list = inMemoryMessages.get(conversationId) || [];
    list.push(userMsgData, aiMsgData);
    inMemoryMessages.set(conversationId, list);

    if (conv.title === 'New Conversation') {
      conv.title = question.slice(0, 40);
    }
    conv.language = langToUse;
    conv.updatedAt = nowAi;
  }


  return {
    messageId: aiMsgId,
    answer: result.answer,
    language: result.language_used || langToUse,
    confidence: confidenceNum,
    needsHuman: needsHumanBool,
    sources: formattedSources,
    suggestedService,
    generationStatus: result.generation_status,
    generationFallbackReason: result.generation_fallback_reason || null
  };
}
