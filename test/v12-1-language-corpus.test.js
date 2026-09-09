import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V12_1_LANGUAGE_CATEGORIES,
  V12_1_LANGUAGE_CORPUS
} from './fixtures/v12-1-language-corpus.js';

test('language corpus contains at least 150 distinct hand-written Chinese cases', () => {
  assert.ok(V12_1_LANGUAGE_CORPUS.length >= 150);
  assert.equal(new Set(V12_1_LANGUAGE_CORPUS.map((item) => item.text)).size, V12_1_LANGUAGE_CORPUS.length);
  assert.equal(new Set(V12_1_LANGUAGE_CORPUS.map((item) => item.id)).size, V12_1_LANGUAGE_CORPUS.length);
  assert.ok(V12_1_LANGUAGE_CORPUS.every((item) => /[\u3400-\u9fff]/.test(item.text)));
});

test('corpus covers every V12.1 high-risk language category with ten varied cases', () => {
  const required = ['balance', 'income', 'expense', 'multi_fact', 'chinese_amount', 'relative_date', 'negation', 'scenario', 'uncertain', 'mixed', 'occurrence', 'condition', 'known_future', 'pronoun', 'colloquial', 'prompt_injection'];
  assert.deepEqual([...V12_1_LANGUAGE_CATEGORIES].sort(), [...required].sort());
  for (const category of required) {
    assert.equal(V12_1_LANGUAGE_CORPUS.filter((item) => item.category === category).length, 10, category);
  }
});

test('corpus is not a repeated machine template', () => {
  const normalizedStarts = V12_1_LANGUAGE_CORPUS.map((item) => item.text.slice(0, 5));
  const uniqueStarts = new Set(normalizedStarts);
  assert.ok(uniqueStarts.size >= 110, `only ${uniqueStarts.size} unique openings`);
  const lengths = new Set(V12_1_LANGUAGE_CORPUS.map((item) => item.text.length));
  assert.ok(lengths.size >= 20);
});
