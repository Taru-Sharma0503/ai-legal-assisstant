import { prisma, isDbConnected } from '../../config/db.js';
import { logger } from '../../utils/logger.js';

// Default pre-loaded verified knowledge base sources
export const DEFAULT_KNOWLEDGE_SOURCES = [
  {
    id: 'kb-income-cert',
    title: 'Income Certificate Guidelines',
    sourceUrl: 'https://edistrict.up.gov.in/guidelines/income_certificate.pdf',
    department: 'Revenue Department',
    serviceName: 'Income Certificate',
    content: 'आय प्रमाण पत्र (Income Certificate) जारी करने हेतु आवेदक का आधार कार्ड, राशन कार्ड/निवास प्रमाण, स्व-प्रमाणित घोषणा पत्र एवं वेतन पर्ची या आय का विवरण आवश्यक है। यह प्रमाण पत्र 3 वर्ष के लिए मान्य होता है।',
    keywords: ['income', 'certificate', 'आय', 'प्रमाण', 'पत्र', 'revenue', 'dastavez', 'documents']
  },
  {
    id: 'kb-caste-cert',
    title: 'Caste Certificate Guidelines',
    sourceUrl: 'https://edistrict.up.gov.in/guidelines/caste_certificate.pdf',
    department: 'Social Welfare Department',
    serviceName: 'Caste Certificate',
    content: 'जाति प्रमाण पत्र (Caste Certificate) हेतु आधार कार्ड, राशन कार्ड, परिवार के किसी सदस्य का पूर्व जाति प्रमाण पत्र या खतौनी/भू-अभिलेख आवश्यक है। यह प्रमाण पत्र आरक्षित वर्ग के लिए आजीवन मान्य होता है।',
    keywords: ['caste', 'certificate', 'जाति', 'sc', 'st', 'obc', 'social welfare']
  },
  {
    id: 'kb-domicile-cert',
    title: 'Domicile / Residence Certificate Guidelines',
    sourceUrl: 'https://edistrict.up.gov.in/guidelines/domicile_certificate.pdf',
    department: 'Revenue Department',
    serviceName: 'Domicile Certificate',
    content: 'मूल निवास प्रमाण पत्र (Domicile Certificate) हेतु आवेदक को राज्य में कम से कम 3 वर्ष से निरंतर निवास का प्रमाण, आधार कार्ड, बिजली बिल या मतदाता पहचान पत्र प्रस्तुत करना होता है।',
    keywords: ['domicile', 'residence', 'निवास', 'मूल निवास', 'certificate']
  },
  {
    id: 'kb-birth-cert',
    title: 'Birth Certificate Registration Guidelines',
    sourceUrl: 'https://crsorgi.gov.in/guidelines/birth_registration.pdf',
    department: 'Health & Family Welfare Department',
    serviceName: 'Birth Certificate',
    content: 'जन्म प्रमाण पत्र (Birth Certificate) जन्म के 21 दिनों के भीतर अस्पताल डिस्चार्ज स्लिप या ग्राम प्रधान/पार्षद के सत्यापन पत्र द्वारा निःशुल्क बनाया जा सकता है। 21 दिन के पश्चात एसडीएम अनुमति आवश्यक है।',
    keywords: ['birth', 'certificate', 'जन्म', 'hospital', 'crs']
  }
];

export const detectLanguage = (text, requestedLanguage = 'hi') => {
  if (requestedLanguage) return requestedLanguage;
  const isDevanagari = /[\u0900-\u097F]/.test(text);
  return isDevanagari ? 'hi' : 'en';
};

export const normalizeQuery = (text) => {
  return text.trim().toLowerCase().replace(/[?,.!।]/g, '');
};

const STOPWORDS = new Set([
  'the', 'for', 'and', 'how', 'can', 'what', 'are', 'you', 'with', 'need',
  'want', 'get', 'make', 'please', 'tell', 'about',
  'मुझे', 'कौन', 'चाहिए', 'क्या', 'कैसे', 'करना'
]);

export const retrieveTopKChunks = async (normalizedQuery, language, topK = 3) => {
  let dbChunks = [];

  if (prisma && isDbConnected) {
    try {
      dbChunks = await prisma.knowledgeBase.findMany({
        where: {
          verified: true
        },
        include: {
          service: true
        }
      });
    } catch (err) {
      logger.warn(`[RAG Service] DB query error: ${err.message}. Using built-in verified sources.`);
    }
  }

  // Combine database sources with verified default knowledge sources
  const allSources = [
    ...DEFAULT_KNOWLEDGE_SOURCES.map(s => ({
      id: s.id,
      title: s.title,
      sourceUrl: s.sourceUrl,
      department: s.department,
      content: s.content,
      keywords: s.keywords,
      serviceName: s.serviceName
    })),
    ...dbChunks.map(c => ({
      id: c.id,
      title: c.title,
      sourceUrl: c.sourceUrl || '',
      department: c.department,
      content: c.content,
      keywords: (c.title + ' ' + c.content).toLowerCase().split(' '),
      serviceName: c.service?.name
    }))
  ];

  // Score sources based on keyword overlap and semantic relevance
    const queryTokens = normalizedQuery
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
  const scoredSources = allSources.map(source => {
    let score = 0;
    const textToMatch = `${source.title} ${source.content} ${(source.keywords || []).join(' ')}`.toLowerCase();

    for (const token of queryTokens) {
      if (textToMatch.includes(token)) {
        score += 2;
      }
    }

    if (source.serviceName && normalizedQuery.includes(source.serviceName.toLowerCase())) {
      score += 5;
    }

    return { ...source, score };
  });

  scoredSources.sort((a, b) => b.score - a.score);

  const filtered = scoredSources.filter(s => s.score > 0).slice(0, topK);

    // No verified source matched: return nothing instead of a wrong document
  return filtered;
};

export const findSuggestedService = async (retrievedChunks, normalizedQuery) => {
  let matchedServiceName = null;

  for (const chunk of retrievedChunks) {
    if (chunk.serviceName) {
      matchedServiceName = chunk.serviceName;
      break;
    }
  }

  if (!matchedServiceName) {
    if (/income|आय/i.test(normalizedQuery)) matchedServiceName = 'Income Certificate';
    else if (/caste|जाति/i.test(normalizedQuery)) matchedServiceName = 'Caste Certificate';
    else if (/domicile|residence|निवास/i.test(normalizedQuery)) matchedServiceName = 'Domicile Certificate';
    else if (/birth|जन्म/i.test(normalizedQuery)) matchedServiceName = 'Birth Certificate';
  }

  if (matchedServiceName) {
    let service = null;
    if (prisma && isDbConnected) {
      try {
        service = await prisma.service.findFirst({
          where: {
            name: { contains: matchedServiceName, mode: 'insensitive' },
            isActive: true
          }
        });
      } catch (err) {
        // fallback
      }
    }

    return {
      id: service?.id || 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: matchedServiceName
    };
  }

  return null;
};
