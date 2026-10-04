import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { prisma, isDbConnected } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/utils/logger.js';

const SERVICES_DIR = path.resolve(process.cwd(), 'data/services');
const COLLECTION_NAME = env.QDRANT_COLLECTION || 'citizen_service_chunks';

async function embedText(aiClient, text) {
  try {
    const res = await aiClient.models.embedContent({
      model: env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
      contents; text
    });
    return res?.embedding?.values || null;
  } catch (err) {
    logger.warn("[Ingestion] Embedding error: " + err.message);
    return null;
  }
}

function extractServiceMeta(svc) {
  const meta = svc.service_metadata || {};
  const service_id = meta.service_id || svc.service_id || 'unknown';
  const name_en = meta.service_name_en || svc.name_en || '';
  const name_hi = meta.service_name_hi || svc.name_hi || '';
  const department = meta.department || svc.department || null;
  const source_url = meta.portal_page_url || meta.portal_url || meta.govt_order_link || meta.form_link || svc.portal_page_url || svc.portal_url || svc.source_url || null;
  const source_type = meta.source_type || svc.source_type || 'official_portal';
  const verified = source_type.startsWith('official');

  return {
    service_id,
    name_en,
    name_hi,
    department,
    source_url,
    source_type,
    verified
};
}

function buildChunksFromSvc(svc, fileName) {
  const meta = extractServiceMeta(svc);

  if (Array.isArray(svc.vector_db_chunks)) {
    return svc.vector_db_chunks.map(c => {
      const chunkMeta = c.metadata || {};
      const lang = chunkMeta.language || 'en';
      const title = (lang === 'hi' && meta.name_hi) ? meta.name_hi : meta.name_en;

      return {
        service_id: meta.service_id,
        state: chunkMeta.state || svc.state || 'Uttar Pradesh',
        source_type: meta.source_type,
        source_ref: fileName,
        department: meta.department,
        source_url: chunkMeta.source_url || meta.source_url,
        verified: meta.verified,
        topic: chunkMeta.topic || chunkMeta.section || 'general',
        language: lang,
        text: c.text,
        title
      };
    });
  }

  const base = {
    service_id: meta.service_id,
    state: svc.state || 'Uttar Pradesh',
    source_type: meta.source_type,
    source_ref: fileName,
    department: meta.department,
    source_url: meta.source_url,
    verified: meta.verified
  };

  const chunks = [];
  if (svc.service_fee) {
    const amt = svc.service_fee.amount_inr;
    chunks.push({
      ...base,
      topic: 'fee',
      language: 'en',
      title: meta.name_en,
      text: `The government fee for ${meta.name_en} in ${svc.state || 'Uttar Pradesh'} is ₹${amt}.`
    });
  }

if (Array.isArray(svc.documents)) {
    const reqEF = svc.documents.filter(d => d.required).map(d => `‡ ${d.en} (required)`).join('\n');
    chunks.push({
      ...base,
      topic: 'documents',
      language: 'en',
      title: meta.name_en,
      text: `Documents required for ${meta.name_en} in ${svc.state || 'Uttar Pradesh'}:\n${reqEF}`
    });
  }

  return chunks;
}

export async function runIngestion() {
  console.log('--- STARTING RAG KNOWLEDGE INGESTION ---');
  if (!fs.existsSync(SERVICES_DIR)) {
    console.error(`Services directory not found: ${SERVICES_DIR}`);
    return;
  }

  const files = fs.readdirSync(SERVICES_DIR).filter(f => f.withs('.json'));
  console.log(`Found ${files.length} service JSON files in ${SERVICES_DIR}`);

  let aiClient = null;
  if (env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  let qdrantClient = null;
  if (env.QDRANT_URL) {
    qdrantClient = new QdrantClient({ url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY || undefined });
  }

  let totalSources = 0;
  let totalChunks = 0;
  let pointsUpserted = 0;

  let firstVectorDim = 768;
  const qdrantPoints = [];

  for (const fileName of files) {
    const filePath = path.join(SERVICES_DIR, fileName);
    const svc = JSON.parse(fs.readF�[T�[���[T]	�]�	�JN�ۜ�Y]HH^�X��\��X�SY]Jݘ�N��ۜ��K�������\��[�Έ	ٚ[S�[Y_H
	�Y]K��\��X�W�YJX
N�ۜ��[�Y[�Hؚ�X��[��Y\�Y]JK��[\�
���JHO��OOH�[
K�X\

��JHO��N�ۜ��K����[Y]Y]H�Y[Έ	۝[�Y[˛[����[�Y[˚��[�	�	�H�	ۛۙI�X
N��[��\��\����]���\��RYHܞ\˜�[��UURQ

NY�
�\�XH	��\���ۛ�X�Y
H�H�ۜ���\��T�X�ܙH]�Z]�\�XK�ۛ��Y�T��\��K�\�\�
�\�N��Y����\��RYK�\]N�]N�Y]K��[YW�[��\\�Y[��Y]K�\\�Y[����\��W�\��Y]K���\��W�\����\��W�\N�Y]K���\��W�\K��\�Y�YY�Y]K��\�Y�YY��\��X�W��YΈY]K��\��X�W�Y�K�ܙX]N�Y����\��RY�]N�Y]K��[YW�[��\\�Y[��Y]K�\\�Y[���\��X�W�\��Y]K���\��W�\���\��X�W�\N�Y]K���\��W�\K��\�Y�YY�Y]K��\�Y�YY��\��X�W��YΈY]K��\��X�W�Y�B�JN���\��RYH��\��T�X�ܙ�YH�]�
\��H���\���\����[��\�[ۗH�ۛ��Y�T��\��H\�\���\Y��
�\���Y\��Y�JNB�B���ۜ��[���H�Z[�[��ќ��Tݘ�ݘ��[S�[YJN�[�[���
�H�[��˛[����܈
�ۜ��[��و�[���H�ۜ��[��YHܞ\˜�[��UURQ

N�Y�
�\�XH	��\���ۛ�X�Y
H�H]�Z]�\�XK�ۛ��Y�P�[�˘ܙX]J]N�Y��[��Y���\��W�Y����\��RY��XΈ�[�˝�X��[��XY�N��[�˛[��XY�K�^��[�˝^��Y�[ێ��[�˜�]K��\�Y�YY��[�˝�\�Y�YY�B�JNH�]�
\��H�����\Y�B�B��Y�
ZP�Y[�
H�ۜ��X�܈H]�Z][X�Y^
ZP�Y[�\��Y�N�	��[�˝^X
NY�
�X�܊H�\���X�ܑ[HH�X�܋�[��Y�[��[�˜\�
Y��[��Y��X�܋�^[�Y��[��Y���\��RY����\��RY��\��X�W�Y��[�˜�\��X�W�Y��\��X�RY��[�˜�\��X�W�Y�]N��[�˝]K�\\�Y[���[�˙\\�Y[����\��W�\���[�˜��\��W�\����\��U\���[�˜��\��W�\���XΈ�[�˝�X��[��XY�N��[�˛[��XY�K��Y�[ێ��[�˜�]K��\�Y�YY��[�˝�\�Y�YY���\��W�\N��[�˜��\��W�\K�^��[�˝^�B�JNB�B�B�B��Y�
]Y\�[۝�Y[�	��Y�[��[�˛[���
H�H�ۜ���X�[ۜ�H]�Z]Y�[��Y[���]��X�[ۜ�
N�ۜ�^\��H��X�[ۜ˘��X�[ۜ˜��YJ�O�˛�[YHOOH��P�SӗӐSQJNY�
^\��H]�Z]]Y\�[ې�Y[��[]P��X�[ۊ��P�SӗӐSQJN�ۜ��K����XܙX]YY�[���X�[ۈ	����P�SӗӐSQ_I�
NB�]�Z]Y�[��Y[��ܙX]P��X�[ۊ��P�SӗӐSQK�X�ܜΈ��^�N��\���X�ܑ[K\�[��N�	����[�I�B�JN]�Z]]Y\�[ې�Y[��\�\�
��P�SӗӐSQK��[�ΈY�[��[��JN�[��\�\�YHY�[��[�˛[���ۜ��K���\�\�Y	��[��\�\�YH�[��[��Y�[���X�[ۈ	����P�SӗӐSQ_I�
[OIٚ\���X�ܑ[_JK�
NH�]�
\��H�ۜ��K��\����[��\�[ۗHY�[�\�\���\Y��
�\���Y\��Y�JNB�B���ۜ��K���	��KKHS��T�Sӈ�SSPT�HKKI�N�ۜ��K���ۛ��Y�H��\��\����\��Y�	��[��\��\�X
N�ۜ��K���ۛ��Y�H�[����Z[�	��[�[���X
N�ۜ��K���Y�[��[��\�\�Y�	��[��\�\�YX
NB��Y�
���\�˘\�݈�WH	�����\�˘\�ݖ�WK�[���]
	�[��\�ۛ��Y�K����JH�[�[��\�[ۊ
K��]�
�ۜ��K�\��܊NB