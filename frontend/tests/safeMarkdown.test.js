import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisibleVerifiedSources, parseAnswerMarkdown, parseInlineMarkdown } from '../src/utils/safeMarkdown.js';

test('answer renderer recognizes escaped emphasis and decodes visible HTML entities', () => {
  const blocks = parseAnswerMarkdown('Use \\*\\*the portal\\*\\*&#x20;to apply.');
  assert.deepEqual(blocks[0].children, [
    { type: 'text', value: 'Use ' },
    { type: 'strong', value: 'the portal' },
    { type: 'text', value: ' to apply.' }
  ]);
});

test('only source URLs returned with the answer become clickable links', () => {
  const linked = parseInlineMarkdown('[official portal](https://service.gov.in/apply)', ['https://service.gov.in/apply']);
  const untrusted = parseInlineMarkdown('[official portal](https://made-up.example)', ['https://service.gov.in/apply']);
  assert.deepEqual(linked, [{ type: 'link', label: 'official portal', url: 'https://service.gov.in/apply' }]);
  assert.deepEqual(untrusted, [{ type: 'text', value: 'official portal (https://made-up.example)' }]);
});

test('answer renderer groups lists and preserves Devanagari text', () => {
  const blocks = parseAnswerMarkdown('कदम:\n- आवेदन खोलें\n- दस्तावेज़ जमा करें');
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[1].type, 'ul');
  assert.deepEqual(blocks[1].items.map((item) => item[0].value), ['आवेदन खोलें', 'दस्तावेज़ जमा करें']);
});

test('answer renderer parses Markdown tables and unescapes escaped pipe separators', () => {
  const blocks = parseAnswerMarkdown('| Service | Steps |\n| --- | --- |\n| Income Certificate | Portal \\| Aadhaar e-KYC |\n| Caste Certificate | Submit documents |');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'table');
  assert.deepEqual(blocks[0].headers.map((cell) => cell.map((node) => node.value).join('')), ['Service', 'Steps']);
  assert.deepEqual(blocks[0].rows.map((row) => row.map((cell) => cell.map((node) => node.value).join(''))), [
    ['Income Certificate', 'Portal | Aadhaar e-KYC'],
    ['Caste Certificate', 'Submit documents']
  ]);
});

test('empty source metadata is omitted while verified titles and URLs remain visible', () => {
  const sources = getVisibleVerifiedSources([
    {},
    { id: '', title: '', sourceUrl: '' },
    { id: 'income', title: 'Income Certificate', sourceUrl: 'https://edistrict.up.gov.in/income' }
  ]);
  assert.deepEqual(sources, [{ id: 'income', title: 'Income Certificate', sourceUrl: 'https://edistrict.up.gov.in/income' }]);
});
