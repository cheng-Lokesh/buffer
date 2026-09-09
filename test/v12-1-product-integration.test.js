import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRealityCaptureContext,
  commitRealityCapture,
  REALITY_CANDIDATE_TYPES,
  validateRealityCandidates
} from '../src/v12-reality-capture.js';
import {
  createServerRealityParserAdapter,
  createV12_1RealityParser
} from '../src/v12-1-browser-adapter.js';

const reality = {
  version: 1,
  conditions: [
    { id: 'balance', type: 'balance', amount: 5000, status: 'confirmed', confirmedAt: '2026-08-25T08:00:00.000Z', source: 'user_confirmed' },
    { id: 'reserve', type: 'reserve', amount: 1000, status: 'confirmed', source: 'user_confirmed' },
    { id: 'floor', type: 'daily_floor', amount: 100, frequency: 'daily', startDate: '2026-08-25', status: 'confirmed', source: 'user_confirmed' }
  ],
  events: [], occurrenceResolutions: [], scenarioDrafts: []
};

test('browser adapter sends only the current sentence and selected minimal context', async () => {
  let request;
  const adapter = createServerRealityParserAdapter({
    endpoint: '/api/reality/parse',
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ status: 'unsupported', items: [], scenarioItems: [], clarification: null }), { status: 200 });
    }
  });
  await adapter.parse('工资到账了', {
    currentDate: '2026-08-25', timezone: 'Asia/Shanghai', currentBalance: 5000,
    activeConditions: [{ id: 'salary', name: '工资', type: 'recurring_income', amount: 10000 }],
    dueOccurrences: [{ id: 'occurrence:salary:2026-08-25', conditionId: 'salary', conditionName: '工资', expectedAmount: 10000, expectedDate: '2026-08-25', direction: 'income' }],
    events: [{ name: 'must never be sent' }], snapshots: [{ id: 'must never be sent' }]
  });
  assert.equal(request.url, '/api/reality/parse');
  const body = JSON.parse(request.init.body);
  assert.equal(body.text, '工资到账了');
  assert.equal('events' in body, false);
  assert.equal('snapshots' in body, false);
  assert.equal(request.init.credentials, 'same-origin');
});

test('product parser uses local balance fast path and server LLM for complex language', async () => {
  let calls = 0;
  const parser = createV12_1RealityParser({
    endpoint: '/api/reality/parse',
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: 'unsupported', items: [], scenarioItems: [], clarification: null }), { status: 200 });
    }
  });
  const context = { ...buildRealityCaptureContext(reality, { asOf: '2026-08-25' }), timezone: 'Asia/Shanghai' };
  const simple = await parser.parse('余额4360', context);
  assert.equal(simple.route, 'fast_path');
  assert.equal(calls, 0);
  const complex = await parser.parse('房东刚扣我1500，我妈转2000，现在总共6700', context);
  assert.equal(complex.route, 'llm');
  assert.equal(calls, 1);
});

test('known future one-off facts become forecast conditions without changing current balance', () => {
  assert.ok(REALITY_CANDIDATE_TYPES.includes('known_future_income'));
  assert.ok(REALITY_CANDIDATE_TYPES.includes('known_future_expense'));
  const context = buildRealityCaptureContext(reality, { asOf: '2026-08-25' });
  const candidates = [{ type: 'known_future_income', name: '客户款', amount: 3000, occurredAt: '2026-08-29' }];
  assert.equal(validateRealityCandidates(candidates, context).valid, true);
  const result = commitRealityCapture(reality, candidates, {
    asOf: '2026-08-25', confirmedAt: '2026-08-25T09:00:00.000Z', provenance: 'natural_language', makeId: (kind) => `future-${kind}`
  });
  assert.equal(result.summary.balanceAfter, 5000);
  assert.equal(result.reality.events.length, 0);
  const condition = result.reality.conditions.find((entry) => entry.name === '客户款');
  assert.equal(condition.type, 'known_event');
  assert.equal(condition.eventKind, 'income');
  assert.equal(condition.nextOccurrence, '2026-08-29');
});

test('candidate evidence stays transient through confirmation and raw model output never enters Reality', () => {
  const result = commitRealityCapture(reality, [{
    type: 'one_off_income', name: '工资', amount: 8500, occurredAt: '2026-08-25', evidenceText: '实际到了8500', rawModelResponse: 'must not persist'
  }], {
    asOf: '2026-08-25', confirmedAt: '2026-08-25T09:00:00.000Z', provenance: 'natural_language', makeId: (kind) => `evidence-${kind}`
  });
  const serialized = JSON.stringify(result.reality);
  assert.doesNotMatch(serialized, /实际到了8500|rawModelResponse|must not persist/);
  assert.equal(result.candidates[0].evidenceText, '实际到了8500');
  assert.equal('rawModelResponse' in result.candidates[0], false);
});
