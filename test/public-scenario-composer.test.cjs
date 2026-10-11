const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const composer = require('../miniprogram/core/scenario-composer');

const conditions = [
  { id: 'salary', name: '工资', type: 'recurring_income', amount: 8000, frequency: 'monthly', nextOccurrence: '2026-10-15', status: 'confirmed' },
  { id: 'rent', name: '房租', type: 'recurring_expense', amount: 3000, frequency: 'monthly', nextOccurrence: '2026-10-10', status: 'confirmed' }
];

test('scenario composer maps one-time and recurring income/expenses to supported operations', () => {
  const cases = [
    ['income_once', { name: '奖金', amount: '1000', date: '2026-11-01' }, { type: 'add_one_off', name: '奖金', cashflow: 'income', amount: 1000, occurredAt: '2026-11-01' }],
    ['expense_once', { name: '旅行', amount: '800', date: '2026-11-02' }, { type: 'add_one_off', name: '旅行', cashflow: 'expense', amount: 800, occurredAt: '2026-11-02' }],
    ['income_recurring', { name: '兼职', amount: '500', date: '2026-11-03', frequency: 'weekly' }, { type: 'add_recurring', name: '兼职', cashflow: 'income', amount: 500, frequency: 'weekly', nextOccurrence: '2026-11-03' }],
    ['expense_recurring', { name: '课程', amount: '200', date: '2026-11-04', frequency: 'monthly' }, { type: 'add_recurring', name: '课程', cashflow: 'expense', amount: 200, frequency: 'monthly', nextOccurrence: '2026-11-04' }]
  ];

  for (const [type, values, expected] of cases) {
    assert.deepEqual(composer.buildScenarioOperation({ type, ...values }, conditions), expected);
  }
});

test('scenario composer edits or pauses a selected confirmed condition without changing reality', () => {
  assert.deepEqual(composer.buildScenarioOperation({ type: 'change_amount', conditionId: 'rent', amount: '3500' }, conditions), {
    type: 'set_condition', conditionId: 'rent', field: 'amount', value: 3500
  });
  assert.deepEqual(composer.buildScenarioOperation({ type: 'pause_condition', conditionId: 'salary', date: '2026-12-01' }, conditions), {
    type: 'set_status', conditionId: 'salary', status: 'paused', effectiveDate: '2026-12-01'
  });
  assert.equal(conditions[1].amount, 3000);
  assert.equal(conditions[0].status, 'confirmed');
  assert.deepEqual(composer.scenarioConditionOptions([
    ...conditions,
    { id: 'balance', type: 'balance', status: 'confirmed' },
    { id: 'reserve', type: 'reserve', status: 'confirmed' },
    { id: 'old', type: 'recurring_expense', status: 'paused' }
  ], 'pause_condition').map(item => item.id), ['salary', 'rent']);
  assert.throws(() => composer.buildScenarioOperation({ type: 'pause_condition', conditionId: 'balance', date: '2026-12-01' }, [
    ...conditions, { id: 'balance', type: 'balance', status: 'confirmed' }
  ]), /不能暂停/);
});

test('scenario composer rejects missing conditions, names, invalid amounts, and dates', () => {
  assert.throws(() => composer.buildScenarioOperation({ type: 'change_amount', conditionId: 'missing', amount: '3' }, conditions), /选择一项已有条件/);
  assert.throws(() => composer.buildScenarioOperation({ type: 'income_once', amount: '3', date: '2026-11-01' }, conditions), /名称不能为空/);
  assert.throws(() => composer.buildScenarioOperation({ type: 'expense_once', name: '测试', amount: '0', date: '2026-11-01' }, conditions), /金额/);
  assert.throws(() => composer.buildScenarioOperation({ type: 'income_once', name: '测试', amount: '3', date: '2026-02-30' }, conditions), /日期/);
  assert.throws(() => composer.buildScenarioOperation({ type: 'nope' }, conditions), /请选择一种变化/);
  assert.throws(() => composer.buildScenarioOperation({ type: 'income_recurring', name: '测试', amount: '3', date: '2026-11-01', frequency: 'yearly' }, conditions), /频率/);
  assert.throws(() => composer.buildScenarioOperation({ type: 'pause_condition', conditionId: 'rent', date: 'later' }, conditions), /日期/);
  assert.throws(() => composer.buildScenarioOperation({ type: 'expense_once', name: '测试', amount: 'abc', date: '2026-11-01' }, conditions), /金额/);
  assert.deepEqual(composer.scenarioConditionOptions(null), []);
});

test('website and mini program use byte-equivalent scenario composition rules', async () => {
  const website = await import('../src/scenario-composer.js');
  assert.deepEqual(website.scenarioConditionOptions(conditions), composer.scenarioConditionOptions(conditions));
  assert.deepEqual(website.scenarioConditionOptions(null), composer.scenarioConditionOptions(null));
  assert.deepEqual(website.scenarioConditionOptions([
    ...conditions, { id: 'reserve', type: 'reserve', status: 'confirmed' }, { id: 'old', type: 'recurring_expense', status: 'paused' }
  ], 'pause_condition'), composer.scenarioConditionOptions([
    ...conditions, { id: 'reserve', type: 'reserve', status: 'confirmed' }, { id: 'old', type: 'recurring_expense', status: 'paused' }
  ], 'pause_condition'));
  for (const type of ['income_once', 'expense_once', 'income_recurring', 'expense_recurring', 'change_amount', 'pause_condition']) {
    const draft = type === 'change_amount'
      ? { type, conditionId: 'rent', amount: '3500' }
      : type === 'pause_condition'
        ? { type, conditionId: 'rent', date: '2026-12-01' }
        : { type, name: '样本', amount: '100', date: '2026-11-01', frequency: 'weekly' };
    assert.deepEqual(website.buildScenarioOperation(draft, conditions), composer.buildScenarioOperation(draft, conditions));
  }
  for (const draft of [
    { type: 'unknown' },
    { type: 'expense_once', name: '样本', amount: 'abc', date: '2026-11-01' },
    { type: 'income_once', name: '样本', amount: '1', date: '2026-02-30' },
    { type: 'expense_recurring', name: '样本', amount: '1', date: '2026-11-01', frequency: 'yearly' },
    { type: 'change_amount', conditionId: 'absent', amount: '1' },
    { type: 'pause_condition', conditionId: 'rent', date: 'soon' }
  ]) {
    assert.throws(() => website.buildScenarioOperation(draft, conditions));
    assert.throws(() => composer.buildScenarioOperation(draft, conditions));
  }
});

test('a combined scenario composes multiple assumptions and stays outside confirmed reality', async () => {
  const { createScenarioPatch, runScenarioPatch } = require('../miniprogram/core/v8-cash-reality');
  const reality = {
    version: 1,
    conditions: [
      { id: 'balance', type: 'balance', amount: 10000, status: 'confirmed', source: 'user_confirmed' },
      { id: 'reserve', type: 'reserve', amount: 1000, status: 'confirmed', source: 'user_confirmed' },
      { id: 'daily', type: 'daily_floor', amount: 50, frequency: 'daily', status: 'confirmed', source: 'user_confirmed' }
    ],
    events: [], scenarioDrafts: []
  };
  const operations = [
    composer.buildScenarioOperation({ type: 'income_once', name: '年终奖', amount: '2000', date: '2026-11-01' }, reality.conditions),
    composer.buildScenarioOperation({ type: 'expense_recurring', name: '课程', amount: '300', date: '2026-11-05', frequency: 'monthly' }, reality.conditions)
  ];
  const patch = createScenarioPatch({ baseSnapshotId: 'v8.0.0', operations });
  const result = runScenarioPatch(reality, patch, { asOf: '2026-10-11', horizonDays: 90 });
  assert.equal(result.valid, true);
  assert.equal(result.patch.operations.length, 2);
  assert.equal(reality.conditions.length, 3);
  assert.equal(reality.events.length, 0);
  assert.equal(reality.scenarioDrafts.length, 0);
});

test('mini future page lets the user add, remove, and simulate several scenario assumptions', () => {
  const root = path.resolve(__dirname, '..');
  const wxml = fs.readFileSync(path.join(root, 'miniprogram/pages/future/index.wxml'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'miniprogram/pages/future/index.js'), 'utf8');
  for (const marker of ['simulation-type', 'simulation-frequency', 'simulation-operations', 'add-simulation-operation', 'remove-simulation-operation', 'scroll-view']) {
    assert.match(`${wxml}\n${js}`, new RegExp(marker));
  }
  assert.match(js, /const operations = this\.data\.simulationOperations\.map/);
  assert.match(js, /createScenarioPatch\(\{ baseSnapshotId: this\.data\.projection\.engineVersion, operations \}\)/);
});

test('active website scenario flow uses the same multi-assumption composer', () => {
  const root = path.resolve(__dirname, '..');
  const site = fs.readFileSync(path.join(root, 'site/app-entry.js'), 'utf8');
  assert.match(site, /buildScenarioOperation/);
  assert.match(site, /scenario-type/);
  assert.match(site, /add-scenario-operation/);
  assert.match(site, /scenarioOperations/);
});
