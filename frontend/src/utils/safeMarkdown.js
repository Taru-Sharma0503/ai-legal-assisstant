const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0'
};

export function decodeTextEntities(value) {
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
    if (code[0] !== '#') return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
    const number = code[1].toLowerCase() === 'x'
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    return Number.isInteger(number) && number >= 0 && number <= 0x10ffff
      ? String.fromCodePoint(number)
      : entity;
  });
}

export function getVisibleVerifiedSources(sources = []) {
  const seen = new Set();
  return sources.filter((source) => {
    const title = (source?.title || '').trim();
    const url = (source?.sourceUrl || source?.source_url || '').trim();
    if (!title && !url) return false;
    // Canonical identity: prefer URL, fall back to title+serviceId
    const key = url || `${source?.serviceId || source?.service_id || ''}:${title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseInlineMarkdown(value, allowedUrls = []) {
  const text = decodeTextEntities(value).replace(/\\\*\\\*/g, '**').replace(/\\\|/g, '|');
  const allowed = new Set(allowedUrls.filter((url) => typeof url === 'string' && /^https:\/\//i.test(url)));
  const token = /\*\*(.+?)\*\*|\*([^*]+?)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const nodes = [];
  let cursor = 0;
  let match;
  while ((match = token.exec(text))) {
    if (match.index > cursor) nodes.push({ type: 'text', value: text.slice(cursor, match.index) });
    if (match[1] !== undefined) nodes.push({ type: 'strong', value: match[1] });
    else if (match[2] !== undefined) nodes.push({ type: 'em', value: match[2] });
    else if (match[3] !== undefined) nodes.push({ type: 'code', value: match[3] });
    else if (allowed.has(match[5])) nodes.push({ type: 'link', label: match[4], url: match[5] });
    else nodes.push({ type: 'text', value: `${match[4]} (${match[5]})` });
    cursor = token.lastIndex;
  }
  if (cursor < text.length) nodes.push({ type: 'text', value: text.slice(cursor) });
  return nodes;
}

export function parseAnswerMarkdown(value, allowedUrls = []) {
  const lines = String(value || '').split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: parseInlineMarkdown(paragraph.join(' '), allowedUrls) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  const splitTableRow = (line) => {
    const marker = '\u0000';
    const escaped = line.trim().replace(/\\\|/g, marker).replace(/^\|/, '').replace(/\|$/, '');
    return escaped.split('|').map((cell) => cell.replaceAll(marker, '|').trim());
  };
  const isTableSeparator = (line) => splitTableRow(line).length > 1 && splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    if (line.includes('|') && lineIndex + 1 < lines.length && isTableSeparator(lines[lineIndex + 1])) {
      flushParagraph(); flushList();
      const headers = splitTableRow(line).map((cell) => parseInlineMarkdown(cell, allowedUrls));
      lineIndex++;
      const rows = [];
      while (lineIndex + 1 < lines.length && lines[lineIndex + 1].includes('|') && lines[lineIndex + 1].trim()) {
        lineIndex++;
        rows.push(splitTableRow(lines[lineIndex]).map((cell) => parseInlineMarkdown(cell, allowedUrls)));
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }
    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInlineMarkdown(heading[2], allowedUrls) });
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (list?.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push(parseInlineMarkdown((bullet || numbered)[1], allowedUrls));
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph(); flushList();
  return blocks;
}
