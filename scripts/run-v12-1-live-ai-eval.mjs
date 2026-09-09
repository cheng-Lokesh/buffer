import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createDeepSeekRealityParserAdapter } from '../server/v12-1-deepseek.js';
import { resolveRealityParserInterpretation } from '../src/v12-1-reality-parser.js';
import { V12_1_LIVE_EVAL_CASES, V12_1_LIVE_EVAL_CONTEXT } from '../test/fixtures/v12-1-live-eval-cases.js';
import { evaluateLiveParserCase } from './v12-1-live-evaluator.mjs';

const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for live evaluation.');

const adapter = createDeepSeekRealityParserAdapter({ apiKey });
async function runCase(testCase) {
  const started = performance.now();
  try {
    const interpretation = await adapter.parse({ text: testCase.text, ...V12_1_LIVE_EVAL_CONTEXT });
    const resolved = resolveRealityParserInterpretation(interpretation, V12_1_LIVE_EVAL_CONTEXT, testCase.text);
    return evaluateLiveParserCase(testCase, interpretation, resolved, performance.now() - started, V12_1_LIVE_EVAL_CONTEXT);
  } catch (error) {
    return {
      id: testCase.id, category: testCase.category, status: 'provider_error', verdict: 'WRONG_PARSE',
      latencyMs: Math.round(performance.now() - started), itemCount: 0, scenarioCount: 0, candidateCount: 0,
      flags: { providerError: true }, unsafe: false, error: error instanceof Error ? error.message : 'unknown'
    };
  }
}

async function runPool(items, concurrency = 5) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await runCase(items[index]);
      process.stdout.write(`${items[index].id}:${results[index].verdict} ${results[index].latencyMs}ms\n`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

const startedAt = new Date().toISOString();
const concurrency = Math.max(1, Math.min(5, Number(process.env.V12_1_LIVE_CONCURRENCY) || 1));
const selectedIds = new Set(String(process.env.V12_1_LIVE_IDS || '').split(',').map((value) => value.trim()).filter(Boolean));
const selectedCases = selectedIds.size ? V12_1_LIVE_EVAL_CASES.filter((item) => selectedIds.has(item.id)) : V12_1_LIVE_EVAL_CASES;
if (!selectedCases.length) throw new Error('V12_1_LIVE_IDS did not match any evaluation case.');
const results = await runPool(selectedCases, concurrency);
const counts = (field, value) => results.filter((item) => item[field] === value).length;
const flagCount = (flag) => results.filter((item) => item.flags?.[flag]).length;
const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
const report = {
  provider: 'deepseek', model: 'deepseek-v4-flash', startedAt, completedAt: new Date().toISOString(),
  metrics: {
    TOTAL: results.length,
    CORRECT: counts('verdict', 'CORRECT'),
    CORRECT_WITH_CLARIFICATION: counts('verdict', 'CORRECT_WITH_CLARIFICATION'),
    WRONG_PARSE: counts('verdict', 'WRONG_PARSE'),
    UNSUPPORTED: counts('verdict', 'UNSUPPORTED'),
    UNSAFE_PARSE: results.filter((item) => item.unsafe).length,
    Wrong_Amount: flagCount('wrongAmount'),
    Invented_Amount: flagCount('inventedAmount'),
    Model_Amount_Miss: flagCount('modelAmountMiss'),
    Wrong_Date: flagCount('wrongDate'),
    Wrong_Direction: flagCount('wrongDirection'),
    Wrong_Condition_Match: flagCount('wrongConditionMatch'),
    Wrong_Occurrence_Match: flagCount('wrongOccurrenceMatch'),
    Occurrence_Resolution_Miss: flagCount('occurrenceResolutionMiss'),
    Condition_Resolution_Miss: flagCount('conditionResolutionMiss'),
    Scenario_to_Reality: flagCount('scenarioToReality'),
    Negation_to_Positive: flagCount('negationToPositive'),
    Negation_Semantic_Error: flagCount('negationSemanticError'),
    Extra_Reality_Candidate: flagCount('extraRealityCandidate'),
    Hallucinated_Fact: flagCount('hallucinatedFact'),
    Provider_Direct_Write: flagCount('providerDirectWrite'),
    Balance_Duplicate: flagCount('balanceDuplicate'),
    latency_p50_ms: latencies[Math.floor(latencies.length * 0.5)] || 0,
    latency_p95_ms: latencies[Math.floor(latencies.length * 0.95)] || 0
  },
  results
};

const output = path.resolve('docs/v12-1/live-ai-evaluation.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report.metrics));
if (report.metrics.UNSAFE_PARSE > 0) process.exitCode = 2;
