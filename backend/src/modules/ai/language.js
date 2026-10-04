const HINGLISH_WORDS = new Set([
  "mujhe", "mere", "mera", "meri", "hum", "aap", "tum",
  "kya", "kaise", "kab", "kaun", "kahan", "kyun", "kyunki",
  "hai", "hain", "ho", "tha", "thi", "the", "kar", "karo", "karna",
  "chahiye", "chahie", "lagta", "lagti", "milta", "milti", "milega",
  "bana", "banao", "banana", "banani", "banane",
  "praman", "patra", "avedan", "dastaavet", "dastaavez", "shulk",
  "aadhaar", "aadhar", "jati", "niwas", "aay",
  "aur", "ya", "lekin", "par", "se", "ke", "ki", "ko", "ne", "mein",
  "ka", "wala", "wali", "bhai", "yaar", "bata", "batao", "please", "koi",
  "bnwane", "chahiy"
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
