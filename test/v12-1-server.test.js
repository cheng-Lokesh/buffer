import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeepSeekRealityParserAdapter,
  handleRealityParserRequest
} from '../server/v12-1-deepseek.js';

const validInterpretation = {
  status: 'candidates',
  items: [{
    semanticType: 'balance_confirmation', direction: 'balance', amount: 4368,
    amountCertainty: 'exact', dateExpression: '现在', resolvedDate: '2026-08-25',
    frequency: null, nameHint: null, referenceHint: null, realityStatus: 'actual', evidenceText: '现在只剩4368'
  }],
  scenarioItems: [],
  clarification: null
};

test('DeepSeek adapter uses server-only auth, Responses API and native JSON Schema without tools', async () => {
  let captured;
  const adapter = createDeepSeekRealityParserAdapter({
    apiKey: 'server-secret-fixture',
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(validInterpretation) }] }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const result = await adapter.parse({ text: '现在只剩4368', currentDate: '2026-08-25', timezone: 'Asia/Shanghai', currentBalance: 5000, activeConditions: [], dueOccurrences: [] });
  assert.deepEqual(result, validInterpretation);
  assert.equal(captured.url, 'https://api.deepseek.com/responses');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, 'deepseek-v4-flash');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal('tools' in body, false);
  assert.match(captured.init.headers.authorization, /^Bearer /);
  assert.doesNotMatch(captured.init.body, /server-secret-fixture/);
});

test('server endpoint rejects oversized, malformed and cross-origin requests before provider call', async () => {
  let calls = 0;
  const env = { DEEPSEEK_API_KEY: 'fixture', ALLOWED_ORIGIN: 'http://127.0.0.1:4191' };
  const options = { fetchImpl: async () => { calls += 1; throw new Error('must not call'); } };
  const requests = [
    new Request('http://server/api/reality/parse', { method: 'GET', headers: { origin: env.ALLOWED_ORIGIN } }),
    new Request('http://server/api/reality/parse', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }),
    new Request('http://server/api/reality/parse', { method: 'POST', headers: { origin: env.ALLOWED_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(1001) }) })
  ];
  for (const request of requests) {
    const response = await handleRealityParserRequest(request, env, options);
    assert.ok(response.status >= 400);
  }
  assert.equal(calls, 0);
});

test('provider failure returns a neutral safe error without prompt, response or key leakage', async () => {
  const response = await handleRealityParserRequest(new Request('http://server/api/reality/parse', {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:4191', 'content-type': 'application/json' },
    body: JSON.stringify({ text: '房东刚扣我1500', currentDate: '2026-08-25', timezone: 'Asia/Shanghai', currentBalance: 5000, activeConditions: [], dueOccurrences: [] })
  }), { DEEPSEEK_API_KEY: 'server-secret-fixture', ALLOWED_ORIGIN: 'http://127.0.0.1:4191' }, {
    fetchImpl: async () => new Response('{"error":"upstream included prompt 房东刚扣我1500"}', { status: 500 })
  });
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.doesNotMatch(text, /房东|server-secret|upstream/);
  assert.match(text, /provider_unavailable/);
});

test('endpoint returns only validated structured interpretation and never commits Reality', async () => {
  const before = { version: 1, conditions: [{ id: 'balance', type: 'balance', amount: 5000 }], events: [] };
  const response = await handleRealityParserRequest(new Request('http://server/api/reality/parse', {
    method: 'POST', headers: { origin: 'http://127.0.0.1:4191', 'content-type': 'application/json' },
    body: JSON.stringify({ text: '现在只剩4368', currentDate: '2026-08-25', timezone: 'Asia/Shanghai', currentBalance: 5000, activeConditions: [], dueOccurrences: [] })
  }), { DEEPSEEK_API_KEY: 'fixture', ALLOWED_ORIGIN: 'http://127.0.0.1:4191' }, {
    fetchImpl: async () => new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(validInterpretation) }] }] }), { status: 200 })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(before, { version: 1, conditions: [{ id: 'balance', type: 'balance', amount: 5000 }], events: [] });
  const body = await response.json();
  assert.equal(body.status, 'candidates');
  assert.equal('reality' in body, false);
  assert.equal('candidates' in body, false);
});

test('adapter tolerates one provider markdown fence but still requires the strict schema', async () => {
  const adapter = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture',
    fetchImpl: async () => new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: `\`\`\`json\n${JSON.stringify(validInterpretation)}\n\`\`\`` }] }]
    }), { status: 200 })
  });
  assert.deepEqual(await adapter.parse({ text: '现在只剩4368', currentDate: '2026-08-25', timezone: 'Asia/Shanghai', currentBalance: 5000, activeConditions: [], dueOccurrences: [] }), validInterpretation);
});

test('adapter retries one invalid structured response and never accepts a schema echo', async () => {
  let calls = 0;
  const adapter = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture',
    fetchImpl: async () => {
      calls += 1;
      const text = calls === 1 ? JSON.stringify({ type: 'object', properties: {} }) : JSON.stringify(validInterpretation);
      return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }), { status: 200 });
    }
  });
  assert.deepEqual(await adapter.parse({ text: '现在只剩4368', currentDate: '2026-08-25', timezone: 'Asia/Shanghai', currentBalance: 5000, activeConditions: [], dueOccurrences: [] }), validInterpretation);
  assert.equal(calls, 2);

  const echoOnly = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture',
    fetchImpl: async () => new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ type: 'object', properties: {} }) }] }] }), { status: 200 })
  });
  await assert.rejects(() => echoOnly.parse({ text: '现在只剩4368', currentDate: '2026-08-25', timezone: 'Asia/Shanghai', currentBalance: 5000, activeConditions: [], dueOccurrences: [] }), /provider_schema_invalid/);
});

test('adapter normalizes a quoted approximate amount to unknown before strict validation', async () => {
  const approximate = structuredClone(validInterpretation);
  approximate.items[0].amount = 9000;
  approximate.items[0].amountCertainty = 'approximate';
  approximate.items[0].realityStatus = 'uncertain';
  const adapter = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture',
    fetchImpl: async () => new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(approximate) }] }]
    }), { status: 200 })
  });
  const parsed = await adapter.parse({ text: '工资大概能有九千', currentDate: '2026-08-25', timezone: 'Asia/Shanghai', currentBalance: 5000, activeConditions: [], dueOccurrences: [] });
  assert.equal(parsed.items[0].amount, null);
  assert.equal(parsed.items[0].amountCertainty, 'approximate');
});

test('adapter derives the top-level status from validated item groups', async () => {
  const mixed = structuredClone(validInterpretation);
  mixed.status = 'scenario';
  mixed.scenarioItems = [{ ...mixed.items[0], realityStatus: 'scenario' }];
  const adapter = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture',
    fetchImpl: async () => new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(mixed) }] }]
    }), { status: 200 })
  });
  const parsed = await adapter.parse({ text: '到账了，如果以后怎样', currentDate: '2026-08-25', timezone: 'Asia/Shanghai', currentBalance: 5000, activeConditions: [], dueOccurrences: [] });
  assert.equal(parsed.status, 'partial');
});

test('adapter retries one suspicious unsupported result for an explicit transaction', async () => {
  let calls = 0;
  const adapter = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture',
    fetchImpl: async () => {
      calls += 1;
      const output = calls === 1 ? { status: 'unsupported', items: [], scenarioItems: [], clarification: null } : validInterpretation;
      return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }), { status: 200 });
    }
  });
  const parsed = await adapter.parse({ text: '房东扣了一千五', currentDate: '2026-08-25', timezone: 'Asia/Shanghai', currentBalance: 5000, activeConditions: [], dueOccurrences: [] });
  assert.equal(calls, 2);
  assert.equal(parsed.status, 'candidates');
});

test('adapter accepts top-level output text and rejects empty or invalid JSON output after one retry', async () => {
  const topLevel = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture',
    fetchImpl: async () => new Response(JSON.stringify({ output_text: JSON.stringify(validInterpretation) }), { status: 200 })
  });
  assert.equal((await topLevel.parse({ text: '余额4368', currentDate: '2026-08-25' })).status, 'candidates');

  const empty = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture', fetchImpl: async () => new Response(JSON.stringify({ output: [] }), { status: 200 })
  });
  await assert.rejects(() => empty.parse({ text: '余额4368', currentDate: '2026-08-25' }), /provider_output_invalid/);

  const invalidJson = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture', fetchImpl: async () => new Response(JSON.stringify({ output_text: '{not-json' }), { status: 200 })
  });
  await assert.rejects(() => invalidJson.parse({ text: '余额4368', currentDate: '2026-08-25' }), /provider_json_invalid/);
});

test('server preflight, malformed JSON, invalid context and missing provider key fail closed', async () => {
  const origin = 'http://127.0.0.1:4191';
  const env = { DEEPSEEK_API_KEY: 'fixture', ALLOWED_ORIGIN: origin };
  const allowedPreflight = await handleRealityParserRequest(new Request('http://server/api/reality/parse', { method: 'OPTIONS', headers: { origin } }), env);
  assert.equal(allowedPreflight.status, 204);
  assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), origin);
  assert.equal((await handleRealityParserRequest(new Request('http://server/api/reality/parse', { method: 'OPTIONS', headers: { origin: 'http://evil.example' } }), env)).status, 403);

  const malformed = await handleRealityParserRequest(new Request('http://server/api/reality/parse', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{'
  }), env);
  assert.equal(malformed.status, 400);
  const invalidContext = await handleRealityParserRequest(new Request('http://server/api/reality/parse', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ text: '余额4368', currentDate: 'not-a-date' })
  }), env);
  assert.equal(invalidContext.status, 400);
  const noKey = await handleRealityParserRequest(new Request('http://server/api/reality/parse', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ text: '余额4368', currentDate: '2026-08-25' })
  }), { ALLOWED_ORIGIN: origin });
  assert.equal(noKey.status, 503);
});

test('server minimizes and truncates condition context before provider transmission', async () => {
  let payload;
  const conditions = Array.from({ length: 10 }, (_, index) => ({ id: `condition-${index}`, name: `工资${index}`, type: 'recurring_income', amount: 1000 + index, frequency: 'monthly', nextOccurrence: '2026-09-01', secret: 'never-send' }));
  const occurrences = Array.from({ length: 10 }, (_, index) => ({ id: `occurrence-${index}`, conditionId: `condition-${index}`, conditionName: `工资${index}`, expectedDate: '2026-09-01', expectedAmount: 1000 + index, direction: 'income', secret: 'never-send' }));
  const adapter = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture',
    fetchImpl: async (_url, init) => {
      payload = JSON.parse(init.body);
      return new Response(JSON.stringify({ output_text: JSON.stringify(validInterpretation) }), { status: 200 });
    }
  });
  await adapter.parse({ text: '工资到账', currentDate: '2026-08-25', timezone: 42, currentBalance: NaN, activeConditions: conditions, dueOccurrences: occurrences });
  const contextText = payload.input;
  assert.equal(contextText.includes('secret'), false);
  assert.equal(contextText.includes('condition-8'), false);
  assert.match(contextText, /Asia\/Shanghai/);
});
