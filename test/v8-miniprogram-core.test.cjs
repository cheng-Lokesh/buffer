const test = require('node:test');
const assert = require('node:assert/strict');

const cash = require('../miniprogram/core/v8-cash-reality');
const stateCore = require('../miniprogram/core/state');

const reality = (overrides = {}) => ({
  conditions: [
    { id: 'balance', type: 'balance', amount: 1000, status: 'confirmed', source: 'user_confirmed' },
    { id: 'reserve', type: 'reserve', amount: 200, status: 'confirmed', source: 'user_confirmed' },
    { id: 'daily', type: 'daily_floor', amount: 20, frequency: 'daily', startDate: '2026-08-21', status: 'confirmed', source: 'user_confirmed' },
    { id: 'rent', type: 'recurring_expense', amount: 100, frequency: 'monthly', nextOccurrence: '2026-09-01', status: 'confirmed', source: 'user_confirmed' },
    { id: 'income', type: 'recurring_income', amount: 300, frequency: 'monthly', nextOccurrence: '2026-09-05', status: 'confirmed', source: 'user_confirmed' }
  ],
  events: [{ id: 'expense', type: 'expense', occurredAt: '2026-08-25', amount: 50, source: 'user_confirmed' }],
  scenarioDrafts: [], ...overrides
});

test('mini V8 normalizer keeps only confirmed sources and isolated scenario drafts', () => {
  const normalized = cash.normalizeCashReality(reality({
    conditions: [...reality().conditions, null, { type: 'balance', amount: -1, source: 'user_confirmed' }, { type: 'balance', amount: 1, source: 'system' }, { type: 'recurring_expense', amount: 1, frequency: 'yearly', source: 'user_confirmed' }],
    events: [...reality().events, null, { type: 'income', occurredAt: 'bad', amount: 1, source: 'user_confirmed' }],
    scenarioDrafts: [
      { id: 'safe', neverApplyToReality: true, changes: [{ conditionId: 'daily', field: 'amount', value: 18 }, { conditionId: 'daily', field: 'bad', value: 1 }] },
      { id: 'unsafe', neverApplyToReality: false, changes: [] }
    ]
  }));
  assert.equal(normalized.conditions.length, 5);
  assert.equal(normalized.events.length, 1);
  assert.deepEqual(normalized.scenarioDrafts[0].changes, [{ conditionId: 'daily', field: 'amount', value: 18 }]);
  assert.equal(normalized.scenarioDrafts.length, 1);
});

test('mini V8 projection covers exact daily, weekly, monthly, once and event equations', () => {
  const source = reality({
    conditions: [
      ...reality().conditions.filter((item) => !['rent', 'income'].includes(item.id)),
      { id: 'weekly', type: 'recurring_expense', amount: 7, frequency: 'weekly', nextOccurrence: '2026-08-21', endDate: '2026-09-04', status: 'confirmed', source: 'user_confirmed' },
      { id: 'once', type: 'recurring_income', amount: 40, frequency: 'once', nextOccurrence: '2026-08-23', status: 'confirmed', source: 'user_confirmed' },
      { id: 'covered', type: 'recurring_expense', amount: 99, frequency: 'monthly', nextOccurrence: '2026-09-01', includedInDailyFloor: true, status: 'confirmed', source: 'user_confirmed' },
      { id: 'paused', type: 'recurring_expense', amount: 999, frequency: 'daily', nextOccurrence: '2026-08-21', status: 'paused', source: 'user_confirmed' }
    ]
  });
  const projection = cash.buildCashRealityProjection(source, { asOf: '2026-08-20', horizonDays: 20 });
  assert.equal(projection.points.length, 21);
  assert.deepEqual(projection.points.filter((point) => point.recurringOutflowsCents === 700).map((point) => point.date), ['2026-08-21', '2026-08-28', '2026-09-04']);
  assert.equal(projection.points.find((point) => point.date === '2026-08-23').confirmedInflowsCents, 4000);
  assert.ok(projection.points.find((point) => point.date === '2026-09-01').evidenceIds.includes('condition:covered:covered_by_daily_floor'));
  for (const point of projection.points) assert.equal(point.closingBalanceCents, point.openingBalanceCents + point.confirmedInflowsCents - point.recurringOutflowsCents - point.dailyFloorOutflowsCents + point.oneOffEventsCents);
});

test('mini V8 projection reports unknown and lower-bound states honestly', () => {
  for (const result of [
    cash.buildCashRealityProjection(reality(), { asOf: '2026-02-30', horizonDays: 30 }),
    cash.buildCashRealityProjection(reality(), { asOf: '2026-08-20', horizonDays: 0 }),
    cash.buildCashRealityProjection(reality({ conditions: reality().conditions.filter((item) => item.type !== 'balance') }), { asOf: '2026-08-20', horizonDays: 30 }),
    cash.buildCashRealityProjection(reality({ conditions: reality().conditions.map((item) => item.id === 'daily' ? { ...item, status: 'stale' } : item) }), { asOf: '2026-08-20', horizonDays: 30 })
  ]) assert.equal(result.valid, false);
  assert.equal(cash.buildNowSummary({ valid: false }).status, 'unknown');
  const long = cash.buildCashRealityProjection(reality({ conditions: reality().conditions.map((item) => item.id === 'balance' ? { ...item, amount: 100000 } : item), events: [] }), { asOf: '2026-08-20', horizonDays: 10 });
  assert.equal(cash.buildNowSummary(long).supportIsLowerBound, true);
  const reached = cash.buildCashRealityProjection(reality({ conditions: reality().conditions.map((item) => item.id === 'balance' ? { ...item, amount: 200 } : item) }), { asOf: '2026-08-20', horizonDays: 10 });
  assert.equal(reached.reserveTouch.days, 0);
});

test('mini V8 explains points and keeps simulations isolated', () => {
  const source = reality();
  const projection = cash.buildCashRealityProjection(source, { asOf: '2026-08-20', horizonDays: 90 });
  const point = cash.explainProjectionPoint(projection, '2026-09-05');
  assert.equal(point.equation.matches, true);
  assert.equal(point.label, '预计');
  assert.equal(cash.explainProjectionPoint(projection, '2027-01-01'), null);
  const patch = cash.createScenarioPatch({ changes: [{ conditionId: 'daily', field: 'amount', value: 18 }], createdAt: '2026-08-20T10:00:00.000Z' });
  const before = JSON.stringify(source);
  const result = cash.runScenarioPatch(source, patch, { asOf: '2026-08-20', horizonDays: 90 });
  assert.equal(result.valid, true);
  assert.ok(result.delta.supportDays > 0);
  assert.equal(JSON.stringify(source), before);
  assert.throws(() => cash.createScenarioPatch({ changes: [] }), /至少需要/);
  assert.throws(() => cash.createScenarioPatch({ changes: [{ conditionId: 'daily', field: 'bad', value: 1 }] }), /修改无效/);
  assert.throws(() => cash.runScenarioPatch(source, cash.createScenarioPatch({ changes: [{ conditionId: 'missing', field: 'amount', value: 1 }] }), { asOf: '2026-08-20', horizonDays: 30 }), /找不到/);
});

test('mini state V8 events, conditions and drafts preserve legacy evidence', () => {
  let state = stateCore.normalizeState({ cash: { balance: 1000, reserve: 200, daily: 20 }, changes: [] });
  const add = stateCore.addV8Condition(state, { type: 'recurring_expense', amount: 100, frequency: 'monthly', nextOccurrence: '2026-09-01' }, '2026-08-20T09:00:00.000Z', 'rent');
  assert.equal(add.ok, true);
  state = add.state;
  assert.equal(stateCore.addV8Condition(state, { type: 'bad', amount: 1, nextOccurrence: '2026-09-01' }).ok, false);
  assert.equal(stateCore.addV8Condition(state, { type: 'known_event', amount: -1, nextOccurrence: '2026-09-01' }).ok, false);
  assert.equal(stateCore.addV8Condition(state, { type: 'known_event', amount: 1, nextOccurrence: 'bad' }).ok, false);
  const updated = stateCore.updateV8Condition(state, 'rent', { amount: 120 }, '2026-08-20T10:00:00.000Z');
  assert.equal(updated.state.cashReality.conditions.find((item) => item.id === 'rent').amount, 120);
  const event = stateCore.applyV8CashEvent(updated.state, { type: 'expense', occurredAt: '2026-08-21', amount: 50 }, 'future', '2026-08-20T10:00:00.000Z');
  assert.equal(event.state.cash.balance, 1000);
  const invalidType = stateCore.applyV8CashEvent(state, { type: 'bad', occurredAt: '2026-08-20', amount: 1 });
  const invalidDate = stateCore.applyV8CashEvent(state, { type: 'expense', occurredAt: 'bad', amount: 1 });
  const invalidAmount = stateCore.applyV8CashEvent(state, { type: 'expense', occurredAt: '2026-08-20', amount: -1 });
  assert.equal(invalidType.ok || invalidDate.ok || invalidAmount.ok, false);
  const saved = stateCore.saveScenarioDraft(event.state, cash.createScenarioPatch({ changes: [{ conditionId: 'daily-floor', field: 'amount', value: 18 }] }));
  assert.equal(saved.state.cashReality.scenarioDrafts.length, 1);
  const cashUpdate = stateCore.applyCashChange(saved.state, { balance: 900, reserve: 200, daily: 20 });
  assert.equal(cashUpdate.state.cashReality.conditions.some((item) => item.id === 'rent'), true);
  assert.equal(cashUpdate.state.cashReality.events.length, 1);
  assert.equal(cashUpdate.state.cashReality.scenarioDrafts.length, 1);
});
