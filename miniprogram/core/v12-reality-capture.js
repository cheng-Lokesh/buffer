const stateCore = require('./state');
const { normalizeCashReality } = require('./v8-cash-reality');

const PROVENANCE = new Set(['manual_balance', 'quick_occurrence', 'natural_language', 'voice', 'precise_edit']);
const TYPES = new Set(['balance_confirmation', 'one_off_income', 'one_off_expense', 'recurring_income', 'recurring_expense', 'existing_occurrence_confirmation']);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function validAmount(value) { return Number.isFinite(Number(value)) && Number(value) >= 0; }

function validate(candidates, asOf) {
  if (!Array.isArray(candidates) || !candidates.length) return { ok: false, message: '至少需要一项变化' };
  for (const item of candidates) {
    if (!item || !TYPES.has(item.type)) return { ok: false, message: '变化类型无效' };
    if (!item.type.startsWith('existing_occurrence_') && !validAmount(item.amount)) return { ok: false, message: '金额无效' };
    if (['balance_confirmation', 'one_off_income', 'one_off_expense'].includes(item.type) && !validDate(item.occurredAt || asOf)) return { ok: false, message: '日期无效' };
    if (['recurring_income', 'recurring_expense'].includes(item.type) && (!item.name || !validDate(item.startDate))) return { ok: false, message: '固定变化信息不完整' };
    if (item.type === 'existing_occurrence_confirmation' && !item.occurrenceId) return { ok: false, message: '找不到待确认事项' };
  }
  return { ok: true };
}

function parseAmount(text, pattern) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

function parseMiniRealityMessage(value, context = {}) {
  const text = String(value || '').trim().slice(0, 500);
  const asOf = String(context.asOf || new Date().toISOString().slice(0, 10));
  if (!text) return { status: 'error', candidates: [], message: '请先写下发生了什么' };
  if (/(?:如果|假设|要是|万一|假如)/.test(text)) return { status: 'scenario', candidates: [], message: '这是一个模拟变化，没有进入现实' };
  if (/(?:可能|也许|或许|大概)/.test(text)) return { status: 'clarification', candidates: [], message: '这是已确定的未来事项，还是一个假设？' };
  const candidates = [];
  const rent = parseAmount(text, /房租\s*(\d+(?:\.\d+)?)/);
  if (rent !== null) candidates.push({ type: 'one_off_expense', name: '房租', amount: rent, occurredAt: asOf });
  const deposit = parseAmount(text, /押金\s*(?:退了|退回|返还)?\s*(\d+(?:\.\d+)?)/);
  if (deposit !== null && /(?:退|返还)/.test(text)) candidates.push({ type: 'one_off_income', name: '押金返还', amount: deposit, occurredAt: asOf });
  const balance = parseAmount(text, /(?:现在(?:总共)?(?:还有|余额是|只有)?|总共还有|余额(?:是|变成)?)\s*(\d+(?:\.\d+)?)/);
  if (balance !== null) candidates.push({ type: 'balance_confirmation', amount: balance, occurredAt: asOf });
  if (!candidates.length) return { status: 'clarification', candidates: [], message: '还需要确认金额、日期或这是不是持续变化' };
  return { status: 'candidates', candidates };
}

function buildMiniDueOccurrences(state, asOf = new Date().toISOString().slice(0, 10)) {
  const reality = normalizeCashReality(state && state.cashReality);
  const resolved = new Set(reality.occurrenceResolutions.map((item) => item.occurrenceId));
  return reality.conditions.filter((item) => item.status === 'confirmed' && ['recurring_income', 'recurring_expense', 'known_event'].includes(item.type) && item.nextOccurrence && item.nextOccurrence <= asOf).map((item) => {
    const id = `occurrence:${item.id}:${item.nextOccurrence}`;
    return { id, conditionId: item.id, name: item.name || (item.type === 'recurring_income' ? '固定收入' : item.type === 'recurring_expense' ? '固定支出' : '未来事项'), date: item.nextOccurrence, amount: item.amount, direction: item.type === 'recurring_income' || item.eventKind === 'income' ? 'income' : 'expense' };
  }).filter((item) => !resolved.has(item.id));
}

function applyMiniRealityCapture(source, candidates, options = {}) {
  const current = stateCore.normalizeState(source);
  const provenance = String(options.provenance || 'precise_edit');
  const confirmedAt = String(options.confirmedAt || new Date().toISOString());
  const asOf = confirmedAt.slice(0, 10);
  const checked = validate(candidates, asOf);
  if (!checked.ok || !PROVENANCE.has(provenance)) return { ok: false, message: checked.message || '现实来源无效', state: current };
  let working = clone(current);
  const anchor = candidates.find((item) => item.type === 'balance_confirmation');
  for (const [index, candidate] of candidates.entries()) {
    if (candidate.type === 'existing_occurrence_confirmation') {
      const occurrence = buildMiniDueOccurrences(working, asOf).find((item) => item.id === candidate.occurrenceId);
      if (!occurrence) return { ok: false, message: '找不到待确认事项', state: current };
      const resolutionId = `resolution-${Date.now()}-${index}`;
      const eventId = `event-${Date.now()}-${index}`;
      working.cashReality = normalizeCashReality({
        ...working.cashReality,
        occurrenceResolutions: [...working.cashReality.occurrenceResolutions, { id: resolutionId, occurrenceId: occurrence.id, conditionId: occurrence.conditionId, expectedDate: occurrence.date, expectedAmount: occurrence.amount, direction: occurrence.direction, result: 'as_expected', actualDate: occurrence.date, actualAmount: occurrence.amount, eventId, resolvedAt: confirmedAt, source: 'user_confirmed', captureSource: provenance }],
        events: [...working.cashReality.events, { id: eventId, name: occurrence.name, type: occurrence.direction, occurredAt: occurrence.date, amount: occurrence.amount, conditionId: occurrence.conditionId, expectedOccurrenceId: occurrence.id, resolutionId, createdAt: confirmedAt, source: 'user_confirmed', captureSource: provenance }]
      });
      continue;
    }
    if (['recurring_income', 'recurring_expense'].includes(candidate.type)) {
      const added = stateCore.addV8Condition(working, { ...candidate, nextOccurrence: candidate.startDate, captureSource: provenance }, confirmedAt, `condition-${Date.now()}-${index}`);
      if (!added.ok) return { ok: false, message: '固定变化无法保存', state: current };
      working = added.state;
      continue;
    }
    const type = candidate.type === 'balance_confirmation' ? 'balance_confirmation' : candidate.type === 'one_off_income' ? 'income' : 'expense';
    const applied = stateCore.applyV8CashEvent(working, { ...candidate, type, occurredAt: candidate.occurredAt || asOf, captureSource: provenance }, `event-${Date.now()}-${index}`, confirmedAt);
    if (!applied.ok) return { ok: false, message: '变化无法保存', state: current };
    working = applied.state;
  }
  if (anchor) {
    working.cash.balance = Number(anchor.amount);
    working.cashReality = normalizeCashReality({ ...working.cashReality, conditions: working.cashReality.conditions.map((item) => item.type === 'balance' ? { ...item, amount: Number(anchor.amount), confirmedAt, captureSource: provenance } : item) });
  }
  working.confirmedAt = confirmedAt;
  return { ok: true, state: stateCore.normalizeState(working), summary: { balance: working.cash.balance, count: candidates.length, usedBalanceAnchor: Boolean(anchor) } };
}

module.exports = { parseMiniRealityMessage, buildMiniDueOccurrences, applyMiniRealityCapture };
