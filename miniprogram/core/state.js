const { DEFAULT_SKIN_ID, getSkin } = require('./skins');
const { money } = require('./reality');
const { normalizeCashReality } = require('./v8-cash-reality');

const STATE_VERSION = 3;
const MAX_CHANGES = 5000;

function emptyState() {
  return { version: STATE_VERSION, cash: { balance: '', reserve: '', daily: '' }, confirmedAt: null, changes: [], cashReality: normalizeCashReality(), skinId: DEFAULT_SKIN_ID };
}

function realityFromCash(cash, confirmedAt) {
  const ready = cash.balance !== '' && cash.daily !== '';
  const status = ready ? 'confirmed' : 'missing';
  const asOf = String(confirmedAt || new Date().toISOString()).slice(0, 10);
  const tomorrow = new Date(`${asOf}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return normalizeCashReality({
    version: 1,
    conditions: [
      { id: 'balance', type: 'balance', amount: Number(cash.balance || 0), status, confirmedAt: confirmedAt || '', source: 'user_confirmed' },
      { id: 'reserve', type: 'reserve', amount: Number(cash.reserve || 0), status, confirmedAt: confirmedAt || '', source: 'user_confirmed' },
      { id: 'daily-floor', type: 'daily_floor', amount: Number(cash.daily || 0), frequency: 'daily', startDate: tomorrow.toISOString().slice(0, 10), status, confirmedAt: confirmedAt || '', source: 'user_confirmed' }
    ],
    events: [], scenarioDrafts: []
  });
}

function normalizeCash(value = {}) {
  const balance = money(value.balance);
  const reserve = money(value.reserve);
  const daily = money(value.daily);
  return {
    balance: balance === null ? '' : balance,
    reserve: reserve === null ? 0 : reserve,
    daily: daily === null ? '' : daily
  };
}

function normalizeChange(item, index = 0) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const occurredAt = String(item.occurredAt || item.createdAt || (item.date ? `${item.date}T12:00:00.000Z` : ''));
  if (!/^\d{4}-\d{2}-\d{2}T/.test(occurredAt)) return null;
  const after = item.after ? normalizeCash(item.after) : null;
  if (after && (after.balance === '' || after.daily === '')) return null;
  if (after) {
    return {
      id: String(item.id || `change-${index + 1}`), occurredAt,
      before: item.before ? normalizeCash(item.before) : null,
      after, note: String(item.note || '').trim().slice(0, 120)
    };
  }
  const rawDelta = Number(item.cashDelta);
  if (!Number.isFinite(rawDelta)) return null;
  return {
    id: String(item.id || `legacy-${index + 1}`), occurredAt,
    before: null, after: null, legacyDelta: Math.round(rawDelta * 100) / 100,
    note: String(item.note || '历史现金变化').trim().slice(0, 120)
  };
}

function normalizeState(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const changesSource = Array.isArray(source.changes) ? source.changes : Array.isArray(source.records) ? source.records : [];
  const changes = changesSource.map(normalizeChange).filter(Boolean).slice(0, MAX_CHANGES);
  const cash = normalizeCash(source.cash);
  const confirmedAt = typeof source.confirmedAt === 'string'
    ? source.confirmedAt
    : changes.find((item) => item.after)?.occurredAt || null;
  const cashReality = source.cashReality && Array.isArray(source.cashReality.conditions)
    ? normalizeCashReality(source.cashReality)
    : realityFromCash(cash, confirmedAt);
  return { version: STATE_VERSION, cash, confirmedAt, changes, cashReality, skinId: getSkin(source.skinId).id };
}

function validateDraft(draft = {}) {
  const cash = normalizeCash(draft);
  const errors = {};
  if (cash.balance === '') errors.balance = '请填写不小于 0 的当前余额';
  if (draft.reserve === '' || draft.reserve === null || draft.reserve === undefined || money(draft.reserve) === null) errors.reserve = '请确认不小于 0 的保留金，没有保留金请填写 0';
  if (cash.daily === '' || cash.daily <= 0) errors.daily = '最低日支出必须大于 0';
  return { ok: Object.keys(errors).length === 0, cash, errors };
}

function applyCashChange(state, draft, occurredAt = new Date().toISOString(), id = `change-${Date.now()}`) {
  const current = normalizeState(state);
  const validation = validateDraft(draft);
  if (!validation.ok) return { ok: false, errors: validation.errors, state: current };
  const note = String(draft.note || '').trim().slice(0, 120);
  const change = { id: String(id), occurredAt, before: current.cash, after: validation.cash, note };
  const baseReality = realityFromCash(validation.cash, occurredAt);
  const nonBaseConditions = current.cashReality.conditions.filter((item) => !['balance', 'reserve', 'daily_floor'].includes(item.type));
  const cashReality = normalizeCashReality({
    ...baseReality,
    conditions: [...baseReality.conditions, ...nonBaseConditions],
    events: current.cashReality.events,
    scenarioDrafts: current.cashReality.scenarioDrafts
  });
  return {
    ok: true,
    state: { ...current, cash: validation.cash, cashReality, confirmedAt: occurredAt, changes: [change, ...current.changes].slice(0, MAX_CHANGES) }
  };
}

function syncCashFromReality(reality, existing) {
  const amount = (type, fallback) => {
    const condition = reality.conditions.find((item) => item.type === type && item.status === 'confirmed');
    return condition ? condition.amount : fallback;
  };
  return normalizeCash({ balance: amount('balance', existing.balance), reserve: amount('reserve', existing.reserve), daily: amount('daily_floor', existing.daily) });
}

function applyV8CashEvent(state, input, id = `event-${Date.now()}`, createdAt = new Date().toISOString()) {
  const current = normalizeState(state);
  const type = String(input && input.type || '');
  const occurredAt = String(input && input.occurredAt || '');
  const amount = Number(input && input.amount);
  if (!['expense', 'income', 'balance_confirmation'].includes(type)) return { ok: false, errors: { type: '请选择变化类型' }, state: current };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) return { ok: false, errors: { occurredAt: '请选择日期' }, state: current };
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, errors: { amount: '请填写不小于 0 的金额' }, state: current };
  const event = { id: String(id), type, occurredAt, amount: Math.round(amount * 100) / 100, conditionId: '', correctionOf: '', createdAt, source: 'user_confirmed', captureSource: input.captureSource };
  let cashReality = normalizeCashReality({ ...current.cashReality, events: [...current.cashReality.events, event] });
  if (occurredAt <= createdAt.slice(0, 10)) {
    const currentBalance = Number(current.cash.balance || 0);
    const nextBalance = type === 'balance_confirmation' ? amount : currentBalance + (type === 'income' ? amount : -amount);
    cashReality = normalizeCashReality({
      ...cashReality,
      conditions: cashReality.conditions.map((item) => item.type === 'balance' ? { ...item, amount: Math.max(0, nextBalance), status: 'confirmed', confirmedAt: createdAt, captureSource: input.captureSource } : item)
    });
  }
  return { ok: true, state: { ...current, cashReality, cash: syncCashFromReality(cashReality, current.cash), confirmedAt: createdAt } };
}

function updateV8Condition(state, id, patch, confirmedAt = new Date().toISOString()) {
  const current = normalizeState(state);
  const cashReality = normalizeCashReality({
    ...current.cashReality,
    conditions: current.cashReality.conditions.map((item) => item.id === id ? { ...item, ...patch, amount: Number(patch.amount == null ? item.amount : patch.amount), status: 'confirmed', confirmedAt, source: 'user_confirmed' } : item)
  });
  return { ok: true, state: { ...current, cashReality, cash: syncCashFromReality(cashReality, current.cash), confirmedAt } };
}

function addV8Condition(state, input, confirmedAt = new Date().toISOString(), id = `condition-${Date.now()}`) {
  const current = normalizeState(state);
  const type = String(input && input.type || '');
  const amount = Number(input && input.amount);
  if (!['recurring_income', 'recurring_expense', 'known_event'].includes(type)) return { ok: false, errors: { type: '请选择条件类型' }, state: current };
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, errors: { amount: '请填写不小于 0 的金额' }, state: current };
  const nextOccurrence = String(input && (input.nextOccurrence || input.startDate) || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextOccurrence)) return { ok: false, errors: { nextOccurrence: '请选择日期' }, state: current };
  const condition = {
    id: String(id), type, amount: Math.round(amount * 100) / 100,
    frequency: type === 'known_event' ? 'once' : ['daily', 'weekly', 'monthly'].includes(input.frequency) ? input.frequency : 'monthly',
    startDate: nextOccurrence, nextOccurrence, endDate: '', status: 'confirmed', confirmedAt,
    source: 'user_confirmed', captureSource: input.captureSource, includedInDailyFloor: input.includedInDailyFloor === true,
    eventKind: type === 'known_event' && input.eventKind === 'income' ? 'income' : type === 'known_event' ? 'expense' : ''
  };
  const cashReality = normalizeCashReality({ ...current.cashReality, conditions: [...current.cashReality.conditions, condition] });
  return { ok: true, state: { ...current, cashReality, confirmedAt } };
}

function saveScenarioDraft(state, patch) {
  const current = normalizeState(state);
  const draft = { ...patch, savedAsDraft: true, neverApplyToReality: true };
  const cashReality = normalizeCashReality({ ...current.cashReality, scenarioDrafts: [...current.cashReality.scenarioDrafts, draft] });
  return { ok: true, state: { ...current, cashReality } };
}

function selectSkin(state, skinId) {
  return { ...normalizeState(state), skinId: getSkin(skinId).id };
}

module.exports = { STATE_VERSION, MAX_CHANGES, emptyState, normalizeCash, normalizeChange, normalizeState, validateDraft, applyCashChange, applyV8CashEvent, updateV8Condition, addV8Condition, saveScenarioDraft, selectSkin };
