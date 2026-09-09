const test = require('node:test');
const assert = require('node:assert/strict');

const fixture = {
  version: 1,
  conditions: [
    { id: 'balance', type: 'balance', amount: 6280, status: 'confirmed', source: 'user_confirmed' },
    { id: 'reserve', type: 'reserve', amount: 1200, status: 'confirmed', source: 'user_confirmed' },
    { id: 'daily', type: 'daily_floor', amount: 173, frequency: 'daily', startDate: '2026-08-21', status: 'confirmed', source: 'user_confirmed' },
    { id: 'rent', type: 'recurring_expense', amount: 1200, frequency: 'monthly', nextOccurrence: '2026-09-01', status: 'confirmed', source: 'user_confirmed' },
    { id: 'income', type: 'recurring_income', amount: 5000, frequency: 'monthly', nextOccurrence: '2026-09-05', status: 'confirmed', source: 'user_confirmed' }
  ],
  events: [
    { id: 'phone', type: 'expense', occurredAt: '2026-08-28', amount: 99, createdAt: '2026-08-20T09:00:00.000Z', source: 'user_confirmed' }
  ],
  scenarioDrafts: []
};

const contractView = (projection) => ({
  valid: projection.valid,
  status: projection.status,
  engineVersion: projection.engineVersion,
  reserveTouch: projection.reserveTouch,
  points: projection.points.map((point) => ({
    date: point.date,
    state: point.state,
    openingBalanceCents: point.openingBalanceCents,
    confirmedInflowsCents: point.confirmedInflowsCents,
    recurringOutflowsCents: point.recurringOutflowsCents,
    dailyFloorOutflowsCents: point.dailyFloorOutflowsCents,
    oneOffEventsCents: point.oneOffEventsCents,
    closingBalanceCents: point.closingBalanceCents,
    reserveDeltaCents: point.reserveDeltaCents,
    evidenceIds: point.evidenceIds,
    engineVersion: point.engineVersion
  }))
});

test('website and mini program return identical V8 projections for the same facts', async () => {
  const website = await import('../src/v8-cash-reality.js');
  const mini = require('../miniprogram/core/v8-cash-reality');
  const options = { asOf: '2026-08-20', horizonDays: 90 };

  const websiteProjection = website.buildCashRealityProjection(fixture, options);
  const miniProjection = mini.buildCashRealityProjection(fixture, options);
  assert.deepEqual(contractView(miniProjection), contractView(websiteProjection));
  assert.deepEqual(mini.buildNowSummary(miniProjection), website.buildNowSummary(websiteProjection));
});

test('website and mini program keep the same unknown-state boundary', async () => {
  const website = await import('../src/v8-cash-reality.js');
  const mini = require('../miniprogram/core/v8-cash-reality');
  const stale = {
    ...fixture,
    conditions: fixture.conditions.map((item) => item.id === 'daily' ? { ...item, status: 'stale' } : item)
  };
  const options = { asOf: '2026-08-20', horizonDays: 30 };

  assert.deepEqual(
    contractView(mini.buildCashRealityProjection(stale, options)),
    contractView(website.buildCashRealityProjection(stale, options))
  );
});
