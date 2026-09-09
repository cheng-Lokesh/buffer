import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealityParserRouter,
  isConservativeRealityFastPath,
  selectRelevantRealityContext
} from '../src/v12-1-reality-parser.js';

const context = {
  currentDate: '2026-08-25',
  timezone: 'Asia/Shanghai',
  currentBalance: 5000,
  activeConditions: [
    { id: 'salary', name: '工资', type: 'recurring_income', amount: 10000, frequency: 'monthly', nextOccurrence: '2026-08-25' },
    { id: 'rent', name: '房租', type: 'recurring_expense', amount: 1500, frequency: 'monthly', nextOccurrence: '2026-09-01' },
    { id: 'subscription', name: '视频会员', type: 'recurring_expense', amount: 25, frequency: 'monthly', nextOccurrence: '2026-09-10' }
  ],
  dueOccurrences: [
    { id: 'occurrence:salary:2026-08-25', conditionId: 'salary', conditionName: '工资', expectedDate: '2026-08-25', expectedAmount: 10000, direction: 'income' },
    { id: 'occurrence:client:2026-08-25', conditionId: 'client', conditionName: '客户款', expectedDate: '2026-08-25', expectedAmount: 3000, direction: 'income' }
  ]
};

test('fast path is deliberately limited to a single exact balance statement', () => {
  assert.equal(isConservativeRealityFastPath('余额4360', context), true);
  assert.equal(isConservativeRealityFastPath('现在还有3800', context), true);
  for (const text of [
    '房东刚扣我1500，我妈又给我转了2000，现在总共6700',
    '工资到账了',
    '工资还没到账',
    '如果下个月工资12000呢',
    '大概还有3000',
    '余额4360，房租刚扣了1500'
  ]) assert.equal(isConservativeRealityFastPath(text, context), false, text);
});

test('router uses local fast path only when the statement is uniquely safe', async () => {
  const calls = [];
  const router = createRealityParserRouter({
    localAdapter: { id: 'local', async parse(text) { calls.push(['local', text]); return { status: 'candidates', candidates: [{ type: 'balance_confirmation', amount: 4360, occurredAt: '2026-08-25' }] }; } },
    llmAdapter: { id: 'llm', async parse(text, sent) { calls.push(['llm', text, sent]); return { status: 'unsupported', items: [], scenarioItems: [], clarification: null }; } }
  });
  const simple = await router.parse('余额4360', context);
  assert.equal(simple.route, 'fast_path');
  assert.equal(simple.provider, 'local');
  const complex = await router.parse('房东刚扣我1500，我妈转2000，现在总共6700', context);
  assert.equal(complex.route, 'llm');
  assert.equal(complex.provider, 'llm');
  assert.deepEqual(calls.map(([kind]) => kind), ['local', 'llm']);
});

test('relevant context retrieval excludes unrelated history and conditions', () => {
  const salary = selectRelevantRealityContext('工资到账了', context);
  assert.equal(salary.activeConditions.length, 1);
  assert.equal(salary.activeConditions[0].id, 'salary');
  assert.equal(salary.dueOccurrences.length, 1);
  assert.equal(salary.dueOccurrences[0].conditionId, 'salary');
  assert.equal('events' in salary, false);
  assert.equal('snapshots' in salary, false);

  const amountReference = selectRelevantRealityContext('之前那笔3000客户说周五再给', context);
  assert.equal(amountReference.dueOccurrences.length, 1);
  assert.equal(amountReference.dueOccurrences[0].expectedAmount, 3000);
  assert.equal(amountReference.activeConditions.some((item) => item.id === 'subscription'), false);
});

test('provider failure preserves the original text and exposes manual fallbacks', async () => {
  const router = createRealityParserRouter({
    localAdapter: { id: 'local', async parse() { throw new Error('not expected'); } },
    llmAdapter: { id: 'deepseek-v4-flash', async parse() { throw new Error('provider unavailable'); } }
  });
  const text = '房东刚扣我1500，我妈转2000，现在总共6700';
  const result = await router.parse(text, context);
  assert.equal(result.status, 'error');
  assert.equal(result.originalText, text);
  assert.equal(result.canRetry, true);
  assert.deepEqual(result.manualFallbacks, ['precise_edit', 'balance_checkpoint']);
});

test('unsupported uncertain language becomes one safe clarification, never a guessed fact', async () => {
  const router = createRealityParserRouter({
    localAdapter: { id: 'local', async parse() { throw new Error('not expected'); } },
    llmAdapter: { id: 'llm', async parse() { return { status: 'unsupported', items: [], scenarioItems: [], clarification: null }; } }
  });
  const result = await router.parse('差不多还剩5000吧', context);
  assert.equal(result.status, 'clarification');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.clarifications.length, 1);
});
