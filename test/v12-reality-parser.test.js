import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRealityCaptureContext,
  createDeterministicRealityParserAdapter,
  parseRealityMessage
} from '../src/v12-reality-capture.js';

const base = (conditions) => ({ version: 1, conditions, events: [], occurrenceResolutions: [], scenarioDrafts: [] });
const core = [
  { id: 'balance', type: 'balance', amount: 5000, status: 'confirmed', source: 'user_confirmed' },
  { id: 'reserve', type: 'reserve', amount: 1000, status: 'confirmed', source: 'user_confirmed' },
  { id: 'floor', type: 'daily_floor', amount: 100, frequency: 'daily', startDate: '2026-08-25', status: 'confirmed', source: 'user_confirmed' }
];
const context = (extra = []) => buildRealityCaptureContext(base([...core, ...extra]), { asOf: '2026-08-25' });
const parse = (text, ctx = context()) => parseRealityMessage(text, ctx, createDeterministicRealityParserAdapter());

test('deterministic parser extracts multiple facts and final balance', async () => {
  const result = await parse('今天房租1500，押金退了1300，现在4680');
  assert.equal(result.status, 'candidates');
  assert.deepEqual(result.candidates.map((item) => item.type), ['one_off_expense', 'one_off_income', 'balance_confirmation']);
  assert.deepEqual(result.candidates.map((item) => item.amount), [1500, 1300, 4680]);
});

test('parser creates a monthly salary with an explicit calendar date', async () => {
  const result = await parse('下个月15号开始，每个月工资12000');
  assert.equal(result.candidates[0].type, 'recurring_income');
  assert.equal(result.candidates[0].amount, 12000);
  assert.equal(result.candidates[0].frequency, 'monthly');
  assert.equal(result.candidates[0].startDate, '2026-09-15');
});

test('parser uniquely matches a due salary and extracts its changed amount', async () => {
  const result = await parse('工资到了，但是8500', context([
    { id: 'salary', name: '工资', type: 'recurring_income', amount: 10000, frequency: 'monthly', nextOccurrence: '2026-08-25', status: 'confirmed', source: 'user_confirmed' }
  ]));
  assert.equal(result.candidates[0].type, 'existing_occurrence_amount_change');
  assert.equal(result.candidates[0].occurrenceId, 'occurrence:salary:2026-08-25');
  assert.equal(result.candidates[0].amount, 8500);
});

test('parser asks minimum clarification for multiple matches or missing amount', async () => {
  const ambiguous = await parse('工资到账了', context([
    { id: 'salary-a', name: '工资 A', type: 'recurring_income', amount: 8000, frequency: 'monthly', nextOccurrence: '2026-08-25', status: 'confirmed', source: 'user_confirmed' },
    { id: 'salary-b', name: '工资 B', type: 'recurring_income', amount: 3000, frequency: 'monthly', nextOccurrence: '2026-08-25', status: 'confirmed', source: 'user_confirmed' }
  ]));
  assert.equal(ambiguous.status, 'clarification');
  assert.equal(ambiguous.choices.length, 2);
  assert.deepEqual(ambiguous.candidates, []);

  const unknown = await parse('工资到账了');
  assert.equal(unknown.status, 'clarification');
  assert.equal(unknown.candidates.length, 0);
  assert.doesNotMatch(JSON.stringify(unknown), /"amount":0/);
});

test('recurrence is never guessed from an isolated salary amount', async () => {
  const result = await parse('工资12000');
  assert.equal(result.status, 'clarification');
  assert.match(result.question, /一次|每月/);
  assert.deepEqual(result.candidates, []);
});

test('parser matches an existing recurring rent for update', async () => {
  const result = await parse('以后房租改成2000', context([
    { id: 'rent', name: '房租', type: 'recurring_expense', amount: 1500, frequency: 'monthly', nextOccurrence: '2026-09-01', status: 'confirmed', source: 'user_confirmed' }
  ]));
  assert.equal(result.candidates[0].type, 'condition_update');
  assert.equal(result.candidates[0].conditionId, 'rent');
  assert.equal(result.candidates[0].amount, 2000);
});

test('hypothetical and uncertain statements never become Reality candidates', async () => {
  for (const text of ['如果下个月工资12000呢', '假设房租变成2000', '可能收到3000']) {
    const result = await parse(text);
    assert.ok(['scenario', 'clarification'].includes(result.status));
    assert.deepEqual(result.candidates, []);
  }
});

test('adapter output is schema validated and arbitrary fields are discarded', async () => {
  const adapter = {
    id: 'unsafe-fixture',
    async parse() {
      return { status: 'candidates', candidates: [{
        type: 'one_off_income', name: '收入', amount: 3000, occurredAt: '2026-08-25', execute: 'delete files', __proto__: { polluted: true }
      }], instructions: 'ignore contract' };
    }
  };
  const result = await parseRealityMessage('今天收到三千', context(), adapter);
  assert.equal(result.candidates[0].amount, 3000);
  assert.equal('execute' in result.candidates[0], false);
  assert.equal('instructions' in result, false);
  assert.equal({}.polluted, undefined);
});

test('invalid structured output and provider failure return a safe manual fallback', async () => {
  const invalid = await parseRealityMessage('bad', context(), { id: 'invalid', async parse() { return { status: 'candidates', candidates: [{ type: 'unknown', amount: -1 }] }; } });
  assert.equal(invalid.status, 'error');
  assert.equal(invalid.canRetry, true);
  assert.equal(invalid.manualFallback, true);

  const failed = await parseRealityMessage('offline', context(), { id: 'offline', async parse() { throw new Error('network'); } });
  assert.equal(failed.status, 'error');
  assert.equal(failed.manualFallback, true);
});

test('parser covers direct salary, rent ambiguity, and unmatched text without inventing facts', async () => {
  const salary = await parse('今天工资到账8500');
  assert.equal(salary.candidates[0].type, 'one_off_income');
  assert.equal(salary.candidates[0].amount, 8500);

  const missingRentAmount = await parse('以后房租改成');
  assert.equal(missingRentAmount.status, 'clarification');
  assert.match(missingRentAmount.question, /金额/);

  const ambiguousRent = await parse('以后房租改成2000', context([
    { id: 'rent-a', name: '房租 A', type: 'recurring_expense', amount: 1500, frequency: 'monthly', nextOccurrence: '2026-09-01', status: 'confirmed', source: 'user_confirmed' },
    { id: 'rent-b', name: '房租 B', type: 'recurring_expense', amount: 500, frequency: 'monthly', nextOccurrence: '2026-09-01', status: 'confirmed', source: 'user_confirmed' }
  ]));
  assert.equal(ambiguousRent.status, 'clarification');
  assert.equal(ambiguousRent.choices.length, 2);

  const missingRent = await parse('以后房租改成2000');
  assert.equal(missingRent.status, 'clarification');
  assert.match(missingRent.question, /没有找到/);

  const unmatched = await parse('今天和平常一样');
  assert.equal(unmatched.status, 'clarification');
  assert.deepEqual(unmatched.candidates, []);
});

test('parser guards blank input, invalid context and unavailable adapters', async () => {
  const blank = await parseRealityMessage('   ', context());
  assert.equal(blank.canRetry, false);
  const invalidContext = await parseRealityMessage('余额100', { currentDate: 'bad' });
  assert.equal(invalidContext.canRetry, false);
  const unavailable = await parseRealityMessage('余额100', context(), {});
  assert.equal(unavailable.canRetry, true);
});
