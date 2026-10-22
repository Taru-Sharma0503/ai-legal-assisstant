import fs from 'fs';
import path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenAI } from '@google/genai';
import { aiConfig } from '../../config/ai.js';
import { prisma } from '../../config/db.js';
import { buildChunks } from './chunkBuilder.js';
// ── Service-detection patterns ─────────────────────────────────────────────
const SERVICE_PATTERNS = [
  {
    service_id: 'up_income_certificate',
    pattern: /income\s*certif|आय\s*प्रमाण|aay\s*praman|income\s*praman|आय\s*पत्र|aay\s*patra|\bincome\s+proof\b/i
  },
  {
    service_id: 'up_caste_certificate',
    // Also covers: SC certificate, ST certificate, OBC certificate (UP-specific),
    // jati pramaan patra, jati praman, SC praman patra
    pattern: /caste\s*certif|जाति\s*प्रमाण|jati\s*pram|caste\s*pram|\bsc\s+certif|\bst\s+certif|\bobc\s+certif|sc\s+praman|st\s+praman|obc\s+praman|अनुसूचित\s*जाति|अनुसूचित\s*जनजाति|jati\s*patra|jati\s*certificate/i
  },
  {
    service_id: 'up_domicile_certificate',
    // Also covers: niwas patra, residence certificate, proof of residence, nivas praman
    pattern:
      /domicile\s*certif|निवास\s*प्रमाण|niwas\s*pram|nivas\s*pram|domicile\s*pram|residence\s*certif|proof\s*of\s*resid(?:ence|ency)|niwas\s*patra|nivas\s*patra|residence\s*proof|rehne\s*ka\s*praman|\bi\s+need\s+(?:a\s+)?(?:proof\s+of\s+resid|domicile|niwas)/i
  },
  {
    service_id: 'up_birth_certificate',
    // Fix (Fact 6): added "birth\s*(is\s*)?regist" variant, janm patra, janam pramaan
    pattern:
      /birth\s*certif|birth\s*(is\s*)?regist|जन्म\s*प्रमाण|जन्म\s*पंजीकरण|janm.{0,30}\b(?:registr\w*|panjikaran)\b|janam.{0,30}\b(?:registr\w*|panjikaran)\b|janm\s*praman|janam\s*praman|janm\s*patra|janam\s*patra|janm\s*pramaan|janam\s*pramaan/i
  },
  {
    service_id: 'up_death_certificate',
    // Also covers: mrityu patra, maut praman
    pattern:
      /death\s*certif|death\s*regist|मृत्यु\s*प्रमाण|मृत्यु\s*पंजीकरण|mrityu\s*praman|mrityu\s*pramaan|mrityu\s*patra|maut\s*praman|maut\s*certif/i
  },
  {
    service_id: 'up_marriage_certificate',
    // Also covers: vivah patra, shaadi ka praman, nikah certificate
    pattern:
      /marriage\s*certif|विवाह\s*प्रमाण|vivah\s*praman|shaadi\s*certif|shadi\s*certif|शादी\s*प्रमाण|vivah\s*patra|shaadi\s*praman|shadi\s*praman|nikah\s*certif/i
  },
  {
    service_id: 'up_ews_certificate',
    pattern: /\bews\b|economically\s*weaker|ईडब्ल्यूएस|आर्थिक\s*रूप\s*से\s*कमजोर/i
  },
  {
    service_id: 'up_disability_certificate',
    // Also covers: viklang praman, handicap certificate, divyang patra
    pattern:
      /disability\s*certif|दिव्यांगता\s*प्रमाण|दिव्यांग\s*प्रमाण|divyangta\s*praman|divyang\s*certif|viklang\s*certif|विकलांगता\s*प्रमाण|viklang\s*praman|handicap\s*certif|divyang\s*patra|viklang\s*patra/i
  },
  {
    service_id: 'up_character_certificate',
    // Also covers: charitra patra, conduct certificate, police character
    pattern: /character\s*certif|चरित्र\s*प्रमाण|charitra\s*praman|charitra\s*patra|conduct\s*certif|police\s*character\s*certif/i
  }
];
// States that are NOT Uttar Pradesh — if mentioned, regex routing should not fire
const OTHER_STATES_RE =
  /\b(bihar|delhi|rajasthan|maharashtra|gujarat|punjab|haryana|madhya\s*pradesh|west\s*bengal|karnataka|tamil\s*nadu|telangana|andhra|jharkhand|odisha|chhattisgarh|assam|kerala|goa|himachal|uttarakhand|meghalaya|manipur|nagaland|mizoram|tripura|sikkim|arunachal)\b/i;
export function detectService(question) {
  if (!question) return null;
  // Do NOT fire regex if the user explicitly mentions a different state
  if (OTHER_STATES_RE.test(question)) return null;
  // If it is a comparison or cross-service query, do not assign a single service ID
  if (isServiceComparison(question)) return null;
  for (const item of SERVICE_PATTERNS) {
    if (item.pattern.test(question)) {
      return item.service_id;
    }
  }
  return null;
}

export function detectServices(question) {
  if (!question || OTHER_STATES_RE.test(question)) return [];
  return SERVICE_PATTERNS
    .filter(({ pattern }) => pattern.test(question))
    .map(({ service_id }) => service_id);
}

const SERVICE_NAMES = Object.freeze({
  up_income_certificate: 'Income Certificate',
  up_caste_certificate: 'Caste Certificate',
  up_domicile_certificate: 'Domicile Certificate',
  up_birth_certificate: 'Birth Certificate',
  up_death_certificate: 'Death Certificate',
  up_marriage_certificate: 'Marriage Certificate',
  up_ews_certificate: 'EWS Certificate',
  up_disability_certificate: 'Disability Certificate',
  up_character_certificate: 'Character Certificate'
});
export function serviceName(serviceId) { return SERVICE_NAMES[serviceId] || serviceId; }

export function isServiceComparison(question) {
  if (!question) return false;
  if (/\b(?:compare|comparison|versus|vs\.?|difference between)\b|तुलना|अंतर\s*(?:बताएं|क्या)/i.test(question)) {
    return true;
  }
  // Cross-service proof / substitution / multi-certificate query (e.g. GUARD-037)
  if (/\b(?:automatically\s*prove|prove\s*(?:my\s*)?(?:income|caste|domicile|residence)|substitute|valid\s*as\s*(?:income|caste|domicile)|valid\s*for\s*(?:both|all)|work\s*as\s*(?:income|caste)|kaam\s*karega|bhi\s*chalega)\b/i.test(question)) {
    return true;
  }
  return false;
}

// ── Guardrail Helper Patterns ──────────────────────────────────────────────
export const FRAUD_REQUEST_RE = /\b(?:fake|forge\w*|forgery|bribe|buy\s+a\s+fake|nakli|farzi|farji|jaali|duplikat|two\s+number)\b|फर्जी|नकली|जालसाजी|जाली/i;
export function isFraudRequest(question) {
  return Boolean(question && FRAUD_REQUEST_RE.test(question));
}

export const OFFICE_AUTH_DEMAND_RE = /\b(?:source\s*nahi\s*chahiye|pakka\s*batao|definitely\s*issue)\b|स्रोत\s*नहीं\s*चाहिए|पक्का\s*बताओ/i;
export function isOfficeAuthorizationDemand(question) {
  return Boolean(question && OFFICE_AUTH_DEMAND_RE.test(question));
}

export const UNSUPPORTED_CITATION_DEMAND_RE = /बिना\s*स्रोत|\b(?:without\s*(?:checking\s*)?sources?|without\s*evidence|guess.*section|invent.*section)\b/i;
export function isUnsupportedCitationDemand(question) {
  return Boolean(question && UNSUPPORTED_CITATION_DEMAND_RE.test(question));
}


// ── Modular Legal Intent Patterns ──────────────────────────────────────────

// 1. Cybercrime & Online Fraud
// NOTE: \b word-boundary anchors are NOT used around Devanagari/Unicode text because
// JavaScript regex \b only matches at ASCII word boundaries and silently fails to match
// at Unicode character positions. All Devanagari patterns use bare text matching.
export const CYBERCRIME_INTENT_RE = new RegExp(
  [
    /\b(?:cybercrime|cyber\s+crime|cyber\s+fraud|cyber\s+cell|cyber\s+police|1930|cybercrime\.gov\.in)\b/i.source,
    /\b(?:online|cyber)\s*(?:scam|fraud|theft|thagi|cheating|threat\w*|blackmail\w*|harass\w*)\b/i.source,
    // Devanagari online/cyber crime — no \b anchors (Unicode boundary issue)
    /ऑनलाइन\s*(?:स्कैम\w*|ठगी|धोखाधड़ी|फ्रॉड|घोटाला\w*|ब्लैकमेल|अपराध|धमकी)|साइबर\s*(?:स्कैम\w*|ठगी|धोखाधड़ी|फ्रॉड|घोटाला\w*|अपराध)/i.source,
    /(?:मेरे\s+साथ|मुझे|मेरा|मेरे).{0,25}(?:ऑनलाइन\s*)?(?:स्कैम|ठगी|धोखा|धोखाधड़ी|फ्रॉड|घोटाला)|(?:ऑनलाइन|साइबर).{0,30}(?:स्कैम|ठगी|धोखा|धोखाधड़ी|फ्रॉड|घोटाला)/i.source,
    /\b(?:cyber|online)\s+thagi\b/i.source,
    /\b(?:upi|bank|account|wallet|credit\s*card|debit\s*card)\b.{0,40}\b(?:without\s+permission|bina\s+permission|bina\s+anumati|unauthori[sz]ed|kat\s+gaye|chori|stolen)\b/i.source,
    /(?:upi|बैंक|खाते).{0,30}(?:बिना\s+अनुमति|पैसे\s+कट|पैसे\s+निकल|पैसे\s+चोरी)/i.source,
    /\b(?:money|funds|paise|paisa|rupaye)\b.{0,35}\b(?:taken|stolen|deducted|chori|kat\s+gaye)\b.{0,35}\b(?:upi|without\s+permission|bina\s+permission|online|bank)\b/i.source,
    // Account/social media hacking — 'hacked?' only matches 'hacke'/'hacked', not plain 'hack'.
    // Fixed to hack(?:ed|ing)? and added Devanagari social-media hack (no \b anchors)
    /\b(?:social\s+media|instagram|facebook|whatsapp|account|profile)\b.{0,40}\bhack(?:ed|ing)?\b/i.source,
    /सोशल\s+मीडिया.{0,30}हैक|अकाउंट.{0,20}हैक|(?:account|profile).{0,20}hack(?:ed|ing)?/i.source,
    /\b(?:evidence|proof|screenshot|saboot|pramaan|सबूत).{0,35}(?:cyber|scam|fraud|thagi|ऑनलाइन\s+ठगी|साइबर\s+ठगी)\b/i.source,
    // Suspicious link / phishing — Devanagari variant without \b anchors
    /\b(?:phishing|suspicious\s+link|fake\s+link)\b|संदिग्ध\s+लिंक/i.source,
    // Online threats — also match reversed order (online BEFORE dhamka/threat)
    /\b(?:blackmail\w*|threat\w*|harass\w*|dhamki|dhamka)\b.{0,40}\b(?:online|cyber|internet)\b/i.source,
    /\b(?:online|cyber|internet)\b.{0,40}\b(?:dhamk\w*|blackmail\w*|threat\w*|harass\w*)\b/i.source,
    /ऑनलाइन.{0,20}धमका|धमका.{0,20}ऑनलाइन|ब्लैकमेल/i.source,
    // Photo/image misuse — also match when 'online' precedes 'misuse/without permission'
    /\b(?:photo|photos|picture|tashveer)\b.{0,60}(?:misuse|without\s+permission|bina\s+permission)/i.source,
    /\b(?:using|misuse|misusing)\b.{0,30}\b(?:photo|photos|picture|image)\b.{0,30}\b(?:online|without\s+permission)\b/i.source,
    // Devanagari photo misuse — no \b anchors
    /तस्वीर.{0,40}(?:गलत\s+इस्तेमाल|ऑनलाइन|मिसयूज)|गलत\s+इस्तेमाल.{0,30}तस्वीर/i.source,
    /photos?.{0,30}(?:online\s+misuse|misuse.{0,20}online)/i.source
  ].join('|'),
  'i'
);


// 2. Consumer Rights & Complaints
// NOTE: \b anchors are omitted around Devanagari text — see note above CYBERCRIME_INTENT_RE.
export const CONSUMER_INTENT_RE = new RegExp(
  [
    // Explicit consumer helpline / forum keywords — ASCII safe with \b
    /\b(?:consumer|1915|nch|national\s+consumer\s+helpline|consumer\s+forum|consumer\s+court|consumer\s+commission)\b/i.source,
    // Devanagari consumer keywords — no \b anchors
    /उपभोक्ता\s*(?:हेल्पलाइन|अदालत|फोरम|आयोग|शिकायत|अधिकार|मामला)|upbhokta\s*(?:shikayat|adhikar)/i.source,
    /\b(?:defective|damaged|expired|faulty|poor\s+service)\b.{0,40}\b(?:product|goods|item|order|device|service|samaan|saaman)\b/i.source,
    /खराब\s+(?:सामान|उत्पाद|वस्तु)|दोषपूर्ण\s+(?:सामान|सेवा)|एक्सपायर्ड/i.source,
    // Seller/company refusing refund — ASCII company then refund
    /\b(?:seller|shopkeeper|company|vendor|store|merchant|dealer)\b.{0,60}\b(?:refus\w*|denied|denying|nahi\s+de\s*rahi|inkar)\b.{0,40}\b(?:refund|replace(?:ment)?|return|exchange)\b/i.source,
    // Devanagari: company refund nahi de rahi (refund before nahi de rahi, or after)
    /कंपनी.{0,40}रिफंड|रिफंड.{0,30}(?:नहीं\s+दे|nahi\s+de)|company.{0,30}refund.{0,30}nahi/i.source,
    // ASCII refund refusal (either order)
    /\b(?:refus\w*|nahi\s+de\s*rahi|mana\s+kar)\b.{0,40}\b(?:my\s+)?refund\b/i.source,
    /\brefund\b.{0,40}\b(?:nahi\s+de\s*rahi|nahi\s+de\s*raha|refused|not\s+giving|denied)\b/i.source,
    // Online order not delivered — also Devanagari (ऑनलाइन ऑर्डर)
    /\b(?:online\s+order|courier|delivery)\b.{0,35}\b(?:never\s+arrived|not\s+delivered|nahi\s+aaya|नहीं\s+आया|नहीं\s+मिला)\b/i.source,
    /ऑनलाइन.{0,10}ऑर्डर.{0,30}(?:नहीं|nahi)|ऑर्डर.{0,30}(?:नहीं\s+आया|नहीं\s+मिला)/i.source,
    // Customer support not responding — Devanagari variant (no \b)
    /\b(?:customer\s+(?:support|care))\b.{0,35}\b(?:not\s+responding|reply\s+nahi|no\s+reply)\b/i.source,
    /कस्टमर\s+(?:सपोर्ट|केयर|सर्विस).{0,30}(?:जवाब\s+नहीं|reply\s+nahi)|जवाब\s+नहीं\s+दे\s+रहा/i.source,
    // Paid for service but not received — Devanagari (no \b) + Hindi नहीं मिली + Hinglish
    /\b(?:paid\s+for\s+(?:a\s+)?service|promised\s+service)\b.{0,50}\b(?:not\s+received?|did\s+not\s+receive|deficien)\b/i.source,
    /(?:service\s+ke\s+paise|paise\s+diye|promised\s+service).{0,50}(?:nahi\s+mili|not\s+received?|did\s+not)/i.source,
    /सेवा\s+के\s+पैसे.{0,50}(?:नहीं\s+मिली|नहीं\s+मिला|nahi\s+mili)|वादा\s+की\s+गई\s+सेवा.{0,30}(?:नहीं|nahi)/i.source,
    // Purchase bill lost — Devanagari (no \b) + Hinglish kho gaya
    /\b(?:purchase\s+bill|lost\s+(?:the\s+)?bill)\b.{0,40}\b(?:complain\w*|still)\b/i.source,
    /खरीद\s+का\s+बिल|बिल\s+खो\s+गया|purchase\s+bill.{0,20}(?:kho|lost)/i.source,
    // Private builder / builder complaint — Devanagari (no \b)
    /\b(?:private\s+builder|builder\s+complaint|complain\s+about\s+a\s+builder)\b/i.source,
    /निजी\s+बिल्डर|बिल्डर\s+के\s+खिलाफ/i.source,
    // Consumer case / dispute — Devanagari (no \b)
    /\b(?:consumer\s+case|consumer\s+dispute)\b/i.source
  ].join('|'),
  'i'
);

// 3. Domestic Violence & Protection
// NOTE: \b anchors are omitted around Devanagari text — see note above CYBERCRIME_INTENT_RE.
export const DOMESTIC_VIOLENCE_INTENT_RE = new RegExp(
  [
    // Core DV terms — ASCII safe with \b; Devanagari bare
    /\b(?:domestic\s+violence|gharelu\s+hinsa|pwdva|\b181\b|mahila\s+helpline|protection\s+order)\b/i.source,
    /घरेलू\s+हिंसा|महिला\s+हेल्पलाइन|संरक्षण\s+आदेश/i.source,
    // Unsafe at home — Devanagari without \b (साथी के कारण घर पर असुरक्षित)
    /\b(?:unsafe\s+at\s+home|ghar\s+par\s+unsafe)\b/i.source,
    /घर\s+पर\s+असुरक्षित|साथी.{0,30}असुरक्षित|ghar.{0,20}unsafe/i.source,
    // Physical abuse
    /\b(?:marpeet|maar\s*peet)\b|मारपीट/i.source,
    /\bghar\s*(?:me|mein|par)\b.{0,40}\b(?:marpeet|maar\s*peet|danger|suraksha|protection|violence)\b/i.source,
    // Partner/spouse controlling behaviour — ASCII \b on ASCII words, Devanagari bare
    /\b(?:partner|husband|spouse|pati|saathi)\b.{0,60}\b(?:unsafe|controlling|abuse|marpeet|violence|paise\s+control|stops?\s+me\s+from\s+working)\b/i.source,
    /साथी.{0,60}(?:पैसे\s+नियंत्रित|काम\s+नहीं\s+करने\s+देता|नियंत्रण|unsafe|hinsa)/i.source,
    /पति.{0,60}(?:पैसे\s+नियंत्रित|काम\s+नहीं\s+करने\s+देता|नियंत्रण|unsafe|hinsa)/i.source,
    // Controlling behaviour / threats without visible injury — Devanagari bare
    /\b(?:controlling\s+behavior|threats?\s+and\s+controlling|no\s+visible\s+injury)\b/i.source,
    /धमकियाँ.{0,30}नियंत्रण|नियंत्रण.{0,30}धमकियाँ|चोट\s+नहीं\s+दिखती|दुर्व्यवहार.{0,30}(?:शारीरिक|केवल|types)/i.source,
    // Phone monitoring — Devanagari bare
    /\b(?:monitors?\s+(?:my\s+)?phone|phone\s+monitor)\b/i.source,
    /फोन\s+(?:देखता|चेक|मॉनिटर)|कोई.{0,20}फोन\s+देखता/i.source,
    // Fear of reporting — Devanagari bare; Hinglish 'darr se report'
    /\b(?:fear\s+of\s+reporting|afraid\s+to\s+report)\b/i.source,
    /परिवार\s+को\s+पता\s+चलने\s+के\s+डर|family.{0,20}darr.{0,30}report|darr.{0,20}(?:report|shikayat)/i.source,
    // Supporting a friend being abused — Devanagari bare
    /\b(?:support\s+(?:a\s+)?friend|friend.{0,30}being\s+abused)\b/i.source,
    /दोस्त.{0,40}दुर्व्यवहार|दुर्व्यवहार.{0,30}दोस्त/i.source,
    // Types of abuse / asking if abuse is only physical — Devanagari bare
    /\b(?:abuse|abused|abusive|duvyavahar)\b.{0,60}\b(?:physical|behavior|partner|family|report|support|safe)\b/i.source,
    /दुर्व्यवहार.{0,60}(?:शारीरिक|व्यवहार|मदद|रिपोर्ट|safe|सुरक्षित)/i.source,
    // 'Safe evidence' pattern — survivor safety language (keeping records)
    /\bif\s+(?:it\s+is|its?)\s+safe\b.{0,60}\b(?:information|evidence|records?|useful|keep)\b/i.source,
    /agar\s+safe\s+ho|safe\s+ho.{0,30}(?:information|jankari|kaunsi)/i.source,
    /अगर\s+सुरक्षित\s+हो|सुरक्षित\s+हो.{0,30}(?:जानकारी|information)/i.source
  ].join('|'),
  'i'
);

// 4. BNSS / Police Procedure & Fundamental Rights
// NOTE: \b anchors are omitted around Devanagari text — see note above CYBERCRIME_INTENT_RE.
export const BNSS_POLICE_INTENT_RE = new RegExp(
  [
    // BNSS / zero FIR explicit terms — ASCII \b safe; Devanagari bare
    /\b(?:bnss|bharatiya\s+nagarik\s+suraksha\s+sanhita|bnss\s+section|zero\s+fir)\b/i.source,
    /भारतीय\s+नागरिक\s+सुरक्षा\s+संहिता|जीरो\s+एफआईआर/i.source,
    // Police refusing to register — ASCII \b on ASCII words; Devanagari bare
    /\b(?:police|thana)\b.{0,40}\b(?:refus(?:e|es|ed|ing)|manaa?)\b.{0,40}\b(?:fir|complaint|case|report|darj)\b/i.source,
    /\b(?:police\s+refuse\s+to\s+take|police\s+refuse)\b/i.source,
    /पुलिस\s+(?:शिकायत\s+लेने\s+से\s+मना|एफआईआर\s+दर्ज\s+करने\s+से\s+मना)/i.source,
    // Before visiting police station — BOTH orders (station before/after write-down)
    /\b(?:police\s+station|police\s+thana)\b.{0,50}\b(?:pehle|before|write\s+down|what\s+to\s+bring|information|details)\b/i.source,
    /\b(?:before\s+visiting|write\s+down|what\s+to\s+(?:bring|note)).{0,60}\bpolice\s+station\b/i.source,
    /थाने\s+(?:जाने\s+से|से\s+पहले)|थाने\s+जाने.{0,30}(?:जानकारी|information|पहले)/i.source,
    // Filing a complaint at police — Devanagari bare (पुलिस में शिकायत)
    /\b(?:police\s+me\s+complaint|police\s+mein\s+shikayat)\b/i.source,
    /पुलिस\s+में\s+शिकायत|शिकायत\s+(?:कैसे\s+)?दर्ज\s+करा/i.source,
    // Police notice received — Devanagari bare
    /\b(?:police\s+notice|police\s+se\s+notice)\b/i.source,
    /पुलिस\s+का\s+नोटिस/i.source,
    // Witness (not a victim) — Devanagari bare
    /\b(?:witnessed\s+(?:an?\s+)?incident|crime\s+witness|victim\s+nahi\s+hoon)\b/i.source,
    /घटना\s+देखी|पीड़ित\s+नहीं\s+हूँ/i.source,
    // Written complaint acknowledgement — BOTH orders + Devanagari bare
    /\b(?:written\s+complaint|लिखित\s+शिकायत)\b.{0,40}\b(?:acknowledgement|receipt)\b/i.source,
    /\b(?:acknowledgement|receipt)\b.{0,60}\b(?:written\s+complaint|complaint\s+submitted|submitting\s+(?:a\s+)?(?:written\s+)?complaint)\b/i.source,
    /लिखित\s+शिकायत.{0,30}पावती|पावती.{0,30}(?:लिखित\s+शिकायत|शिकायत)/i.source,
    // After complaint is filed — Devanagari bare
    /\b(?:after\s+(?:a\s+)?complaint\s+is\s+recorded|complaint\s+record\s+hone\s+ke\s+baad)\b/i.source,
    /शिकायत\s+दर्ज\s+होने\s+के\s+बाद/i.source
  ].join('|'),
  'i'
);


const LEGAL_TOPIC_RE = /fundamental rights?|constitutional rights?|article\s*(14|15|19|21|21a|23|24|25|32|226)|legal aid|free legal services?|legal services authorities? act|lok adalat|free lawyer|free vakil|मौलिक अधिकार|संवैधानिक अधिकार|नि(?:ः|:)?शुल्क\s+(?:कानूनी|विधिक)\s+सहायता|मुफ्त\s+कानूनी\s+सहायता|कानूनी सहायता|कानूनी सेवा|कानूनी मदद|मुफ्त वकील|विधिक सेवा|moolik adhikar|samvaidhanik adhikar|muft kanooni madad|free legal madad|free vakil|muft vakil|kanooni sahayata|\b(?:bnss|bharatiya nagarik suraksha sanhita|zero fir|fir|fir complaint|police complaint|police arrest|arrested by police|arrest rights|lawyer during interrogation|advocate during interrogation|domestic violence|women(?:'s)? helpline|child protection|child abuse|child safety|bachchon ki safety|bachon ki safety|pocso|juvenile justice|cybercrime|cyber crime|cyber fraud|online fraud|consumer rights|consumer complaint|consumer grievance|consumer helpline|national consumer helpline|nch|1930|1098|181|1915|defective product|product defect|warranty|poor service|seller.{0,25}refund|refund.{0,25}(?:seller|product|purchase|order))\b|\b(?:police|officer in charge)\b.{0,100}\brefus(?:e|es|ed|al|ing)\b.{0,80}\b(?:record|register)\b.{0,80}\b(?:information|complaint)\b.{0,80}\b(?:cognizable|cognisable)\s+offen[cs]e\b|घरेलू हिंसा|महिला हेल्पलाइन|बाल हेल्पलाइन|बाल सुरक्षा|बच्चों की सुरक्षा|बाल शोषण|यौन अपराध.*बच्च|साइबर अपराध|साइबर धोखाधड़ी|ऑनलाइन धोखाधड़ी|उपभोक्ता अधिकार|उपभोक्ता शिकायत|उपभोक्ता हेल्पलाइन|एफआईआर|प्राथमिकी|जीरो एफआईआर|गिरफ्तारी|पुलिस शिकायत|पुलिस अधिकार|पूछताछ में वकील|मजिस्ट्रेट|महिला अधिकार|बच्चों के अधिकार|cyber dhokha|online thagi|gharelu hinsa|mahila helpline|bachchon ki suraksha|bachon ki suraksha|bal suraksha|upbhokta shikayat|upbhokta adhikar|police me fir|police giraftari|girftari ke adhikar/i;
const CYBERCRIME_REPORTING_RE = /\b(?:online payment fraud|payment fraud|financial cyber fraud|cyber financial fraud|online financial fraud|money stolen online|stolen money online|report cybercrime|report cyber crime|cybercrime\.gov\.in)\b|\b(?:online|internet|digital|bank|account|payment|transaction|transfer)\b.{0,50}\b(?:fraud|scam|theft|stole|stolen|unauthori[sz]ed|unapproved)\b|\b(?:stole|stolen|theft|unauthori[sz]ed|unapproved|fraudulent)\b.{0,50}\b(?:money|funds|payment|transaction|transfer|account)\b|\b(?:money|funds)\b.{0,50}\b(?:stolen|taken|deducted)\b.{0,50}\b(?:online|bank|account|transaction|payment|report)\b|\b(?:online payment|payment)\b.{0,32}\b(?:fraud|scam|thagi)\b|\b(?:paise|paisa|rupaye)\b.{0,32}\b(?:chori|thagi|fraud)\b|ऑनलाइन\s+(?:पेमेंट|भुगतान|फ्रॉड|धोखाधड़ी|स्कैम|ठगी)|(?:ऑनलाइन|बैंक|खाते|लेनदेन|यूपीआई|यूपीआई).{0,50}(?:पैसे|रुपये).{0,32}(?:चोरी|कट|निकल|धोखाधड़ी|ठगी|स्कैम)|(?:पैसे|रुपये).{0,32}(?:चोरी|ठगी|धोखाधड़ी|कट|निकाल).{0,50}(?:ऑनलाइन|बैंक|खाते|लेनदेन|यूपीआई|रिपोर्ट)|मेरे\s+साथ.{0,30}(?:ऑनलाइन\s*)?(?:स्कैम|ठगी|धोखा|फ्रॉड)|वित्तीय\s+साइबर\s+धोखाधड़ी|साइबरक्राइम\.gov\.in/i;
const INFORMAL_CYBERCRIME_REPORTING_RE = /\bcyber\s+fraud\b|\b(?:i\s+)?(?:got|was|were|been)\s+scammed\b.{0,60}\b(?:online|internet|upi|bank|payment|money|report|complain)\b|\b(?:online|internet|upi|bank|payment)\b.{0,50}\b(?:scam(?:med|mer)?|fraud(?:ster)?|thagi)\b|\b(?:scam(?:mer|med)?|fraud(?:ster)?|thagi)\b.{0,50}\b(?:online|internet|upi|bank|payment|money|funds|report|complain)\b|\b(?:sent|transferred|paid)\b.{0,40}\b(?:money|funds|cash|paise|paisa|rupees?)\b.{0,40}\b(?:scam(?:mer)?|fraud(?:ster)?|thagi)\b|\b(?:scam(?:mer)?|fraud(?:ster)?|thagi)\b.{0,40}\b(?:money|funds|cash|paise|paisa|rupees?)\b|\b(?:mere\s+)?upi\b.{0,45}\b(?:paise|paisa|money|rupees?)\b.{0,50}\b(?:kat|deduct|fraud|scam|chori)\b|\b(?:paise|paisa|rupees?)\b.{0,40}\b(?:kat|deduct|chori)\b.{0,40}\b(?:upi|fraud|scam)\b|(?:मेरे\s+साथ|मुझे|मेरा|मेरे).{0,30}(?:ऑनलाइन\s*)?(?:स्कैम|ठगी|धोखा|धोखाधड़ी|फ्रॉड|घोटाला)|(?:ऑनलाइन|साइबर|यूपीआई|बैंक).{0,40}(?:स्कैम|ठगी|धोखा|धोखाधड़ी|फ्रॉड|घोटाला)|(?:पैसे|रुपये).{0,30}(?:कट|निकाल|चोरी|ठगी)|(?:शिकायत|रिपोर्ट).{0,30}(?:साइबर|ऑनलाइन).{0,25}(?:अपराध|ठगी|धोखाधड़ी|स्कैम)/i;

export function isCybercrimeReportingQuestion(question) {
  if (typeof question !== 'string' || !question) return false;
  const normalized = question
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return CYBERCRIME_REPORTING_RE.test(normalized) || INFORMAL_CYBERCRIME_REPORTING_RE.test(normalized) || CYBERCRIME_INTENT_RE.test(normalized);
}

export function isLegalQuestion(question) {
  if (typeof question !== 'string' || !question) return false;
  const normalized = question
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If question clearly asks about certificate services (e.g. character certificate police verification),
  // preserve certificate service routing and do not hijack into legal domain.
  const svc = detectService(normalized);
  if (svc && !/\b(?:fir|zero\s*fir|cyber|nch|consumer|domestic\s*violence|gharelu\s*hinsa|pwdva|bnss|1930|1915|181)\b/i.test(normalized)) {
    if (/character\s*certif|चरित्र\s*प्रमाण|charitra\s*praman|charitra\s*patra/i.test(normalized)) {
      return false;
    }
  }

  return (
    LEGAL_TOPIC_RE.test(normalized) ||
    isCybercrimeReportingQuestion(normalized) ||
    CYBERCRIME_INTENT_RE.test(normalized) ||
    CONSUMER_INTENT_RE.test(normalized) ||
    DOMESTIC_VIOLENCE_INTENT_RE.test(normalized) ||
    BNSS_POLICE_INTENT_RE.test(normalized)
  );
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
  const orderedChunks = [];
  const seenServices = new Set();
  for (const c of chunks) {
    if (!seenServices.has(c.service_id)) {
      seenServices.add(c.service_id);
      orderedChunks.push(c);
    }
  }
  for (const c of chunks) if (!orderedChunks.includes(c)) orderedChunks.push(c);
  for (const c of orderedChunks) {
    // Dedup by canonical document identity: service + source URL.
    // Multiple chunks from the same portal page (same URL) are a single source.
    // When no URL is available, fall back to source_ref so distinct documents
    // that share a service_id (e.g. legal knowledge base with multiple refs)
    // are still kept separate.
    const sourceUrl = (c.source_url || '').trim();
    const sourceRef = c.source_id || c.source_ref || c.id || c.topic || '';
    const key = sourceUrl
      ? `${c.service_id || ''}:${sourceUrl}`
      : `${c.service_id || ''}:${sourceRef}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({
        id: c.source_id || c.source_ref || c.id || '',
        service_id: c.service_id || '',
        title: c.title || '',
        source_url: sourceUrl || null,
        department: c.department || null,
        topic: c.topic || '',
        source_type: c.source_type || 'official_government_portal'
      });
    }
    if (sources.length >= 5) break;
  }
  return sources;
}
// ── Test injection hooks ──────────────────────────────────────────────────
// Pass a client object to inject it, or `false` to disable auto-creation.
// Pass `null` to reset (auto-create on next call).
export function _setQdrantClient(client) { qdrantClient = client; }
export function _setEmbedClient(client) { embedClient = client; }

// Database injection hook for unit tests. Passing null restores Prisma.
let knowledgeDb = prisma;
export function _setKnowledgeDbClient(client) {
  knowledgeDb = client === null ? prisma : client;
}
// ── Qdrant client (lazy singleton) ────────────────────────────────────────
let qdrantClient = null;
function getQdrantClient() {
  // `false` = test-disabled; `null` = uninitialized (auto-create); object = ready
  if (qdrantClient === false) return null;
  if (qdrantClient) return qdrantClient;
  if (aiConfig.qdrant.url) {
    qdrantClient = new QdrantClient({
      url: aiConfig.qdrant.url,
      apiKey: aiConfig.qdrant.apiKey || undefined,
      checkCompatibility: false
    });
  }
  return qdrantClient;
}
// ── Gemini embedding client (lazy singleton) ───────────────────────────────
let embedClient = null;
function getEmbedClient() {
  // `false` = test-disabled; `null` = uninitialized (auto-create); object = ready
  if (embedClient === false) return null;
  if (embedClient) return embedClient;
  if (aiConfig.gemini.apiKey) {
    embedClient = new GoogleGenAI({
      apiKey: aiConfig.gemini.apiKey,
      httpOptions: { timeout: aiConfig.timeoutMs, retryOptions: { attempts: 1 } }
    });
  }
  return embedClient;
}
// ── embedQuery: RETRIEVAL_QUERY task type, reads embeddings[0].values ──────
export async function embedQuery(text) {
  const client = getEmbedClient();
  if (!client) return null;
  try {
    const res = await client.models.embedContent({
      model: aiConfig.gemini.embeddingModel || 'gemini-embedding-001',
      contents: [text],
      config: { taskType: 'RETRIEVAL_QUERY' }
    });
    // EmbedContentResponse: { embeddings?: ContentEmbedding[] }
    // ContentEmbedding: { values?: number[] }
    return res.embeddings?.[0]?.values ?? null;
  } catch (err) {
    console.warn('[RAG] Embedding generation failed:', err.message);
    return null;
  }
}
// ── Local chunk cache (built from shared chunkBuilder) ────────────────────
let localChunksCache = null;
export function loadLocalChunks() {
  if (localChunksCache) return localChunksCache;
  localChunksCache = [];
  const dataRoot = fs.existsSync(path.resolve(process.cwd(), 'data'))
    ? path.resolve(process.cwd(), 'data')
    : path.resolve(process.cwd(), 'backend', 'data');
  const dataDirs = [
    { directory: path.join(dataRoot, 'services'), domain: 'citizen_service' },
    { directory: path.join(dataRoot, 'legal'), domain: 'legal_rights' }
  ];
  for (const { directory, domain } of dataDirs) {
    if (!fs.existsSync(directory)) continue;
    let files;
    try {
      files = fs.readdirSync(directory).filter((file) => file.endsWith('.json'));
    } catch (err) {
      console.warn(`[RAG] Failed to list local ${domain} knowledge:`, err.message);
      continue;
    }
    for (const file of files) {
      try {
        const svc = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
        const chunks = buildChunks(svc, file).map((chunk) => ({
          ...chunk,
          knowledge_domain: domain
        }));
        localChunksCache.push(...chunks);
      } catch (err) {
        console.warn(`[RAG] Failed to load local ${domain} knowledge file ${file}:`, err.message);
      }
    }
  }
  return localChunksCache;
}
/**
 * Keyword-overlap scoring — NOT semantic similarity.
 * Positive scores are in range [0.4, 0.95]; zero-overlap chunks are excluded.
 * retrievalSource="local_fallback" always accompanies these scores.
 */
const LOCAL_STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'you', 'your', 'what', 'when', 'where', 'how', 'can', 'could', 'should', 'would',
  'from', 'with', 'this', 'that', 'have', 'has', 'does', 'did', 'not', 'but', 'about', 'into', 'please',
  'hai', 'hain', 'ho', 'ka', 'ke', 'ki', 'ko', 'me', 'mein', 'se', 'par', 'kya', 'kaise', 'kab', 'kahan', 'kar', 'kare', 'karo'
]);

/**
 * Hinglish/Hindi synonym map for local lexical fallback.
 * Maps common Hinglish/Hindi tokens → canonical English retrieval terms.
 * This is intentionally conservative: only unambiguous concept equivalents.
 * Expansions are appended, not replaced, so the original token is preserved.
 */
const HINGLISH_SYNONYMS = {
  // Caste certificate synonyms
  'jati': ['caste'],
  'jaat': ['caste'],
  'jaati': ['caste'],
  'sc': ['caste', 'scheduled'],
  'st': ['caste', 'scheduled', 'tribe'],
  'obc': ['caste', 'backward'],
  // Domicile / Residence
  'niwas': ['domicile', 'residence'],
  'nivas': ['domicile', 'residence'],
  'rehne': ['residence', 'domicile'],
  // Income
  'aay': ['income'],
  'aai': ['income'],
  // Birth
  'janm': ['birth'],
  'janam': ['birth'],
  // Death
  'mrityu': ['death'],
  'maut': ['death'],
  // Marriage
  'vivah': ['marriage'],
  'shaadi': ['marriage'],
  'shadi': ['marriage'],
  // Disability
  'divyang': ['disability'],
  'divyangta': ['disability'],
  'viklang': ['disability'],
  // Character
  'charitra': ['character'],
  // EWS
  'ews': ['economically', 'weaker'],
  // Documents
  'dastavez': ['documents', 'papers'],
  'dastaavet': ['documents', 'papers'],
  'kagaz': ['documents', 'papers'],
  'kagajat': ['documents', 'papers'],
  // Certificate
  'praman': ['certificate'],
  'pramaan': ['certificate'],
  'patra': ['certificate'],
  'certif': ['certificate'],
  // Apply / Process
  'avedan': ['application', 'apply'],
  'aavedan': ['application', 'apply'],
  'banwana': ['apply', 'get', 'obtain'],
  'banwane': ['apply', 'get', 'obtain'],
  'bnwane': ['apply', 'get', 'obtain'],
  'milega': ['get', 'obtain'],
  // Fee
  'shulk': ['fee', 'fees'],
  'paisa': ['fee', 'amount'],
  'paise': ['fee', 'amount'],
  'kitna': ['how', 'much', 'amount'],
  // Proof
  'praman': ['proof', 'certificate'],
  'pramaan': ['proof', 'certificate'],
  // Domestic violence concepts
  'unsafe': ['safety', 'violence', 'endangers', 'protection'],
  'home': ['domestic', 'household', 'residence'],
  'partner': ['domestic', 'relationship'],
  'घरेलू': ['domestic', 'household'],
  'हिंसा': ['violence', 'abuse', 'safety'],
  'खतरे': ['danger', 'unsafe'],
  'खतरा': ['danger', 'unsafe'],
  'तत्काल': ['immediate', 'urgent'],
  'सुरक्षित': ['safe', 'safety'],
  'सुरक्षा': ['safety', 'protection'],
  // Devanagari synonyms for cross-lingual lexical retrieval
  'निवास': ['domicile', 'residence', 'niwas'],
  'प्रमाण': ['certificate', 'proof', 'praman'],
  'पत्र': ['certificate', 'patra'],
  'जाति': ['caste', 'jati'],
  'आय': ['income', 'aay'],
  'जन्म': ['birth', 'janm'],
  'मृत्यु': ['death', 'mrityu'],
  'विवाह': ['marriage', 'vivah'],
  'शादी': ['marriage', 'shaadi'],
  'दिव्यांग': ['disability', 'divyang'],
  'विकलांग': ['disability', 'viklang'],
  'चरित्र': ['character', 'charitra'],
  'दस्तावेज़ों': ['documents', 'checklist'],
  'दस्तावेज': ['documents', 'checklist'],
  'आवेदन': ['application', 'apply', 'procedure'],
  'स्टेटस': ['status', 'tracking'],
  'फीस': ['fee', 'fees'],
  'शुल्क': ['fee', 'fees'],
  'अधिकारी': ['officer', 'department', 'sdm', 'tehsildar'],
  'विभाग': ['department'],
  'कॉपी': ['copy', 'duplicate'],
  'खो': ['lost'],
  'गलती': ['error', 'correction'],
  'सुधारें': ['correction', 'edit'],
  'निर्देश': ['instructions', 'guidelines', 'portal', 'edistrict'],
  'रिजेक्ट': ['reject', 'rejection'],
  'इस्तेमाल': ['use', 'purpose', 'overview'],
  'सबूत': ['proof', 'evidence'],
  'सबूतों': ['proof', 'evidence'],
  'ऑनलाइन': ['online', 'internet'],
  'साइबर': ['cyber', 'cybercrime'],
  'स्कैम': ['scam', 'fraud'],
  'ठगी': ['fraud', 'scam'],
  'धोखा': ['fraud', 'scam'],
  'धोखाधड़ी': ['fraud', 'scam'],
  'फ्रॉड': ['fraud', 'scam'],
  'यूपीआई': ['upi', 'payment'],
  'पैसे': ['money', 'funds'],
  'रुपये': ['money', 'funds'],
  'कट': ['deducted', 'taken'],
  'निकाल': ['withdrawn', 'taken']
};

function localTokens(text) {
  return [...new Set((String(text || '').normalize('NFKC').toLowerCase().match(/[a-z0-9\u0900-\u097f]+/g) || [])
    .filter((token) => token.length > 2 && !LOCAL_STOP_WORDS.has(token)))];
}

/**
 * Expand query tokens with Hinglish synonyms for improved local retrieval.
 * Only expands Latin-script (Hinglish) tokens; Devanagari tokens are passed through.
 * Returns a deduplicated array of the original tokens plus their expansions.
 */
function expandQueryTokens(tokens) {
  const expanded = [...tokens];
  for (const token of tokens) {
    const synonyms = HINGLISH_SYNONYMS[token];
    if (synonyms) {
      for (const syn of synonyms) {
        if (!expanded.includes(syn)) expanded.push(syn);
      }
    }
  }
  return expanded;
}

function isCloseLocalToken(left, right) {
  if (left === right || left.includes(right) || right.includes(left)) return true;
  if (left.length < 5 || right.length < 5 || Math.abs(left.length - right.length) > 1) return false;

  // One-edit tolerance is only used by the offline lexical fallback, where
  // semantic embeddings are unavailable. It handles simple typing errors.
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
      rowMinimum = Math.min(rowMinimum, current[j]);
    }
    if (rowMinimum > 1) return false;
    previous = current;
  }
  return previous[right.length] <= 1;
}

/**
 * Lexical fallback score, not semantic similarity or answer confidence.
 * Uses synonym expansion so that Hinglish queries match English-language chunks.
 */
export function scoreLocalChunk(question, chunkText) {
  const rawQueryTokens = localTokens(question);
  if (!rawQueryTokens.length) return 0;
  // Expand query tokens with Hinglish synonyms before matching
  const queryTokens = expandQueryTokens(rawQueryTokens);
  const contentTokens = localTokens(chunkText);
  // Count matches using the original raw tokens as the denominator (no inflation)
  const matchCount = rawQueryTokens.filter((rawToken) => {
    const candidates = [rawToken, ...(HINGLISH_SYNONYMS[rawToken] || [])];
    return contentTokens.some((contentToken) =>
      candidates.some((candidate) => isCloseLocalToken(candidate, contentToken))
    );
  }).length;
  if (!matchCount) return 0;
  // Bonus: if any expanded synonym triggered the match, it still counts toward the ratio
  const expandedMatchCount = queryTokens.filter((queryToken) =>
    contentTokens.some((contentToken) => isCloseLocalToken(queryToken, contentToken))
  ).length;
  // Use the larger of both counts to reward synonym-enhanced retrieval
  const effectiveMatch = Math.max(matchCount, Math.min(expandedMatchCount, rawQueryTokens.length));
  return Math.min(0.95, 0.4 + (effectiveMatch / rawQueryTokens.length) * 0.55);
}

export function retrieveLocal(question, state = 'Uttar Pradesh', topK = 5, targetServiceId = null, targetDomain = null) {
  const allLocal = loadLocalChunks();
  const scored = allLocal
    .filter(
      (c) =>
        c.state.toLowerCase() === state.toLowerCase() &&
        c.verified &&
        (!targetDomain || (c.knowledge_domain || 'citizen_service') === targetDomain) &&
        (!targetServiceId || c.service_id === targetServiceId)
    )
    .map((c) => ({ ...c, score: scoreLocalChunk(question, c.text) }))
    .filter((c) => c.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
/**
 * Hydrate Qdrant search hits from PostgreSQL.
 * Qdrant is used for vector similarity only; PostgreSQL provides authoritative
 * chunk text and source metadata. Hits missing valid DB linkage are rejected.
 */
async function hydrateQdrantHitsFromPostgres(hits, state, domain, expectedServiceId = null) {
  const chunkIds = [...new Set(hits.map((hit) => hit?.payload?.chunk_id).filter(Boolean))];
  const knowledgeDbAvailable = Boolean(knowledgeDb?.knowledgeChunk?.findMany);
  if (!knowledgeDbAvailable) throw new Error('Prisma KnowledgeChunk client is unavailable');
  if (chunkIds.length === 0) {
    for (const hit of hits) {
      console.info('[RAG] Hydration candidate', JSON.stringify({
        qdrantPointId: hit?.id ?? null,
        qdrantChunkId: hit?.payload?.chunk_id ?? null,
        serviceId: hit?.payload?.service_id ?? null,
        domain,
        qdrantVerified: hit?.payload?.verified ?? null,
        hydratedChunkId: null,
        sourceIdentityMatch: false,
        rejectionReasons: [!hit?.payload?.chunk_id ? 'missing_qdrant_chunk_id' : 'missing_qdrant_source_id']
      }));
    }
    return [];
  }

  // Load only the rows referenced by this Qdrant result. Verification and
  // linkage are checked explicitly below so diagnostics can distinguish stale
  // points from missing or unverified database records.
  const records = await knowledgeDb.knowledgeChunk.findMany({
    where: { id: { in: chunkIds } },
    include: { source: true }
  });
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const hydrated = [];

  for (const hit of hits) {
    const payload = hit?.payload || {};
    const record = payload.chunk_id ? recordsById.get(payload.chunk_id) : null;
    const source = record?.source || null;
    const sourceIdentityMatch = Boolean(record && record.sourceId === payload.source_id);
    const serviceMatch = !expectedServiceId || payload.service_id === expectedServiceId;
    const domainMatch = domain === 'legal_rights'
      ? payload.knowledge_domain === 'legal_rights'
      : payload.knowledge_domain == null || payload.knowledge_domain === 'citizen_service';
    const stateMatch = Boolean(record && String(record.region || '').toLowerCase() === String(state).toLowerCase());
    const qdrantStateMatch = payload.state == null || String(payload.state).toLowerCase() === String(state).toLowerCase();
    const normalizeForMatch = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const textMatch = !record || typeof payload.text !== 'string' || normalizeForMatch(payload.text) === normalizeForMatch(record.text);
    const rejectionReasons = [];
    if (!payload.chunk_id) rejectionReasons.push('missing_qdrant_chunk_id');
    if (!payload.source_id) rejectionReasons.push('missing_qdrant_source_id');
    if (!serviceMatch) rejectionReasons.push('qdrant_service_id_mismatch');
    if (!domainMatch) rejectionReasons.push('qdrant_domain_mismatch');
    if (!record) rejectionReasons.push('postgres_chunk_not_found');
    if (record && !stateMatch) rejectionReasons.push('postgres_state_mismatch');
    if (!qdrantStateMatch) rejectionReasons.push('qdrant_state_mismatch');
    if (record && !sourceIdentityMatch) rejectionReasons.push('qdrant_postgres_source_id_mismatch');
    if (record && record.verified !== true) rejectionReasons.push('postgres_chunk_verification_missing_or_false');
    if (!source) rejectionReasons.push('postgres_source_missing');
    if (source && source.verified !== true) rejectionReasons.push('postgres_source_verification_missing_or_false');
    if (payload.verified !== true) rejectionReasons.push('qdrant_verification_missing_or_false');
    if (record && !textMatch) rejectionReasons.push('stale_qdrant_text');

    const trace = {
      qdrantPointId: hit?.id ?? null,
      qdrantChunkId: payload.chunk_id ?? null,
      hydratedChunkId: record?.id ?? null,
      serviceId: payload.service_id ?? null,
      expectedServiceId,
      domain,
      qdrantVerified: payload.verified ?? null,
      postgresChunkVerified: record?.verified ?? null,
      postgresSourceVerified: source?.verified ?? null,
      sourceIdentityMatch,
      serviceMatch,
      domainMatch,
      stateMatch,
      qdrantStateMatch,
      qdrantTextMatchesHydratedText: typeof payload.text === 'string' ? textMatch : null,
      rejectionReasons
    };
    console.info('[RAG] Hydration candidate', JSON.stringify(trace));
    if (rejectionReasons.length > 0) continue;

    hydrated.push({
      id: payload.chunk_id,
      qdrant_point_id: hit.id ?? null,
      qdrant_chunk_id: payload.chunk_id,
      qdrant_verified: payload.verified === true,
      source_identity_match: sourceIdentityMatch,
      qdrant_text_matches_hydrated_text: textMatch,
      postgres_chunk_verified: record.verified === true,
      postgres_source_verified: source.verified === true,
      service_id: payload.service_id || '',
      knowledge_domain: domain,
      source_id: source.id,
      state: record.region || '',
      source_type: source.sourceType || 'official_government_portal',
      language: record.language || 'en',
      topic: record.section || 'general',
      text: record.text,
      source_ref: payload.source_ref || '',
      score: typeof hit.score === 'number' ? hit.score : 0.8,
      title: source.title || '',
      department: source.department || null,
      source_url: source.sourceUrl || null,
      verified: true
    });
  }
  return hydrated;
}

/**
 * retrieve()
 *
 * Returns: { chunks, retrievalSource, fallbackReason }
 *   retrievalSource: "qdrant" | "local_fallback"
 *   fallbackReason:  "no_qdrant_client" | "embedding_failed" |
 *                    "qdrant_error" | "qdrant_zero_hits" |
 *                    "postgres_error" | "postgres_no_verified_chunks" | null
 *
 * When RAG_ALLOW_LOCAL_FALLBACK is false and Qdrant fails/returns nothing,
 * returns zero chunks so ai.service.js emits needs_human instead of
 * keyword-matching.
 */
async function retrieveSingle(question, state = 'Uttar Pradesh', topK = 5, serviceOverride = null) {
  const legal = isLegalQuestion(question);
  const detectedService = serviceOverride || detectService(question);
  // Retrieve a wider candidate set so post-retrieval topic filtering does not
  // discard relevant evidence that ranked just below the initial top five.
  const retrievalLimit = Math.max(topK, Math.min(topK * 3, 30));
  console.log('[RAG] Detected service:', detectedService, '| Retrieval starting…');
  const client = getQdrantClient();
  const vector = await embedQuery(question);
  // ── Qdrant path ──────────────────────────────────────────────────────────
  if (client && vector) {
    try {
      const filter = {
        must: [
          { key: 'state', match: { value: state } },
          { key: 'verified', match: { value: true } },
          ...(legal ? [{ key: 'knowledge_domain', match: { value: 'legal_rights' } }] : []),
          ...(!legal && detectedService
            ? [{ key: 'service_id', match: { value: detectedService } }]
            : [])
        ]
      };
      const collection = legal ? 'legal_rights_chunks' : aiConfig.qdrant.collection;
      console.info('[RAG] Route', JSON.stringify({
        domain: legal ? 'legal_rights' : 'citizen_service',
        serviceId: detectedService,
        collection,
        filterKeys: filter.must.map((condition) => condition.key),
        topK: retrievalLimit
      }));
      // Use client.query() — the current non-deprecated Qdrant JS API.
      // Returns QueryResponse = ScoredPoint[]
      const queryRes = await client.query(collection, {
        query: vector,
        filter,
        limit: retrievalLimit,
        with_payload: true,
        timeout: Math.ceil((aiConfig.timeoutMs || 15000) / 1000)
      });
      const hits = Array.isArray(queryRes) ? queryRes : (queryRes?.points || []);
      if (hits && hits.length > 0) {
        console.log('[RAG] Retrieval source: qdrant |', hits.length, 'hits');

        try {
          const chunks = await hydrateQdrantHitsFromPostgres(hits, state, legal ? 'legal_rights' : 'citizen_service', detectedService);
          console.info('[RAG] Hydration', JSON.stringify({
            qdrantHits: hits.length,
            uniqueChunkIds: new Set(hits.map((hit) => hit?.payload?.chunk_id).filter(Boolean)).size,
            hydratedChunks: chunks.length
          }));
          if (chunks.length > 0) {
            return { chunks, retrievalSource: 'qdrant', fallbackReason: null };
          }

          console.warn('[RAG] No matching verified PostgreSQL chunks found');
          if (!aiConfig.allowLocalFallback) {
            return {
              chunks: [],
              retrievalSource: 'qdrant',
              fallbackReason: 'postgres_no_verified_chunks'
            };
          }

          return {
            chunks: retrieveLocal(question, state, retrievalLimit, detectedService, legal ? 'legal_rights' : 'citizen_service'),
            retrievalSource: 'local_fallback',
            fallbackReason: 'postgres_no_verified_chunks'
          };
        } catch (err) {
          console.warn('[RAG] PostgreSQL hydration failed:', err.message);
          if (!aiConfig.allowLocalFallback) {
            return {
              chunks: [],
              retrievalSource: 'qdrant',
              fallbackReason: 'postgres_error'
            };
          }

          return {
            chunks: retrieveLocal(question, state, retrievalLimit, detectedService, legal ? 'legal_rights' : 'citizen_service'),
            retrievalSource: 'local_fallback',
            fallbackReason: 'postgres_error'
          };
        }
      }
      // Qdrant returned zero hits
      console.warn('[RAG] Qdrant returned zero hits, checking fallback policy…');
      if (!aiConfig.allowLocalFallback) {
        return { chunks: [], retrievalSource: 'qdrant', fallbackReason: 'qdrant_zero_hits' };
      }
      console.warn('[RAG] Falling back to local keyword search (qdrant_zero_hits)');
      return {
        chunks: retrieveLocal(question, state, retrievalLimit, detectedService, legal ? 'legal_rights' : 'citizen_service'),
        retrievalSource: 'local_fallback',
        fallbackReason: 'qdrant_zero_hits'
      };
    } catch (err) {
      console.warn('[RAG] Qdrant query failed:', err.message);
      if (!aiConfig.allowLocalFallback) {
        return { chunks: [], retrievalSource: 'qdrant', fallbackReason: 'qdrant_error' };
      }
      console.warn('[RAG] Falling back to local keyword search (qdrant_error)');
      return {
        chunks: retrieveLocal(question, state, retrievalLimit, detectedService, legal ? 'legal_rights' : 'citizen_service'),
        retrievalSource: 'local_fallback',
        fallbackReason: 'qdrant_error'
      };
    }
  }
  // ── No Qdrant client or embedding failed ──────────────────────────────────
  const noClientReason = !client ? 'no_qdrant_client' : 'embedding_failed';
  if (!aiConfig.allowLocalFallback) {
    console.warn('[RAG] Local fallback disabled, returning zero chunks (' + noClientReason + ')');
    return { chunks: [], retrievalSource: 'qdrant', fallbackReason: noClientReason };
  }
  console.warn('[RAG] Falling back to local keyword search (' + noClientReason + ')');
  return {
    chunks: retrieveLocal(question, state, retrievalLimit, detectedService, legal ? 'legal_rights' : 'citizen_service'),
    retrievalSource: 'local_fallback',
    fallbackReason: noClientReason
  };
}

function mergeServiceResults(results) {
  const byService = results.map(({ serviceId, result }) => ({
    serviceId,
    result,
    chunks: result.chunks
      .filter((chunk) => !chunk.service_id || chunk.service_id === serviceId)
      .map((chunk) => ({
        ...chunk,
        service_id: chunk.service_id || serviceId,
        title: chunk.title || serviceName(serviceId)
      }))
  }));
  const merged = [];
  const seen = new Set();
  for (let index = 0; byService.some(({ chunks }) => index < chunks.length); index++) {
    for (const group of byService) {
      const chunk = group.chunks[index];
      if (!chunk) continue;
      const key = `${chunk.service_id}:${chunk.source_id || chunk.id || chunk.source_ref}:${chunk.topic}:${chunk.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(chunk);
      }
    }
  }
  const reasons = [...new Set(results.map(({ result }) => result.fallbackReason).filter(Boolean))];
  return {
    chunks: merged,
    retrievalSource: results.every(({ result }) => result.retrievalSource === 'qdrant') ? 'qdrant' : 'local_fallback',
    fallbackReason: reasons.length ? reasons.join(',') : null,
    comparedServices: results.map(({ serviceId }) => ({
      service_id: serviceId,
      title: serviceName(serviceId),
      available: byService.some((group) => group.serviceId === serviceId && group.chunks.length > 0)
    }))
  };
}

export async function retrieve(question, state = 'Uttar Pradesh', topK = 5) {
  const comparisonServices = isServiceComparison(question) ? detectServices(question) : [];
  if (comparisonServices.length < 2) return retrieveSingle(question, state, topK);

  const results = await Promise.all(comparisonServices.map(async (serviceId) => ({
    serviceId,
    result: await retrieveSingle(question, state, topK, serviceId)
  })));
  return mergeServiceResults(results);
}
