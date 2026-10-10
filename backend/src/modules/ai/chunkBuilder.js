/**
 * chunkBuilder.js
 *
 * Single source of truth for converting a service JSON document into
 * retrieval chunks. Used by both:
 *   - scripts/ingestKnowledge.js  (for Qdrant upsert)
 *   - src/modules/ai/rag.service.js  (for local keyword fallback)
 *
 * Supported JSON shapes (all 9 data/services/*.json files):
 *   service_metadata          – service identity, source info
 *   eligibility_criteria      – string[]
 *   required_documents_checklist – {doc_name_en, doc_name_hi, description_en}[]
 *   application_process_steps – {step_number, title_en, description_en}[]
 *   vector_db_chunks          – {text, metadata}[]  (pre-authored chunks)
 *   faqs                      – {faq_id, question_en, question_hi, answer_en, category}[]
 *   fees                      – {amount_inr?, description_en?}[] or object
 *   workflow_steps            – same shape as application_process_steps
 *   application_fields        – {label_en?, description_en?}[]
 *   certificate_information   – {label_en?, description_en?}[]
 *   disability_categories     – {name_en?, description_en?}[]
 *   assessment_information    – free-form object
 *   application_locations     – {name_en?, address_en?}[]
 *   reasons_for_obtaining     – string[]
 *   income_calculation_rules  – {rule_en?}[]
 *   reservation_details       – free-form object
 *   issuing_authority         – {authority_name_en?, office_en?}
 *   certificate_details       – {validity?, format_en?}
 *
 * unknown_fields is intentionally skipped.
 */

function extractMeta(svc) {
  const meta = svc.service_metadata || {};
  const service_id = meta.service_id || svc.service_id || 'unknown';
  const name_en = meta.service_name_en || svc.name_en || service_id;
  const department = meta.department || svc.department || null;
  const source_url =
    meta.portal_page_url ||
    meta.portal_url ||
    meta.govt_order_link ||
    meta.form_link ||
    svc.portal_page_url ||
    svc.portal_url ||
    svc.source_url ||
    'https://edistrict.up.gov.in';
  const source_type = meta.source_type || svc.source_type || 'official_government_portal';
  const state = meta.state || svc.state || 'Uttar Pradesh';
  const verified = meta.verified ?? svc.verified ?? (source_type.startsWith('official') || source_type.startsWith('government') || true);
  return { service_id, name_en, department, source_url, source_type, state, verified };
}

function baseProps(meta, fileName) {
  return {
    service_id: meta.service_id,
    state: meta.state,
    source_type: meta.source_type,
    source_ref: fileName || meta.service_id,
    department: meta.department,
    source_url: meta.source_url,
    verified: meta.verified
  };
}

/**
 * Build all retrieval chunks from one service JSON document.
 *
 * @param {object} svc        – parsed JSON object
 * @param {string} fileName   – original filename (used as source_ref)
 * @returns {Array<object>}   – array of chunk objects
 */
export function buildChunks(svc, fileName) {
  const meta = extractMeta(svc);
  const base = baseProps(meta, fileName);

  // ── 1. Pre-authored vector_db_chunks ─────────────────────────────────────
  // If the file already has high-quality authored chunks, use only those.
  if (Array.isArray(svc.vector_db_chunks) && svc.vector_db_chunks.length > 0) {
    return svc.vector_db_chunks.map((c) => {
      const cm = c.metadata || {};
      const lang = cm.language || 'en';
      const chunkId = c.chunk_id || `${base.service_id}_${cm.topic || cm.section || 'chunk'}`;
      return {
        ...base,
        id: chunkId,
        knowledge_domain: svc.knowledge_domain || 'citizen_service',
        source_ref: chunkId,
        source_type: cm.source_type || base.source_type,
        source_url: cm.source_url || base.source_url,
        department: cm.department || base.department,
        state: cm.state || base.state,
        topic: cm.topic || cm.section || 'general',
        language: lang,
        title: cm.service_name || meta.name_en,
        text: (c.text || '').trim()
      };
    }).filter((c) => c.text);
  }

  // ── 2. Structured fields (flat-format files) ─────────────────────────────
  const chunks = [];

  // eligibility_criteria
  if (Array.isArray(svc.eligibility_criteria) && svc.eligibility_criteria.length > 0) {
    chunks.push({
      ...base,
      source_ref: `${meta.service_id}_eligibility`,
      topic: 'eligibility',
      language: 'en',
      title: meta.name_en,
      text:
        `Eligibility Criteria for ${meta.name_en}:\n` +
        svc.eligibility_criteria.map((e) => `• ${e}`).join('\n')
    });
  }

  // required_documents_checklist
  if (
    Array.isArray(svc.required_documents_checklist) &&
    svc.required_documents_checklist.length > 0
  ) {
    const docLines = svc.required_documents_checklist
      .map((d) => {
        const name = d.doc_name_en || d.name_en || '';
        const nameHi = d.doc_name_hi ? ` (${d.doc_name_hi})` : '';
        const desc = d.description_en ? `: ${d.description_en}` : '';
        return `• ${name}${nameHi}${desc}`;
      })
      .join('\n');
    chunks.push({
      ...base,
      source_ref: `${meta.service_id}_documents`,
      topic: 'documents',
      language: 'en',
      title: meta.name_en,
      text: `Required Documents for ${meta.name_en}:\n${docLines}`
    });
  }

  // application_process_steps / workflow_steps (same shape)
  const steps = svc.application_process_steps || svc.workflow_steps || null;
  if (Array.isArray(steps) && steps.length > 0) {
    const stepsText = steps
      .map((s) => {
        const num = s.step_number || '';
        const title = s.title_en || s.title || '';
        const desc = s.description_en || s.description || '';
        return `Step ${num}: ${title} - ${desc}`;
      })
      .join('\n');
    chunks.push({
      ...base,
      source_ref: `${meta.service_id}_process`,
      topic: 'process',
      language: 'en',
      title: meta.name_en,
      text: `Application Process for ${meta.name_en}:\n${stepsText}`
    });
  }

  // faqs
  if (Array.isArray(svc.faqs) && svc.faqs.length > 0) {
    for (const faq of svc.faqs) {
      const qen = faq.question_en || '';
      const qhi = faq.question_hi ? ` (${faq.question_hi})` : '';
      const ans = faq.answer_en || '';
      chunks.push({
        ...base,
        source_ref: `${meta.service_id}_faq_${faq.faq_id || ''}`,
        topic: faq.category || 'faq',
        language: 'en',
        title: meta.name_en,
        text: `Q: ${qen}${qhi}\nA: ${ans}`
      });
    }
  }

  // fees
  if (svc.fees) {
    let feeText = '';
    if (Array.isArray(svc.fees)) {
      feeText = svc.fees
        .map((f) => {
          const amt = f.amount_inr != null ? `₹${f.amount_inr}` : '';
          const desc = f.description_en || f.description || '';
          return [amt, desc].filter(Boolean).join(' - ');
        })
        .filter(Boolean)
        .join('\n• ');
      if (feeText) feeText = `• ${feeText}`;
    } else if (typeof svc.fees === 'object') {
      const amt = svc.fees.amount_inr;
      const desc = svc.fees.description_en || svc.fees.description || '';
      feeText = [amt != null ? `₹${amt}` : '', desc].filter(Boolean).join(' - ');
    }
    if (feeText) {
      chunks.push({
        ...base,
        source_ref: `${meta.service_id}_fees`,
        topic: 'fees',
        language: 'en',
        title: meta.name_en,
        text: `Fees for ${meta.name_en}:\n${feeText}`
      });
    }
  }

  // application_fields
  if (Array.isArray(svc.application_fields) && svc.application_fields.length > 0) {
    const lines = svc.application_fields
      .map((f) => {
        const label = f.label_en || f.field_name || '';
        const desc = f.description_en || f.description || '';
        return label ? `• ${label}${desc ? ': ' + desc : ''}` : null;
      })
      .filter(Boolean)
      .join('\n');
    if (lines) {
      chunks.push({
        ...base,
        source_ref: `${meta.service_id}_fields`,
        topic: 'application_fields',
        language: 'en',
        title: meta.name_en,
        text: `Application Form Fields for ${meta.name_en}:\n${lines}`
      });
    }
  }

  // certificate_information
  if (typeof svc.certificate_information === 'object' && svc.certificate_information !== null) {
    const ci = svc.certificate_information;
    const lines = Object.entries(ci)
      .map(([k, v]) => (v && typeof v === 'string' ? `• ${k}: ${v}` : null))
      .filter(Boolean)
      .join('\n');
    if (lines) {
      chunks.push({
        ...base,
        source_ref: `${meta.service_id}_cert_info`,
        topic: 'certificate_information',
        language: 'en',
        title: meta.name_en,
        text: `Certificate Information for ${meta.name_en}:\n${lines}`
      });
    }
  }

  // disability_categories
  if (Array.isArray(svc.disability_categories) && svc.disability_categories.length > 0) {
    const lines = svc.disability_categories
      .map((d) => `• ${d.name_en || d.name || ''}: ${d.description_en || d.description || ''}`)
      .join('\n');
    chunks.push({
      ...base,
      source_ref: `${meta.service_id}_disability_cats`,
      topic: 'disability_categories',
      language: 'en',
      title: meta.name_en,
      text: `Disability Categories covered by ${meta.name_en}:\n${lines}`
    });
  }

  // assessment_information (disability)
  if (typeof svc.assessment_information === 'object' && svc.assessment_information !== null) {
    const ai = svc.assessment_information;
    const lines = Object.entries(ai)
      .map(([k, v]) => (v && typeof v === 'string' ? `• ${k}: ${v}` : null))
      .filter(Boolean)
      .join('\n');
    if (lines) {
      chunks.push({
        ...base,
        source_ref: `${meta.service_id}_assessment`,
        topic: 'assessment',
        language: 'en',
        title: meta.name_en,
        text: `Assessment Information for ${meta.name_en}:\n${lines}`
      });
    }
  }

  // application_locations
  if (Array.isArray(svc.application_locations) && svc.application_locations.length > 0) {
    const lines = svc.application_locations
      .map((l) => `• ${l.name_en || l.name || ''}: ${l.address_en || l.address || ''}`)
      .join('\n');
    chunks.push({
      ...base,
      source_ref: `${meta.service_id}_locations`,
      topic: 'locations',
      language: 'en',
      title: meta.name_en,
      text: `Where to Apply for ${meta.name_en}:\n${lines}`
    });
  }

  // reasons_for_obtaining
  if (Array.isArray(svc.reasons_for_obtaining) && svc.reasons_for_obtaining.length > 0) {
    chunks.push({
      ...base,
      source_ref: `${meta.service_id}_reasons`,
      topic: 'reasons',
      language: 'en',
      title: meta.name_en,
      text:
        `Why you need ${meta.name_en}:\n` +
        svc.reasons_for_obtaining.map((r) => `• ${r}`).join('\n')
    });
  }

  // income_calculation_rules
  if (Array.isArray(svc.income_calculation_rules) && svc.income_calculation_rules.length > 0) {
    const lines = svc.income_calculation_rules
      .map((r) => `• ${r.rule_en || r.rule || JSON.stringify(r)}`)
      .join('\n');
    chunks.push({
      ...base,
      source_ref: `${meta.service_id}_income_rules`,
      topic: 'income_calculation',
      language: 'en',
      title: meta.name_en,
      text: `Income Calculation Rules for ${meta.name_en}:\n${lines}`
    });
  }

  // reservation_details (EWS)
  if (typeof svc.reservation_details === 'object' && svc.reservation_details !== null) {
    const rd = svc.reservation_details;
    const lines = Object.entries(rd)
      .map(([k, v]) => (v !== null && v !== undefined ? `• ${k}: ${v}` : null))
      .filter(Boolean)
      .join('\n');
    if (lines) {
      chunks.push({
        ...base,
        source_ref: `${meta.service_id}_reservation`,
        topic: 'reservation_details',
        language: 'en',
        title: meta.name_en,
        text: `Reservation / EWS Details for ${meta.name_en}:\n${lines}`
      });
    }
  }

  // issuing_authority
  if (typeof svc.issuing_authority === 'object' && svc.issuing_authority !== null) {
    const ia = svc.issuing_authority;
    const lines = Object.entries(ia)
      .map(([k, v]) => (v && typeof v === 'string' ? `• ${k}: ${v}` : null))
      .filter(Boolean)
      .join('\n');
    if (lines) {
      chunks.push({
        ...base,
        source_ref: `${meta.service_id}_authority`,
        topic: 'issuing_authority',
        language: 'en',
        title: meta.name_en,
        text: `Issuing Authority for ${meta.name_en}:\n${lines}`
      });
    }
  }

  // certificate_details (EWS)
  if (typeof svc.certificate_details === 'object' && svc.certificate_details !== null) {
    const cd = svc.certificate_details;
    const lines = Object.entries(cd)
      .map(([k, v]) => (v !== null && v !== undefined ? `• ${k}: ${v}` : null))
      .filter(Boolean)
      .join('\n');
    if (lines) {
      chunks.push({
        ...base,
        source_ref: `${meta.service_id}_cert_details`,
        topic: 'certificate_details',
        language: 'en',
        title: meta.name_en,
        text: `Certificate Details for ${meta.name_en}:\n${lines}`
      });
    }
  }

  return chunks.filter((c) => c.text && c.text.trim());
}
