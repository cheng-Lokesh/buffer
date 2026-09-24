const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/v12-1-now-dashboard-facts.js');

function fixture() {
  const points = Array.from({ length: 91 }, (_, day) => ({
    date: new Date(Date.UTC(2026, 8, 24 + day)).toISOString().slice(0, 10),
    closingBalanceCents: 400000 - day * 3000,
    confirmedInflowsCents: day === 10 ? 100000 : 0,
    recurringOutflowsCents: day === 20 ? 20000 : 0,
    dailyFloorOutflowsCents: day ? 3000 : 0,
    oneOffEventsCents: day === 25 ? -5000 : 0
  }));
  return {
    reality: {
      conditions: [{ type: 'daily_floor', status: 'confirmed', amount: 30 }],
      events: [
        { id: 'old', type: 'expense', amount: 900, occurredAt: '2026-08-01', name: '旧记录' },
        { id: 'income', type: 'income', amount: 200, occurredAt: '2026-09-12', name: '已确认收入' },
        { id: 'expense', type: 'expense', amount: 500, occurredAt: '2026-09-20', name: '已确认支出' }
      ]
    },
    view: { valid: true, points, expectedOccurrences: [
      { id: 'due', status: 'due', expectedDate: '2026-09-24', conditionName: '待核对', expectedAmount: 50 },
      { id: 'upcoming', status: 'upcoming', expectedDate: '2026-10-04', conditionName: '固定收入', expectedAmount: 1000, direction: 'income' }
    ] }
  };
}

test('Now facts separate confirmed past records from future estimates', async () => {
  const { buildNowDashboardFacts } = await load();
  const { reality, view } = fixture();
  const result = buildNowDashboardFacts(reality, view, '2026-09-24');
  assert.deepEqual(result.forecastBalancesCents, { day7: 379000, day30: 310000, day60: 220000 });
  assert.equal(result.minimumDailySpendCents, 3000);
  assert.equal(result.recorded30.incomeCents, 20000);
  assert.equal(result.recorded30.expenseCents, 50000);
  assert.equal(result.recorded30.incomeCount, 1);
  assert.equal(result.recorded30.expenseCount, 1);
  assert.equal(result.recorded30.count, 2);
  assert.equal(result.latestEvent.id, 'expense');
  assert.equal(result.future30.confirmedIncomeCents, 100000);
  assert.equal(result.future30.extraExpenseCents, 25000);
  assert.equal(result.future30.minimumSpendCents, 90000);
  assert.equal(result.nextKnownChange.id, 'upcoming');
});

test('Now facts do not turn missing records or incomplete assumptions into zero-valued actual spending', async () => {
  const { buildNowDashboardFacts } = await load();
  const { reality, view } = fixture();
  reality.events = [];
  reality.conditions = [];
  view.points = view.points.slice(0, 8);
  view.expectedOccurrences = [];
  const result = buildNowDashboardFacts(reality, view, '2026-09-24');
  assert.equal(result.minimumDailySpendCents, null);
  assert.equal(result.recorded30.count, 0);
  assert.equal(result.recorded30.incomeCount, 0);
  assert.equal(result.recorded30.expenseCount, 0);
  assert.equal(result.latestEvent, null);
  assert.equal(result.nextKnownChange, null);
  assert.equal(result.forecastBalancesCents.day30, null);
  assert.equal(result.forecastBalancesCents.day60, null);
});

test('Now facts reject invalid forecasts and keep recent dates, inflows and covered items distinct', async () => {
  const { buildNowDashboardFacts } = await load();
  const { reality, view } = fixture();
  assert.equal(buildNowDashboardFacts(reality, { valid: false }, '2026-09-24'), null);
  reality.conditions[0].amount = 'not a number';
  reality.events = [
    { id: 'boundary', type: 'income', amount: 12, occurredAt: '2026-08-26' },
    { id: 'future', type: 'expense', amount: 99, occurredAt: '2026-09-25' },
    { id: 'bad', type: 'expense', amount: 'unknown', occurredAt: '2026-09-24' }
  ];
  view.points[5].oneOffEventsCents = 6000;
  view.expectedOccurrences = [
    { id: 'covered', status: 'upcoming', expectedDate: '2026-09-25', includedInDailyFloor: true },
    { id: 'outside', status: 'upcoming', expectedDate: '2026-11-01' }
  ];
  const result = buildNowDashboardFacts(reality, view, '2026-09-24');
  assert.equal(result.recorded30.count, 1);
  assert.equal(result.recorded30.incomeCents, 1200);
  assert.equal(result.latestEvent.id, 'boundary');
  assert.equal(result.minimumDailySpendCents, null);
  assert.equal(result.future30.confirmedIncomeCents, 106000);
  assert.equal(result.nextKnownChange, null);
});
