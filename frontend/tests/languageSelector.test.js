import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES } from '../src/utils/constants.js';

test('LANGUAGES contains en, hi, and hinglish options with correct labels', () => {
  assert.equal(LANGUAGES.length, 3, 'LANGUAGES array should contain exactly 3 options');
  assert.deepEqual(LANGUAGES, [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'hinglish', label: 'Hinglish' },
  ]);
});

test('Hinglish language option has exact code "hinglish"', () => {
  const hinglish = LANGUAGES.find((l) => l.code === 'hinglish');
  assert.ok(hinglish, 'Hinglish option must be present in LANGUAGES');
  assert.equal(hinglish.code, 'hinglish');
  assert.equal(hinglish.label, 'Hinglish');
});

test('Language codes match backend-supported language set', () => {
  const codes = LANGUAGES.map((l) => l.code);
  assert.ok(codes.includes('en'));
  assert.ok(codes.includes('hi'));
  assert.ok(codes.includes('hinglish'));
});
