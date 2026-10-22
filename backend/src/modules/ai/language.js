/**
 * language.js
 *
 * Detects whether a query is in English, Hindi (Devanagari) or Hinglish (Roman-script Hindi).
 * The detection is intentionally simple and heuristic-based; it is used only to select
 * the language for the LLM's answer — not for routing or retrieval.
 */
const HINGLISH_WORDS = new Set([
  // Personal pronouns / deixis
  "mujhe", "mere", "mera", "meri", "hum", "aap", "tum",
  // Question words
  "kya", "kaise", "kab", "kaun", "kahan", "kyun", "kyunki",
  // Auxiliaries / verbs
  "hai", "hain", "ho", "tha", "thi", "the", "kar", "karo", "karna",
  "chahiye", "chahie", "lagta", "lagti", "milta", "milti", "milega",
  // Certificate / document getting
  "bana", "banao", "banana", "banani", "banane", "bnwane", "banwana", "banwane",
  // Government / admin
  "praman", "patra", "avedan", "aavedan", "dastaavet", "dastavez", "shulk",
  "aadhaar", "aadhar", "jati", "jaat", "jaati", "niwas", "nivas", "aay",
  "janm", "janam", "mrityu", "vivah", "shaadi", "shadi",
  "divyang", "viklang", "charitra", "ews",
  // Prepositions / conjunctions / fillers
  "aur", "ya", "lekin", "par", "se", "ke", "ki", "ko", "ne", "mein",
  "ka", "wala", "wali", "bhai", "yaar", "bata", "batao", "please", "koi",
  "bnwane", "chahiy",
  // Fee / cost
  "kitna", "kitni", "paisa", "paise", "lagta", "lagti",
  // Informal phrasing
  "karna", "karunga", "milega", "milegi", "chahta", "chahti"
]);

export function detectLanguage(text) {
  if (!text || !text.trim()) return "en";

  const nonSpace = text.replace(/\s+/g, "");
  const total = nonSpace.length || 1;

  const devaMatches = nonSpace.match(/[\u0900-\u097F]/g) || [];
  const latinMatches = nonSpace.match(/[A-Za-z]/g) || [];

  const devaRatio = devaMatches.length / total;
  const latinRatio = latinMatches.length / total;

  if (devaRatio >= 0.30 && latinRatio < 0.25) {
    return "hi";
  }

  if (devaRatio >= 0.10 && latinRatio >= 0.15) {
    return "hinglish";
  }

  if (devaRatio < 0.10) {
    const words = text.toLowerCase().match(/[a-z]+/g) || [];
    let hits = 0;
    for (const w of words) {
      if (HINGLISH_WORDS.has(w)) hits++;
    }
    if (hits >= 2 || (hits === 1 && words.length <= 6)) {
      return "hinglish";
    }
  }

  return "en";
}
