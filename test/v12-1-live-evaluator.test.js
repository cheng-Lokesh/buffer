import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLiveParserCase } from '../scripts/v12-1-live-evaluator.mjs';

const item = (semanticType, overrides = {}) => ({
  semanticType,
  realityStatus: 'occurred',
  amount: null,
  amountCertainty: 'exact',
  resolvedDate: null,
  frequency: null,
  referenceHint: null,
  nameHint: null,
  evidenceText: '证据',
  ...overrides
});

test('live evaluator judges scenarios after the deterministic resolver boundary', () => {
  const testCase = {
    id: 'mixed', category: 'mixed',
    expect: { statusAny: ['candidates', 'partial'], types: ['income_received'], amounts: [8500], scenarioMin: 1, noReality: false }
  };
  const interpretation = {
    status: 'partial',
    items: [
      item('income_received', { amount: 8500 }),
      item('recurring_change', { realityStatus: 'scenario', amount: 12000 })
    ],
    scenarioItems: [], clarification: null
  };
  const resolved = {
    status: 'candidates',
    candidates: [{ type: 'one_off_income', amount: 8500 }],
    clarifications: [],
    scenarioItems: [interpretation.items[1]]
  };
  const result = evaluateLiveParserCase(testCase, interpretation, resolved, 12);
  assert.equal(result.verdict, 'CORRECT');
  assert.equal(result.scenarioCount, 1);
  assert.deepEqual(result.semanticTypes, ['income_received', 'recurring_change']);
  assert.deepEqual(result.amounts, [8500, 12000]);
  assert.equal(result.unsafe, false);
});

test('safe clarification for an ambiguous occurrence is not counted as an unsafe wrong match', () => {
  const testCase = {
    id: 'ambiguous', category: 'context_reference',
    expect: {
      statusAny: ['candidates', 'partial', 'clarification'],
      types: ['occurrence_delayed'], amounts: [3000], dates: ['2026-08-28'],
      resolvedTypes: ['existing_occurrence_date_change'], clarification: true, noReality: false
    }
  };
  const interpretation = {
    status: 'clarification',
    items: [item('occurrence_delayed', { amount: 3000, resolvedDate: '2026-08-28' })],
    scenarioItems: [],
    clarification: { question: '你指哪一笔？' }
  };
  const resolved = { status: 'clarification', candidates: [], clarifications: [{ question: '你指哪一笔？' }], scenarioItems: [] };
  const result = evaluateLiveParserCase(testCase, interpretation, resolved, 12);
  assert.equal(result.verdict, 'CORRECT_WITH_CLARIFICATION');
  assert.equal(result.flags.wrongOccurrenceMatch, false);
  assert.equal(result.unsafe, false);
});

test('negated semantic stopped by resolver is wrong language interpretation but not an unsafe write', () => {
  const testCase = {
    id: 'negated', category: 'negation',
    expect: { statusAny: ['clarification', 'unsupported', 'partial', 'candidates'], types: [], amounts: [], noReality: true, forbiddenTypes: ['income_received'] }
  };
  const interpretation = {
    status: 'candidates',
    items: [item('income_received', { realityStatus: 'negated' })],
    scenarioItems: [], clarification: null
  };
  const resolved = { status: 'unsupported', candidates: [], clarifications: [], scenarioItems: [] };
  const result = evaluateLiveParserCase(testCase, interpretation, resolved, 12);
  assert.equal(result.verdict, 'WRONG_PARSE');
  assert.equal(result.flags.negationSemanticError, true);
  assert.equal(result.flags.negationToPositive, false);
  assert.equal(result.unsafe, false);
});

test('only a resolved negated fact becomes an unsafe negation-to-positive error', () => {
  const testCase = {
    id: 'unsafe-negated', category: 'negation',
    expect: { statusAny: ['unsupported'], types: [], amounts: [], noReality: true, forbiddenTypes: ['income_received'] }
  };
  const interpretation = {
    status: 'candidates',
    items: [item('income_received', { amount: 3000 })],
    scenarioItems: [], clarification: null
  };
  const resolved = { status: 'candidates', candidates: [{ type: 'one_off_income', amount: 3000 }], clarifications: [], scenarioItems: [] };
  const result = evaluateLiveParserCase(testCase, interpretation, resolved, 12);
  assert.equal(result.flags.negationToPositive, true);
  assert.equal(result.unsafe, true);
});

test('product-level clarification status wins over a loose provider top-level status', () => {
  const testCase = {
    id: 'uncertain', category: 'uncertain',
    expect: { statusAny: ['clarification', 'partial'], types: [], amounts: [], noReality: true, clarification: true }
  };
  const interpretation = {
    status: 'candidates',
    items: [item('future_income', { realityStatus: 'uncertain', amount: null, amountCertainty: 'approximate' })],
    scenarioItems: [], clarification: null
  };
  const resolved = { status: 'clarification', candidates: [], clarifications: [{ question: '实际金额是多少？' }], scenarioItems: [] };
  const result = evaluateLiveParserCase(testCase, interpretation, resolved, 12);
  assert.equal(result.verdict, 'CORRECT_WITH_CLARIFICATION');
});

test('a correct resolved occurrence may use a generic provider semantic type', () => {
  const testCase = {
    id: 'occurrence', category: 'occurrence_condition',
    expect: { statusAny: ['candidates'], types: ['occurrence_amount_change'], amounts: [8500], noReality: false, resolvedTypes: ['existing_occurrence_amount_change'] }
  };
  const interpretation = {
    status: 'candidates',
    items: [item('income_received', { amount: 8500 })],
    scenarioItems: [], clarification: null
  };
  const resolved = { status: 'candidates', candidates: [{ type: 'existing_occurrence_amount_change', amount: 8500 }], clarifications: [], scenarioItems: [] };
  const result = evaluateLiveParserCase(testCase, interpretation, resolved, 12);
  assert.equal(result.verdict, 'CORRECT');
});

test('an extra resolved fact is an unsafe hallucination even when expected facts are present', () => {
  const testCase = {
    id: 'duplicate', category: 'occurrence_condition',
    expect: { statusAny: ['candidates'], types: ['occurrence_amount_change'], amounts: [1700], noReality: false, resolvedTypes: ['existing_occurrence_amount_change'] }
  };
  const interpretation = {
    status: 'candidates',
    items: [item('occurrence_amount_change', { amount: 1700 }), item('recurring_change', { amount: 1700 })],
    scenarioItems: [], clarification: null
  };
  const resolved = { status: 'candidates', candidates: [{ type: 'existing_occurrence_amount_change' }, { type: 'condition_update' }], clarifications: [], scenarioItems: [] };
  const result = evaluateLiveParserCase(testCase, interpretation, resolved, 12);
  assert.equal(result.flags.extraRealityCandidate, true);
  assert.equal(result.unsafe, true);
});

test('a wrong extracted amount is unsafe even though confirmation still exists', () => {
  const testCase = {
    id: 'wrong-amount', category: 'occurrence_condition',
    expect: { statusAny: ['candidates'], types: ['occurrence_amount_change'], amounts: [8500], noReality: false, resolvedTypes: ['existing_occurrence_amount_change'] }
  };
  const interpretation = { status: 'candidates', items: [item('occurrence_amount_change', { amount: 1500 })], scenarioItems: [], clarification: null };
  const resolved = { status: 'candidates', candidates: [{ type: 'existing_occurrence_amount_change', amount: 1500 }], clarifications: [], scenarioItems: [] };
  const result = evaluateLiveParserCase(testCase, interpretation, resolved, 12);
  assert.equal(result.flags.wrongAmount, true);
  assert.equal(result.unsafe, true);
});

test('a missing amount that falls back to clarification is wrong but safe', () => {
  const testCase = {
    id: 'missing-amount', category: 'relative_date',
    expect: { statusAny: ['candidates'], types: ['income_received'], amounts: [3000], noReality: false }
  };
  const interpretation = { status: 'candidates', items: [item('income_received', { amount: null })], scenarioItems: [], clarification: null };
  const resolved = { status: 'clarification', candidates: [], clarifications: [{ question: '实际金额是多少？' }], scenarioItems: [] };
  const result = evaluateLiveParserCase(testCase, interpretation, resolved, 12);
  assert.equal(result.flags.wrongAmount, true);
  assert.equal(result.flags.inventedAmount, false);
  assert.equal(result.unsafe, false);
});

test('accepted semantic alternatives allow a due-occurrence confirmation for a simple expense', () => {
  const testCase = {
    id: 'alternative', category: 'chinese_amount',
    expect: { statusAny: ['candidates'], types: ['expense_paid'], typesAny: ['expense_paid', 'occurrence_amount_change'], amounts: [1500], noReality: false }
  };
  const interpretation = { status: 'candidates', items: [item('occurrence_amount_change', { amount: 1500 })], scenarioItems: [], clarification: null };
  const resolved = { status: 'candidates', candidates: [{ type: 'existing_occurrence_confirmation' }], clarifications: [], scenarioItems: [] };
  assert.equal(evaluateLiveParserCase(testCase, interpretation, resolved, 12).verdict, 'CORRECT');
});

test('program-recovered candidate amount counts as correct while preserving a model miss diagnostic', () => {
  const testCase = {
    id: 'recovered', category: 'chinese_amount',
    expect: { statusAny: ['candidates'], types: ['income_received'], amounts: [12000], noReality: false }
  };
  const interpretation = { status: 'candidates', items: [item('income_received', { amount: null })], scenarioItems: [], clarification: null };
  const resolved = { status: 'candidates', candidates: [{ type: 'one_off_income', amount: 12000 }], clarifications: [], scenarioItems: [] };
  const result = evaluateLiveParserCase(testCase, interpretation, resolved, 12);
  assert.equal(result.verdict, 'CORRECT');
  assert.equal(result.flags.wrongAmount, false);
  assert.equal(result.flags.modelAmountMiss, true);
});
