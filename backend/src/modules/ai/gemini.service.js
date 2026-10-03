import { aiClient, AI_CONFIG } from '../../config/ai.js';
import { logger } from '../../utils/logger.js';

/**
 * Builds structured response using Google GenAI or intelligent fallback
 */
export const generateGroundedResponse = async ({
  query,
  language,
  retrievedChunks,
  suggestedService = null
}) => {
  const contextString = retrievedChunks
    .map((chunk, index) => `[Source ${index + 1} - ${chunk.title} (${chunk.department})]\n${chunk.content}`)
    .join('\n\n');

  const prompt = `You are an AI Citizen Legal Assistant.
Language requested: ${language}

Retrieved Verified Sources:
${contextString || 'No specific sources found in the database.'}

Suggested Service Identified:
${suggestedService ? `${suggestedService.name} (ID: ${suggestedService.id})` : 'None'}

User Question:
"${query.replace(/"/g, '\\"')}"

INSTRUCTIONS:
1. Provide a comprehensive, clear, and empathetic answer strictly in the requested language (${language}).
2. Include all necessary details from verified sources: eligibility, documents needed, fees, processing times, and steps.
3. Calculate a confidence score between 0.00 and 1.00 based on how well the verified sources answer the query.
4. If confidence is below 0.65 or if the user is asking about an intractable court dispute, property litigation, criminal matter, or human intervention, set needsHuman to true. Otherwise false.
5. Return ONLY a valid JSON object strictly matching this format without any markdown or code blocks:
{
  "answer": "...",
  "confidence": 0.91,
  "needsHuman": false
}`;

  if (aiClient) {
    try {
      const response = await aiClient.models.generateContent({
        model: AI_CONFIG.model,
        contents: prompt,
        config: {
          temperature: AI_CONFIG.temperature,
          topP: AI_CONFIG.topP,
          systemInstruction: AI_CONFIG.systemInstruction
        }
      });

      let text = response.text || '';
      // Clean possible markdown code fences
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

      const parsed = JSON.parse(text);
      return {
        answer: parsed.answer || text,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
        needsHuman: Boolean(parsed.needsHuman)
      };
    } catch (err) {
      logger.warn(`[Gemini API] Failed call: ${err.message}. Using high-quality grounded fallback.`);
    }
  }

  // High-quality grounded fallback when Gemini client is not configured or in offline mode
  return generateFallbackResponse({ query, language, retrievedChunks, suggestedService });
};

const generateFallbackResponse = ({ query, language, retrievedChunks, suggestedService }) => {
  const isHindi = language === 'hi' || /[\u0900-\u097F]/.test(query);

  let confidence = retrievedChunks.length > 0 ? 0.91 : 0.45;
  const isDispute = /dispute|court|police|fir|lawyer|case|विवाद|अदालत|पुलिस|केस|झगड़ा/i.test(query);
  const needsHuman = isDispute || confidence < 0.6;

  if (retrievedChunks.length > 0) {
    const chunk = retrievedChunks[0];
    if (isHindi) {
      return {
        answer: `${chunk.title} के लिए दिशानिर्देश:\n${chunk.content}\n\nआप इस सेवा के लिए नजदीकी जन सेवा केंद्र (CSC/Tehsil) या ऑनलाइन पोर्टल के माध्यम से आवेदन कर सकते हैं।`,
        confidence: Number(confidence.toFixed(2)),
        needsHuman
      };
    } else {
      return {
        answer: `Guidelines for ${chunk.title}:\n${chunk.content}\n\nYou can apply for this service online through the government portal or visit your nearest Tehsil/CSC office with the required documents.`,
        confidence: Number(confidence.toFixed(2)),
        needsHuman
      };
    }
  }

  if (isHindi) {
    return {
      answer: `आपके प्रश्न के संबंध में सटीक सरकारी दिशानिर्देश उपलब्ध नहीं हो सके। इस कानूनी या नागरिक सहायता के लिए कृपया हमारे मानव सहायता अधिकारी (Human Escalation) से संपर्क करें।`,
      confidence: 0.45,
      needsHuman: true
    };
  }

  return {
    answer: `Specific guidelines could not be found for your query. For complex legal matters or specific inquiries, please request human escalation to connect with a legal officer.`,
    confidence: 0.45,
    needsHuman: true
  };
};
