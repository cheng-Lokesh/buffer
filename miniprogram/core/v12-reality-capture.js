const stateCore = require('./state');
const shared = require('./v12-reality-capture-shared');
const { shanghaiDate } = require('./forecast-lookup');

// Platform facade only: shared code owns parsing, validation and confirmation.
function parseMiniRealityMessage(value, context = {}) {
  try {
    const reality = context.state?.cashReality || context.cashReality || {};
    const captureContext = shared.buildRealityCaptureContext(reality, { asOf: context.asOf || shanghaiDate() });
    const result = shared.parseDeterministicRealityMessage(value, captureContext);
    return { ...result, ...(result.status === 'clarification' ? { message: result.question } : {}) };
  } catch { return { status: 'error', candidates: [], message: '现实上下文无效，请重试' }; }
}

function buildMiniDueOccurrences(state, asOf = shanghaiDate()) {
  const context = shared.buildRealityCaptureContext(state?.cashReality || {}, { asOf });
  return context.dueOccurrences.map(item => ({ id: item.id, conditionId: item.conditionId,
    name: item.conditionName, date: item.expectedDate, amount: item.expectedAmount, direction: item.direction }));
}

function applyMiniRealityCapture(source, candidates, options = {}) {
  const current = stateCore.normalizeState(source);
  try {
    const confirmedAt = options.confirmedAt || new Date().toISOString();
    const result = shared.commitRealityCapture(current.cashReality, candidates, {
      ...options, asOf: options.asOf || shanghaiDate(confirmedAt), confirmedAt,
      provenance: options.provenance || 'precise_edit'
    });
    const cash = { ...current.cash };
    for (const [type, key] of [['balance', 'balance'], ['reserve', 'reserve'], ['daily_floor', 'daily']]) {
      const condition = result.reality.conditions.find(item => item.type === type && item.status === 'confirmed');
      if (condition) cash[key] = condition.amount;
    }
    return { ok: true, state: stateCore.normalizeState({ ...current, cashReality: result.reality, cash, confirmedAt }),
      summary: { balance: cash.balance, count: result.summary.changeCount, usedBalanceAnchor: result.summary.usedBalanceAnchor } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '这次变化没有写入', state: current };
  }
}

module.exports = { parseMiniRealityMessage, buildMiniDueOccurrences, applyMiniRealityCapture };
