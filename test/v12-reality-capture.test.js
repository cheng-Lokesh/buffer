import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRealityCaptureContext,
  commitRealityCapture,
  previewRealityCapture,
  validateRealityCandidates
} from '../src/v12-reality-capture.js';

const reality = (overrides = {}) => ({
  version: 1,
  conditions: [
    { id: 'balance', type: 'balance', amount: 5000, status: 'confirmed', confirmedAt: '2026-08-24T08:00:00.000Z', source: 'user_confirmed' },
    { id: 'reserve', type: 'reserve', amount: 1200, status: 'confirmed', source: 'user_confirmed' },
    { id: 'floor', type: 'daily_floor', amount: 100, frequency: 'daily', startDate: '2026-08-25', status: 'confirmed', source: 'user_confirmed' },
    { id: 'rent', name: '房租', type: 'recurring_expense', amount: 1500, frequency: 'monthly', nextOccurrence: '2026-08-25', status: 'confirmed', source: 'user_confirmed' },
    { id: 'salary', name: '工资', type: 'recurring_income', amount: 10000, frequency: 'monthly', nextOccurrence: '2026-08-25', status: 'confirmed', source: 'user_confirmed' }
  ],
  events: [],
  occurrenceResolutions: [],
  scenarioDrafts: [],
  realitySnapshots: [],
  forecastSnapshots: [],
  ...overrides
});

const options = {
  asOf: '2026-08-25',
  confirmedAt: '2026-08-25T09:00:00.000Z',
  makeId: (kind, index) => `v12-${kind}-${index}`
};

test('capture context contains only minimal relevant facts', () => {
  const context = buildRealityCaptureContext(reality(), { asOf: options.asOf });
  assert.equal(context.currentBalance, 5000);
  assert.equal(context.currentDate, options.asOf);
  assert.ok(context.dueOccurrences.some((item) => item.conditionName === '房租'));
  assert.ok(context.activeConditions.some((item) => item.name === '工资'));
  assert.equal('events' in context, false);
  assert.equal('scenarioDrafts' in context, false);
  assert.equal('realitySnapshots' in context, false);
});

test('balance checkpoint re-anchors cash without inventing a transaction', () => {
  const before = reality();
  const result = commitRealityCapture(before, [{
    type: 'balance_confirmation', amount: 4360, occurredAt: options.asOf
  }], { ...options, provenance: 'manual_balance' });
  assert.equal(result.reality.conditions.find((item) => item.type === 'balance').amount, 4360);
  assert.equal(result.reality.events.filter((item) => item.type === 'balance_confirmation').length, 1);
  assert.equal(result.reality.events.some((item) => item.type === 'expense' && item.amount === 640), false);
  assert.equal(result.summary.balanceBefore, 5000);
  assert.equal(result.summary.balanceAfter, 4360);
  assert.deepEqual(before, reality());
});

test('one-off change adjusts current balance when no final balance anchor exists', () => {
  const result = commitRealityCapture(reality(), [{
    type: 'one_off_expense', name: '房租', amount: 1500, occurredAt: options.asOf
  }], { ...options, provenance: 'natural_language' });
  assert.equal(result.reality.conditions.find((item) => item.type === 'balance').amount, 3500);
  assert.equal(result.reality.events.filter((item) => item.type === 'expense').length, 1);
});

test('cash-flow facts plus final balance use the final balance as anchor without double counting', () => {
  const result = commitRealityCapture(reality(), [
    { type: 'one_off_expense', name: '房租', amount: 1500, occurredAt: options.asOf },
    { type: 'one_off_income', name: '押金返还', amount: 1300, occurredAt: options.asOf },
    { type: 'balance_confirmation', amount: 4680, occurredAt: options.asOf }
  ], { ...options, provenance: 'natural_language' });
  assert.equal(result.reality.conditions.find((item) => item.type === 'balance').amount, 4680);
  assert.deepEqual(result.reality.events.map((item) => item.type).sort(), ['balance_confirmation', 'expense', 'income']);
  assert.equal(result.summary.usedBalanceAnchor, true);
});

test('due occurrence confirmation reuses known facts and never duplicates the event', () => {
  const result = commitRealityCapture(reality(), [{
    type: 'existing_occurrence_confirmation', occurrenceId: 'occurrence:rent:2026-08-25'
  }], { ...options, provenance: 'quick_occurrence' });
  assert.equal(result.reality.occurrenceResolutions.length, 1);
  assert.equal(result.reality.events.length, 1);
  assert.equal(result.reality.events[0].expectedOccurrenceId, 'occurrence:rent:2026-08-25');
  assert.equal(result.reality.conditions.find((item) => item.type === 'balance').amount, 5000);
});

test('due occurrence can change only amount, date, or this occurrence status', () => {
  const changedAmount = commitRealityCapture(reality(), [{
    type: 'existing_occurrence_amount_change', occurrenceId: 'occurrence:salary:2026-08-25', amount: 8500
  }], { ...options, provenance: 'natural_language' });
  assert.equal(changedAmount.reality.occurrenceResolutions[0].actualAmount, 8500);
  assert.equal(changedAmount.reality.conditions.find((item) => item.id === 'salary').amount, 10000);

  const changedDate = commitRealityCapture(reality(), [{
    type: 'existing_occurrence_date_change', occurrenceId: 'occurrence:salary:2026-08-25', actualDate: '2026-08-24'
  }], { ...options, provenance: 'quick_occurrence' });
  assert.equal(changedDate.reality.occurrenceResolutions[0].actualDate, '2026-08-24');

  const absent = commitRealityCapture(reality(), [{
    type: 'existing_occurrence_not_occurred', occurrenceId: 'occurrence:salary:2026-08-25'
  }], { ...options, provenance: 'quick_occurrence' });
  assert.equal(absent.reality.events.length, 0);
  assert.equal(absent.reality.conditions.find((item) => item.id === 'salary').status, 'confirmed');
});

test('recurring update matches the existing condition instead of creating a duplicate', () => {
  const result = commitRealityCapture(reality(), [{
    type: 'condition_update', conditionId: 'rent', amount: 2000
  }], { ...options, provenance: 'natural_language' });
  assert.equal(result.reality.conditions.filter((item) => item.name === '房租').length, 1);
  assert.equal(result.reality.conditions.find((item) => item.id === 'rent').amount, 2000);
});

test('preview and validation never mutate Reality and atomic failure writes nothing', () => {
  const before = reality();
  const candidates = [
    { type: 'one_off_income', name: '押金', amount: 1300, occurredAt: options.asOf },
    { type: 'balance_confirmation', amount: -1, occurredAt: options.asOf }
  ];
  assert.equal(validateRealityCandidates(candidates, buildRealityCaptureContext(before, { asOf: options.asOf })).valid, false);
  assert.throws(() => commitRealityCapture(before, candidates, options), /金额/);
  previewRealityCapture(before, [{ type: 'balance_confirmation', amount: 3800, occurredAt: options.asOf }], options);
  assert.deepEqual(before, reality());
});

test('confirmed changes preserve internal provenance while transient candidates are not persisted', () => {
  const result = commitRealityCapture(reality(), [{
    type: 'balance_confirmation', amount: 3800, occurredAt: options.asOf
  }], { ...options, provenance: 'voice' });
  assert.equal(result.reality.events[0].captureSource, 'voice');
  assert.equal(result.reality.conditions.find((item) => item.type === 'balance').captureSource, 'voice');
  assert.equal('candidates' in result.reality, false);
  assert.equal('captureTransactions' in result.reality, false);
});

test('recurring facts can be created and existing conditions can be paused or ended', () => {
  const created = commitRealityCapture(reality(), [
    { type: 'recurring_income', name: '固定补贴', amount: 800, frequency: 'monthly', startDate: '2026-09-01' },
    { type: 'recurring_expense', name: '订阅', amount: 30, frequency: 'monthly', startDate: '2026-08-25', endDate: '2026-12-25' }
  ], { ...options, provenance: 'precise_edit' });
  assert.equal(created.reality.conditions.find((item) => item.name === '固定补贴').captureSource, 'precise_edit');
  assert.equal(created.reality.conditions.find((item) => item.name === '订阅').endDate, '2026-12-25');

  const paused = commitRealityCapture(created.reality, [{ type: 'condition_pause', conditionId: 'rent' }], { ...options, provenance: 'precise_edit' });
  assert.equal(paused.reality.conditions.find((item) => item.id === 'rent').status, 'paused');
  const ended = commitRealityCapture(created.reality, [{ type: 'condition_end', conditionId: 'rent' }], { ...options, provenance: 'precise_edit' });
  assert.equal(ended.reality.conditions.find((item) => item.id === 'rent').status, 'ended');
});

test('a balance checkpoint creates the balance condition when legacy Reality has none', () => {
  const withoutBalance = reality({ conditions: reality().conditions.filter((item) => item.type !== 'balance') });
  const result = commitRealityCapture(withoutBalance, [{ type: 'balance_confirmation', amount: 2600 }], {
    ...options,
    provenance: 'manual_balance'
  });
  const balance = result.reality.conditions.find((item) => item.type === 'balance');
  assert.equal(balance.amount, 2600);
  assert.equal(balance.source, 'user_confirmed');
  assert.equal(result.summary.balanceBefore, null);
});

test('candidate validation rejects duplicates, invalid dates, invalid recurring facts, and unknown targets', () => {
  const ctx = buildRealityCaptureContext(reality(), { asOf: options.asOf });
  const due = 'occurrence:salary:2026-08-25';
  const invalidCases = [
    [],
    [
      { type: 'existing_occurrence_confirmation', occurrenceId: due },
      { type: 'existing_occurrence_not_occurred', occurrenceId: due }
    ],
    [
      { type: 'balance_confirmation', amount: 1 },
      { type: 'balance_confirmation', amount: 2 }
    ],
    [{ type: 'one_off_income', amount: 1, occurredAt: '2026-02-30' }],
    [{ type: 'recurring_income', name: '', amount: 1, frequency: 'monthly', startDate: options.asOf }],
    [{ type: 'recurring_income', name: '补贴', amount: 1, frequency: 'yearly', startDate: options.asOf }],
    [{ type: 'recurring_income', name: '补贴', amount: 1, frequency: 'monthly', startDate: 'bad' }],
    [{ type: 'recurring_income', name: '补贴', amount: 1, frequency: 'monthly', startDate: options.asOf, endDate: 'bad' }],
    [{ type: 'existing_occurrence_date_change', occurrenceId: due, actualDate: 'bad' }],
    [{ type: 'condition_update', conditionId: 'missing', amount: 1 }],
    [{ type: 'condition_update', conditionId: 'rent', amount: -1 }],
    [{ type: 'unknown' }]
  ];
  for (const candidates of invalidCases) assert.equal(validateRealityCandidates(candidates, ctx).valid, false);
  assert.throws(() => buildRealityCaptureContext(reality(), { asOf: 'not-a-date' }), /日期/);
  assert.throws(() => commitRealityCapture(reality(), [{ type: 'balance_confirmation', amount: 1 }], {
    ...options,
    provenance: 'unknown'
  }), /来源/);
  assert.throws(() => commitRealityCapture(reality(), [{ type: 'balance_confirmation', amount: 1 }], {
    ...options,
    provenance: 'manual_balance',
    confirmedAt: 'not-a-time'
  }), /确认时间/);
});
