const DAY_MS = 86_400_000;
const MAX_HORIZON_DAYS = 366;
const CONDITION_TYPES = new Set(['balance', 'reserve', 'daily_floor', 'recurring_income', 'recurring_expense', 'known_event']);
const EVENT_TYPES = new Set(['expense', 'income', 'balance_confirmation', 'condition_change', 'correction']);
const CONDITION_STATUSES = new Set(['confirmed', 'stale', 'missing', 'paused', 'ended']);
const FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'once']);
const PATCH_FIELDS = new Set(['amount', 'frequency', 'startDate', 'endDate', 'nextOccurrence', 'status', 'includedInDailyFloor']);
const SCENARIO_OPERATION_TYPES = new Set(['set_condition', 'set_status', 'add_recurring', 'add_one_off']);
const RECONCILIATION_RESULTS = new Set(['as_expected', 'amount_changed', 'date_changed', 'did_not_occur']);
const TEMPORAL_CONDITION_TYPES = new Set(['recurring_income', 'recurring_expense', 'known_event']);
const MAX_OCCURRENCE_LOOKBACK_DAYS = 3660;
const MAX_REALITY_SNAPSHOTS = 120;
const MAX_FORECAST_SNAPSHOTS = 24;
const CAPTURE_SOURCES = new Set(['manual_balance', 'quick_occurrence', 'natural_language', 'voice', 'precise_edit']);

export const V8_ENGINE_VERSION = 'v8.0.0';

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function dateText(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function addMonthsAnchored(firstDate, months) {
  const targetMonth = firstDate.getUTCMonth() + months;
  const year = firstDate.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(firstDate.getUTCDate(), lastDay)));
}

function toCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  const cents = Math.round(number * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizeCondition(item, index) {
  if (!isRecord(item) || item.source !== 'user_confirmed' || !CONDITION_TYPES.has(item.type)) return null;
  const amountCents = toCents(item.amount);
  if (amountCents === null) return null;
  const status = CONDITION_STATUSES.has(item.status) ? item.status : 'confirmed';
  const frequency = item.frequency == null ? '' : String(item.frequency);
  if (['daily_floor', 'recurring_income', 'recurring_expense'].includes(item.type) && frequency && !FREQUENCIES.has(frequency)) return null;
  const normalizeOptionalDate = (value) => value && dateValue(value) ? value : '';
  return {
    id: String(item.id || `condition-${index + 1}`),
    ...(typeof item.name === 'string' && item.name.trim() ? { name: item.name.trim().slice(0, 80) } : {}),
    type: item.type,
    amount: amountCents / 100,
    frequency: frequency || (item.type === 'daily_floor' ? 'daily' : ''),
    startDate: normalizeOptionalDate(item.startDate),
    endDate: normalizeOptionalDate(item.endDate),
    nextOccurrence: normalizeOptionalDate(item.nextOccurrence),
    status,
    confirmedAt: typeof item.confirmedAt === 'string' ? item.confirmedAt : '',
    source: 'user_confirmed',
    ...(CAPTURE_SOURCES.has(item.captureSource) ? { captureSource: item.captureSource } : {}),
    includedInDailyFloor: item.includedInDailyFloor === true,
    eventKind: item.type === 'known_event' && item.eventKind === 'income' ? 'income' : item.type === 'known_event' ? 'expense' : ''
  };
}

function normalizeEvent(item, index) {
  if (!isRecord(item) || item.source !== 'user_confirmed' || !EVENT_TYPES.has(item.type) || !dateValue(item.occurredAt)) return null;
  const amountCents = toCents(item.amount);
  if (amountCents === null) return null;
  return {
    id: String(item.id || `event-${index + 1}`),
    ...(typeof item.name === 'string' && item.name.trim() ? { name: item.name.trim().slice(0, 80) } : {}),
    type: item.type,
    occurredAt: item.occurredAt,
    amount: amountCents / 100,
    conditionId: String(item.conditionId || ''),
    ...(item.expectedOccurrenceId ? { expectedOccurrenceId: String(item.expectedOccurrenceId) } : {}),
    ...(item.resolutionId ? { resolutionId: String(item.resolutionId) } : {}),
    correctionOf: String(item.correctionOf || ''),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    source: 'user_confirmed',
    ...(CAPTURE_SOURCES.has(item.captureSource) ? { captureSource: item.captureSource } : {})
  };
}

function normalizeOccurrenceResolution(item, index) {
  if (!isRecord(item) || item.source !== 'user_confirmed' || !RECONCILIATION_RESULTS.has(item.result)) return null;
  const expectedDate = dateValue(item.expectedDate) ? item.expectedDate : '';
  const expectedAmountCents = toCents(item.expectedAmount);
  const occurrenceId = String(item.occurrenceId || '');
  const conditionId = String(item.conditionId || '');
  if (!occurrenceId || !conditionId || !expectedDate || expectedAmountCents === null) return null;
  const actualDate = dateValue(item.actualDate) ? item.actualDate : '';
  const actualAmountCents = toCents(item.actualAmount);
  if (item.result !== 'did_not_occur' && (!actualDate || actualAmountCents === null)) return null;
  return {
    id: String(item.id || `resolution-${index + 1}`),
    occurrenceId,
    conditionId,
    expectedDate,
    expectedAmount: expectedAmountCents / 100,
    direction: item.direction === 'income' ? 'income' : 'expense',
    result: item.result,
    actualDate: item.result === 'did_not_occur' ? '' : actualDate,
    actualAmount: item.result === 'did_not_occur' ? null : actualAmountCents / 100,
    eventId: item.result === 'did_not_occur' ? '' : String(item.eventId || ''),
    resolvedAt: typeof item.resolvedAt === 'string' ? item.resolvedAt : '',
    source: 'user_confirmed',
    ...(CAPTURE_SOURCES.has(item.captureSource) ? { captureSource: item.captureSource } : {})
  };
}

function safeCents(value, { allowNegative = false } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (!allowNegative && number < 0)) return null;
  return number;
}

function normalizeRealitySnapshot(item, index) {
  if (!isRecord(item) || item.source !== 'user_confirmed' || !dateValue(item.asOf)) return null;
  const balanceCents = safeCents(item.balanceCents);
  const reserveCents = safeCents(item.reserveCents);
  const dailyFloorCents = safeCents(item.dailyFloorCents);
  const balanceDate = dateValue(item.balanceDate) ? item.balanceDate : '';
  if (balanceCents === null || reserveCents === null || dailyFloorCents === null) return null;
  return {
    id: String(item.id || `reality-snapshot-${index + 1}`),
    asOf: item.asOf,
    capturedAt: typeof item.capturedAt === 'string' ? item.capturedAt : '',
    reason: String(item.reason || 'reality_confirmed').slice(0, 40),
    balanceCents,
    balanceConfirmedAt: typeof item.balanceConfirmedAt === 'string' ? item.balanceConfirmedAt : '',
    balanceDate,
    reserveCents,
    dailyFloorCents,
    conditionCount: Math.max(0, Number.parseInt(item.conditionCount || 0, 10) || 0),
    eventCount: Math.max(0, Number.parseInt(item.eventCount || 0, 10) || 0),
    resolutionCount: Math.max(0, Number.parseInt(item.resolutionCount || 0, 10) || 0),
    fingerprint: String(item.fingerprint || '').slice(0, 200),
    source: 'user_confirmed'
  };
}

function normalizeForecastSnapshot(item, index) {
  if (!isRecord(item) || item.source !== 'derived_forecast' || !dateValue(item.asOf)) return null;
  const horizonDays = Number(item.horizonDays);
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > MAX_HORIZON_DAYS) return null;
  if (!Array.isArray(item.dailyBalancesCents) || item.dailyBalancesCents.length !== horizonDays + 1) return null;
  const dailyBalancesCents = item.dailyBalancesCents.map((value) => safeCents(value, { allowNegative: true }));
  if (dailyBalancesCents.some((value) => value === null)) return null;
  const reserveTouch = isRecord(item.reserveTouch) ? {
    status: String(item.reserveTouch.status || ''),
    date: dateValue(item.reserveTouch.date) ? item.reserveTouch.date : null,
    days: Number.isInteger(item.reserveTouch.days) ? item.reserveTouch.days : null,
    safeDaysLowerBound: Number.isInteger(item.reserveTouch.safeDaysLowerBound) ? item.reserveTouch.safeDaysLowerBound : null
  } : { status: 'unknown', date: null, days: null, safeDaysLowerBound: null };
  return {
    id: String(item.id || `forecast-snapshot-${index + 1}`),
    realitySnapshotId: String(item.realitySnapshotId || ''),
    asOf: item.asOf,
    capturedAt: typeof item.capturedAt === 'string' ? item.capturedAt : '',
    horizonDays,
    dailyBalancesCents,
    reserveTouch,
    dueOccurrenceCount: Math.max(0, Number.parseInt(item.dueOccurrenceCount || 0, 10) || 0),
    engineVersion: String(item.engineVersion || V8_ENGINE_VERSION),
    fingerprint: String(item.fingerprint || '').slice(0, 200),
    source: 'derived_forecast'
  };
}

function normalizeScenarioOperation(operation) {
  if (!isRecord(operation) || !SCENARIO_OPERATION_TYPES.has(operation.type)) throw new Error('模拟操作无效。');
  if (operation.type === 'set_condition') {
    const conditionId = String(operation.conditionId || '');
    if (!conditionId || !PATCH_FIELDS.has(operation.field) || operation.field === 'status') throw new Error('模拟修改字段无效。');
    if (operation.field === 'amount' && toCents(operation.value) === null) throw new Error('模拟金额无效。');
    if (['startDate', 'endDate', 'nextOccurrence'].includes(operation.field) && operation.value && !dateValue(operation.value)) throw new Error('模拟日期无效。');
    if (operation.field === 'frequency' && !FREQUENCIES.has(operation.value)) throw new Error('模拟频率无效。');
    if (operation.field === 'includedInDailyFloor' && typeof operation.value !== 'boolean') throw new Error('模拟包含状态无效。');
    return { type: 'set_condition', conditionId, field: operation.field, value: clone(operation.value) };
  }
  if (operation.type === 'set_status') {
    const conditionId = String(operation.conditionId || '');
    if (!conditionId || !['confirmed', 'paused'].includes(operation.status)) throw new Error('模拟状态无效。');
    if (operation.effectiveDate && !dateValue(operation.effectiveDate)) throw new Error('模拟日期无效。');
    return { type: 'set_status', conditionId, status: operation.status, ...(operation.effectiveDate ? { effectiveDate: operation.effectiveDate } : {}) };
  }
  const name = String(operation.name || '').trim().slice(0, 80);
  if (!name) throw new Error('模拟名称不能为空。');
  if (!['income', 'expense'].includes(operation.cashflow)) throw new Error('模拟收支方向无效。');
  const amountCents = toCents(operation.amount);
  if (amountCents === null || amountCents === 0) throw new Error('模拟金额无效。');
  if (operation.type === 'add_recurring') {
    if (!['daily', 'weekly', 'monthly'].includes(operation.frequency)) throw new Error('模拟频率无效。');
    if (!dateValue(operation.nextOccurrence)) throw new Error('模拟日期无效。');
    if (operation.endDate && !dateValue(operation.endDate)) throw new Error('模拟日期无效。');
    return {
      type: 'add_recurring', name, cashflow: operation.cashflow, amount: amountCents / 100,
      frequency: operation.frequency, nextOccurrence: operation.nextOccurrence,
      ...(operation.endDate ? { endDate: operation.endDate } : {})
    };
  }
  if (!dateValue(operation.occurredAt)) throw new Error('模拟日期无效。');
  return { type: 'add_one_off', name, cashflow: operation.cashflow, amount: amountCents / 100, occurredAt: operation.occurredAt };
}

function legacyChanges(item) {
  if (!Array.isArray(item.changes)) return [];
  return item.changes
    .filter((change) => isRecord(change) && typeof change.conditionId === 'string' && PATCH_FIELDS.has(change.field))
    .map((change) => ({ conditionId: change.conditionId, field: change.field, value: clone(change.value) }));
}

function normalizeDraft(item, index) {
  if (!isRecord(item) || item.neverApplyToReality !== true) return null;
  const changes = legacyChanges(item);
  const candidates = Array.isArray(item.operations) ? item.operations : changes.map((change) => ({ type: 'set_condition', ...change }));
  const operations = candidates.flatMap((operation) => {
    try { return [normalizeScenarioOperation(operation)]; } catch { return []; }
  });
  if (!operations.length) return null;
  return {
    id: String(item.id || `scenario-${index + 1}`),
    ...(typeof item.name === 'string' && item.name.trim() ? { name: item.name.trim().slice(0, 40) } : {}),
    version: 2,
    baseSnapshotId: String(item.baseSnapshotId || ''),
    changes,
    operations,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    savedAsDraft: true,
    neverApplyToReality: true
  };
}

export function normalizeCashReality(value = {}) {
  const source = isRecord(value) ? value : {};
  return {
    version: 1,
    engineVersion: V8_ENGINE_VERSION,
    conditions: Array.isArray(source.conditions) ? source.conditions.map(normalizeCondition).filter(Boolean) : [],
    events: Array.isArray(source.events) ? source.events.map(normalizeEvent).filter(Boolean) : [],
    scenarioDrafts: Array.isArray(source.scenarioDrafts) ? source.scenarioDrafts.map(normalizeDraft).filter(Boolean) : [],
    occurrenceResolutions: Array.isArray(source.occurrenceResolutions)
      ? source.occurrenceResolutions.map(normalizeOccurrenceResolution).filter(Boolean)
      : [],
    realitySnapshots: Array.isArray(source.realitySnapshots)
      ? source.realitySnapshots.map(normalizeRealitySnapshot).filter(Boolean).slice(-MAX_REALITY_SNAPSHOTS)
      : [],
    forecastSnapshots: Array.isArray(source.forecastSnapshots)
      ? source.forecastSnapshots.map(normalizeForecastSnapshot).filter(Boolean).slice(-MAX_FORECAST_SNAPSHOTS)
      : []
  };
}

function occurrenceDates(condition, start, end) {
  const anchorText = condition.nextOccurrence || condition.startDate;
  const anchor = dateValue(anchorText);
  if (!anchor) return [];
  const conditionEnd = dateValue(condition.endDate);
  const effectiveEnd = conditionEnd && conditionEnd < end ? conditionEnd : end;
  if (anchor > effectiveEnd) return [];
  if (condition.frequency === 'once') return anchor >= start ? [anchor] : [];
  if (condition.frequency === 'monthly') {
    const dates = [];
    for (let offset = 0; ; offset += 1) {
      const date = addMonthsAnchored(anchor, offset);
      if (date > effectiveEnd) break;
      if (date >= start) dates.push(date);
    }
    return dates;
  }
  const interval = condition.frequency === 'weekly' ? 7 : 1;
  let date = anchor;
  while (date < start) date = addDays(date, interval);
  const dates = [];
  while (date <= effectiveEnd) {
    dates.push(date);
    date = addDays(date, interval);
  }
  return dates;
}

function expectedOccurrenceId(conditionId, date) {
  return `occurrence:${conditionId}:${dateText(date)}`;
}

function occurrenceDirection(condition) {
  return condition.type === 'recurring_income' || (condition.type === 'known_event' && condition.eventKind === 'income')
    ? 'income'
    : 'expense';
}

function temporalConditionName(condition) {
  if (condition.name) return condition.name;
  if (condition.type === 'recurring_income') return '未命名固定收入';
  if (condition.type === 'recurring_expense') return '未命名固定支出';
  return '未命名已知事件';
}

export function buildExpectedOccurrences(value, options = {}) {
  const reality = normalizeCashReality(value);
  const asOfText = String(options.asOf || '');
  const asOf = dateValue(asOfText);
  const horizonDays = Number(options.horizonDays ?? 90);
  const lookbackDays = Number(options.lookbackDays ?? 366);
  if (!asOf || !Number.isInteger(horizonDays) || horizonDays < 0 || horizonDays > MAX_HORIZON_DAYS) return [];
  if (!Number.isInteger(lookbackDays) || lookbackDays < 0 || lookbackDays > MAX_OCCURRENCE_LOOKBACK_DAYS) return [];
  const start = addDays(asOf, -lookbackDays);
  const end = addDays(asOf, horizonDays);
  const resolutions = new Map(reality.occurrenceResolutions.map((item) => [item.occurrenceId, item]));
  const occurrences = [];
  for (const condition of reality.conditions) {
    if (condition.status !== 'confirmed' || !TEMPORAL_CONDITION_TYPES.has(condition.type)) continue;
    const recurrence = condition.type === 'known_event' ? { ...condition, frequency: 'once' } : condition;
    for (const date of occurrenceDates(recurrence, start, end)) {
      const id = expectedOccurrenceId(condition.id, date);
      const resolution = resolutions.get(id) || null;
      occurrences.push({
        id,
        conditionId: condition.id,
        conditionName: temporalConditionName(condition),
        conditionType: condition.type,
        expectedDate: dateText(date),
        expectedAmount: condition.amount,
        amountCents: toCents(condition.amount),
        direction: occurrenceDirection(condition),
        includedInDailyFloor: condition.includedInDailyFloor === true,
        status: resolution ? 'resolved' : date <= asOf ? 'due' : 'upcoming',
        resolution: resolution ? clone(resolution) : null,
        source: 'forecast_from_condition'
      });
    }
  }
  return occurrences.sort((left, right) => left.expectedDate.localeCompare(right.expectedDate) || left.id.localeCompare(right.id));
}

export function reconcileExpectedOccurrence(value, occurrenceId, input = {}, options = {}) {
  const reality = normalizeCashReality(value);
  const asOf = String(options.asOf || '');
  if (!dateValue(asOf)) throw new Error('核对日期无效。');
  if (!isRecord(input) || !RECONCILIATION_RESULTS.has(input.result)) throw new Error('核对结果无效。');
  if (reality.occurrenceResolutions.some((item) => item.occurrenceId === occurrenceId)) throw new Error('这次预计事项已经核对。');
  const occurrences = buildExpectedOccurrences(reality, {
    asOf,
    lookbackDays: Number(options.lookbackDays ?? MAX_OCCURRENCE_LOOKBACK_DAYS),
    horizonDays: Number(options.horizonDays ?? MAX_HORIZON_DAYS)
  });
  const occurrence = occurrences.find((item) => item.id === String(occurrenceId || ''));
  if (!occurrence) throw new Error('找不到这次预计事项。');
  if (occurrence.status === 'upcoming') throw new Error('这次预计事项尚未到期。');

  let actualDate = occurrence.expectedDate;
  let actualAmount = occurrence.expectedAmount;
  if (input.result === 'amount_changed') {
    const actualAmountCents = toCents(input.actualAmount);
    if (actualAmountCents === null) throw new Error('实际金额无效。');
    actualAmount = actualAmountCents / 100;
  }
  if (input.result === 'date_changed') {
    if (!dateValue(input.actualDate) || input.actualDate > asOf) throw new Error('实际日期无效。');
    actualDate = input.actualDate;
    if (input.actualAmount != null && input.actualAmount !== '') {
      const actualAmountCents = toCents(input.actualAmount);
      if (actualAmountCents === null) throw new Error('实际金额无效。');
      actualAmount = actualAmountCents / 100;
    }
  }

  const resolutionId = String(options.id || `resolution-${Date.now()}`);
  const eventId = input.result === 'did_not_occur' ? '' : String(options.eventId || `event-${Date.now()}`);
  const resolution = normalizeOccurrenceResolution({
    id: resolutionId,
    occurrenceId: occurrence.id,
    conditionId: occurrence.conditionId,
    expectedDate: occurrence.expectedDate,
    expectedAmount: occurrence.expectedAmount,
    direction: occurrence.direction,
    result: input.result,
    actualDate: input.result === 'did_not_occur' ? '' : actualDate,
    actualAmount: input.result === 'did_not_occur' ? null : actualAmount,
    eventId,
    resolvedAt: String(options.resolvedAt || new Date().toISOString()),
    captureSource: options.captureSource,
    source: 'user_confirmed'
  }, reality.occurrenceResolutions.length);
  if (!resolution) throw new Error('核对结果无法保存。');

  const event = input.result === 'did_not_occur' ? null : normalizeEvent({
    id: eventId,
    name: occurrence.conditionName,
    type: occurrence.direction,
    occurredAt: actualDate,
    amount: actualAmount,
    conditionId: occurrence.conditionId,
    expectedOccurrenceId: occurrence.id,
    resolutionId,
    createdAt: resolution.resolvedAt,
    captureSource: options.captureSource,
    source: 'user_confirmed'
  }, reality.events.length);
  const nextReality = normalizeCashReality({
    ...reality,
    occurrenceResolutions: [...reality.occurrenceResolutions, resolution],
    events: event ? [...reality.events, event] : reality.events
  });
  return { reality: nextReality, resolution: clone(resolution), event: event ? clone(event) : null, occurrence: clone(occurrence) };
}

function invalidProjection(issues, asOf, horizonDays) {
  return {
    valid: false,
    status: 'unknown',
    engineVersion: V8_ENGINE_VERSION,
    asOf,
    horizonDays,
    issues,
    points: [],
    reserveTouch: { status: 'unknown', date: null, days: null, safeDaysLowerBound: null }
  };
}

export function buildCashRealityProjection(value, options = {}) {
  const reality = normalizeCashReality(value);
  const asOf = String(options.asOf || '');
  const start = dateValue(asOf);
  const horizonDays = Number(options.horizonDays ?? 90);
  if (!start || !Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > MAX_HORIZON_DAYS) {
    return invalidProjection([{ code: 'invalid_projection_range', status: 'missing' }], asOf, horizonDays);
  }

  const requiredTypes = ['balance', 'reserve', 'daily_floor'];
  const required = Object.fromEntries(requiredTypes.map((type) => [type, reality.conditions.find((item) => item.type === type && item.status !== 'paused')]));
  const issues = requiredTypes.flatMap((type) => {
    const condition = required[type];
    if (!condition) return [{ code: 'missing_condition', conditionId: type, status: 'missing' }];
    if (condition.status !== 'confirmed') return [{ code: 'untrusted_condition', conditionId: condition.id, status: condition.status }];
    return [];
  });
  if (issues.length) return invalidProjection(issues, asOf, horizonDays);

  const balanceCents = toCents(required.balance.amount);
  const reserveCents = toCents(required.reserve.amount);
  const end = addDays(start, horizonDays);
  const expectedOccurrences = buildExpectedOccurrences(reality, { asOf, horizonDays, lookbackDays: Number(options.lookbackDays ?? 366) });
  const resolutionByOccurrenceId = new Map(reality.occurrenceResolutions.map((item) => [item.occurrenceId, item]));
  const byDate = new Map();
  const addEntry = (date, entry) => {
    const key = dateText(date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(entry);
  };

  for (const condition of reality.conditions) {
    if (condition.status !== 'confirmed' || !['recurring_income', 'recurring_expense', 'known_event'].includes(condition.type)) continue;
    const covered = condition.type === 'recurring_expense' && condition.includedInDailyFloor;
    for (const date of occurrenceDates(condition, start, end)) {
      if (resolutionByOccurrenceId.has(expectedOccurrenceId(condition.id, date))) continue;
      addEntry(date, {
        kind: covered ? 'covered' : condition.type === 'recurring_income' || (condition.type === 'known_event' && condition.eventKind === 'income') ? 'income' : 'recurring_expense',
        amountCents: toCents(condition.amount),
        evidenceId: `condition:${condition.id}${covered ? ':covered_by_daily_floor' : ''}`,
        sourceId: condition.id,
        sourceType: condition.type,
        label: condition.name || (condition.type === 'recurring_income' ? '未命名固定收入' : condition.type === 'recurring_expense' ? '未命名固定支出' : '未命名已知事件')
      });
    }
  }
  for (const event of reality.events) {
    const date = dateValue(event.occurredAt);
    if (!date || date <= start || date > end || !['income', 'expense'].includes(event.type)) continue;
    addEntry(date, {
      kind: event.type === 'income' ? 'one_off_income' : 'one_off_expense',
      amountCents: toCents(event.amount),
      evidenceId: `event:${event.id}`,
      sourceId: event.id,
      sourceType: event.type,
      label: event.name || (event.type === 'income' ? '已确认收入' : '已确认支出')
    });
  }

  const dailyStart = dateValue(required.daily_floor.startDate) || addDays(start, 1);
  const dailyEnd = dateValue(required.daily_floor.endDate);
  const dailyCents = toCents(required.daily_floor.amount);
  let currentBalance = balanceCents;
  let reserveTouch = currentBalance <= reserveCents
    ? { status: 'reached', date: asOf, days: 0, safeDaysLowerBound: null }
    : null;
  const points = [];
  for (let day = 0; day <= horizonDays; day += 1) {
    const date = addDays(start, day);
    const key = dateText(date);
    const entries = byDate.get(key) || [];
    const openingBalanceCents = currentBalance;
    const confirmedInflowsCents = entries.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amountCents, 0);
    const recurringOutflowsCents = entries.filter((item) => item.kind === 'recurring_expense').reduce((sum, item) => sum + item.amountCents, 0);
    const dailyActive = date >= dailyStart && (!dailyEnd || date <= dailyEnd);
    const dailyFloorOutflowsCents = dailyActive ? dailyCents : 0;
    const oneOffEventsCents = entries.reduce((sum, item) => {
      if (item.kind === 'one_off_income') return sum + item.amountCents;
      if (item.kind === 'one_off_expense') return sum - item.amountCents;
      return sum;
    }, 0);
    const drivers = [
      ...(dailyActive && dailyCents > 0 ? [{
        sourceId: required.daily_floor.id,
        sourceType: 'daily_floor',
        label: required.daily_floor.name || '最低日常支出',
        direction: 'outflow',
        amountCents: dailyCents,
        evidenceId: `condition:${required.daily_floor.id}`
      }] : []),
      ...entries.filter((item) => item.kind !== 'covered' && item.amountCents > 0).map((item) => ({
        sourceId: item.sourceId,
        sourceType: item.sourceType,
        label: item.label,
        direction: ['income', 'one_off_income'].includes(item.kind) ? 'inflow' : 'outflow',
        amountCents: item.amountCents,
        evidenceId: item.evidenceId
      }))
    ];
    const closingBalanceCents = openingBalanceCents + confirmedInflowsCents - recurringOutflowsCents - dailyFloorOutflowsCents + oneOffEventsCents;
    const evidenceIds = [...new Set([
      'condition:balance',
      'condition:reserve',
      ...(dailyActive ? [`condition:${required.daily_floor.id}`] : []),
      ...entries.map((item) => item.evidenceId)
    ])];
    points.push({
      date: key,
      state: day === 0 ? 'actual' : 'forecast',
      openingBalanceCents,
      confirmedInflowsCents,
      recurringOutflowsCents,
      dailyFloorOutflowsCents,
      oneOffEventsCents,
      closingBalanceCents,
      reserveCents,
      reserveDeltaCents: closingBalanceCents - reserveCents,
      drivers,
      evidenceIds,
      engineVersion: V8_ENGINE_VERSION
    });
    currentBalance = closingBalanceCents;
    if (!reserveTouch && closingBalanceCents <= reserveCents) {
      reserveTouch = { status: 'reached', date: key, days: day, safeDaysLowerBound: null };
    }
  }
  if (!reserveTouch) reserveTouch = { status: 'not_reached_within_horizon', date: null, days: null, safeDaysLowerBound: horizonDays };

  return {
    valid: true,
    status: 'forecast',
    engineVersion: V8_ENGINE_VERSION,
    asOf,
    horizonDays,
    issues: [],
    conditions: reality.conditions,
    events: reality.events,
    expectedOccurrences,
    dueOccurrences: expectedOccurrences.filter((item) => item.status === 'due'),
    lastConfirmedReality: {
      balanceCents,
      confirmedAt: required.balance.confirmedAt || '',
      conditionId: required.balance.id
    },
    points,
    reserveCents,
    reserveTouch
  };
}

export function explainProjectionPoint(projection, date) {
  if (!projection?.valid || !Array.isArray(projection.points)) return null;
  const point = projection.points.find((item) => item.date === date);
  if (!point) return null;
  const calculated = point.openingBalanceCents + point.confirmedInflowsCents - point.recurringOutflowsCents - point.dailyFloorOutflowsCents + point.oneOffEventsCents;
  return {
    date: point.date,
    state: point.state,
    label: point.state === 'actual' ? '今天' : '预计',
    equation: {
      openingBalanceCents: point.openingBalanceCents,
      confirmedInflowsCents: point.confirmedInflowsCents,
      recurringOutflowsCents: point.recurringOutflowsCents,
      dailyFloorOutflowsCents: point.dailyFloorOutflowsCents,
      oneOffEventsCents: point.oneOffEventsCents,
      closingBalanceCents: point.closingBalanceCents,
      calculatedClosingBalanceCents: calculated,
      matches: calculated === point.closingBalanceCents
    },
    reserveCents: point.reserveCents,
    reserveDeltaCents: point.reserveDeltaCents,
    drivers: Array.isArray(point.drivers) ? point.drivers.map(clone) : [],
    evidenceIds: [...point.evidenceIds],
    engineVersion: point.engineVersion
  };
}

export function buildNowSummary(projection) {
  if (!projection?.valid || !projection.points?.length) {
    return { status: 'unknown', balanceCents: null, usableCashCents: null, reserveCents: null, minimumDailySpendCents: null, supportDays: null, reserveTouchDate: null };
  }
  const first = projection.points[0];
  const daily = projection.conditions.find((item) => item.type === 'daily_floor' && item.status === 'confirmed');
  return {
    status: 'forecast',
    balanceCents: first.openingBalanceCents,
    usableCashCents: Math.max(0, first.openingBalanceCents - projection.reserveCents),
    reserveCents: projection.reserveCents,
    minimumDailySpendCents: daily ? toCents(daily.amount) : null,
    supportDays: projection.reserveTouch.days ?? projection.reserveTouch.safeDaysLowerBound,
    supportIsLowerBound: projection.reserveTouch.status === 'not_reached_within_horizon',
    reserveTouchDate: projection.reserveTouch.date,
    rangeEndBalanceCents: projection.points.at(-1).closingBalanceCents,
    engineVersion: projection.engineVersion
  };
}

function temporalFingerprint(reality) {
  const payload = JSON.stringify({
    conditions: reality.conditions.map((item) => ({
      id: item.id, name: item.name || '', type: item.type, amount: item.amount, frequency: item.frequency,
      startDate: item.startDate, endDate: item.endDate, nextOccurrence: item.nextOccurrence,
      status: item.status, confirmedAt: item.confirmedAt, includedInDailyFloor: item.includedInDailyFloor,
      eventKind: item.eventKind
    })),
    events: reality.events.map((item) => ({ id: item.id, type: item.type, occurredAt: item.occurredAt, amount: item.amount })),
    resolutions: reality.occurrenceResolutions.map((item) => ({ id: item.id, occurrenceId: item.occurrenceId, result: item.result, actualDate: item.actualDate, actualAmount: item.actualAmount }))
  });
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function captureTemporalMemory(value, options = {}) {
  const reality = normalizeCashReality(value);
  const asOf = String(options.asOf || '');
  if (!dateValue(asOf)) throw new Error('快照日期无效。');
  const fingerprint = temporalFingerprint(reality);
  const latestRealitySnapshot = reality.realitySnapshots.at(-1) || null;
  if (latestRealitySnapshot?.fingerprint === fingerprint) {
    return {
      created: false,
      reality,
      realitySnapshot: clone(latestRealitySnapshot),
      forecastSnapshot: clone(reality.forecastSnapshots.find((item) => item.realitySnapshotId === latestRealitySnapshot.id) || null)
    };
  }
  const balance = reality.conditions.find((item) => item.type === 'balance' && item.status === 'confirmed');
  const reserve = reality.conditions.find((item) => item.type === 'reserve' && item.status === 'confirmed');
  const dailyFloor = reality.conditions.find((item) => item.type === 'daily_floor' && item.status === 'confirmed');
  if (!balance || !reserve || !dailyFloor) {
    return { created: false, reality, realitySnapshot: null, forecastSnapshot: null };
  }
  const capturedAt = String(options.capturedAt || new Date().toISOString());
  const balanceDateText = typeof balance.confirmedAt === 'string' ? balance.confirmedAt.slice(0, 10) : '';
  const realitySnapshot = normalizeRealitySnapshot({
    id: String(options.realitySnapshotId || `reality-${Date.now()}`),
    asOf,
    capturedAt,
    reason: String(options.reason || 'reality_confirmed'),
    balanceCents: toCents(balance.amount),
    balanceConfirmedAt: balance.confirmedAt || '',
    balanceDate: dateValue(balanceDateText) ? balanceDateText : '',
    reserveCents: toCents(reserve.amount),
    dailyFloorCents: toCents(dailyFloor.amount),
    conditionCount: reality.conditions.filter((item) => item.status === 'confirmed').length,
    eventCount: reality.events.length,
    resolutionCount: reality.occurrenceResolutions.length,
    fingerprint,
    source: 'user_confirmed'
  }, reality.realitySnapshots.length);
  if (!realitySnapshot) throw new Error('现实快照无法保存。');

  const horizonDays = Number(options.horizonDays ?? 90);
  const projection = buildCashRealityProjection(reality, { asOf, horizonDays });
  const forecastSnapshot = projection.valid ? normalizeForecastSnapshot({
    id: String(options.forecastSnapshotId || `forecast-${Date.now()}`),
    realitySnapshotId: realitySnapshot.id,
    asOf,
    capturedAt,
    horizonDays,
    dailyBalancesCents: projection.points.map((point) => point.closingBalanceCents),
    reserveTouch: projection.reserveTouch,
    dueOccurrenceCount: projection.dueOccurrences.length,
    engineVersion: projection.engineVersion,
    fingerprint,
    source: 'derived_forecast'
  }, reality.forecastSnapshots.length) : null;
  const nextReality = normalizeCashReality({
    ...reality,
    realitySnapshots: [...reality.realitySnapshots, realitySnapshot],
    forecastSnapshots: forecastSnapshot ? [...reality.forecastSnapshots, forecastSnapshot] : reality.forecastSnapshots
  });
  return { created: true, reality: nextReality, realitySnapshot: clone(realitySnapshot), forecastSnapshot: clone(forecastSnapshot) };
}

export function compareForecastSnapshotToReality(value, forecastSnapshotId, realitySnapshotId) {
  const reality = normalizeCashReality(value);
  const forecast = reality.forecastSnapshots.find((item) => item.id === String(forecastSnapshotId || ''));
  const actual = reality.realitySnapshots.find((item) => item.id === String(realitySnapshotId || ''));
  if (!forecast || !actual || actual.balanceDate !== actual.asOf || actual.asOf <= forecast.asOf) return null;
  const forecastDate = dateValue(forecast.asOf);
  const actualDate = dateValue(actual.asOf);
  const offset = Math.round((actualDate.getTime() - forecastDate.getTime()) / DAY_MS);
  if (offset < 0 || offset > forecast.horizonDays) return null;
  const forecastBalanceCents = forecast.dailyBalancesCents[offset];
  if (!Number.isSafeInteger(forecastBalanceCents)) return null;
  return {
    forecastSnapshotId: forecast.id,
    realitySnapshotId: actual.id,
    forecastCreatedAt: forecast.capturedAt,
    forecastDate: actual.asOf,
    forecastBalanceCents,
    actualBalanceCents: actual.balanceCents,
    deltaCents: actual.balanceCents - forecastBalanceCents,
    tone: 'neutral'
  };
}

export function buildTemporalMemorySummary(value) {
  const reality = normalizeCashReality(value);
  const comparisons = [];
  for (const forecast of reality.forecastSnapshots) {
    const candidates = reality.realitySnapshots.filter((snapshot) => snapshot.asOf > forecast.asOf && snapshot.balanceDate === snapshot.asOf);
    for (const actual of candidates) {
      const comparison = compareForecastSnapshotToReality(reality, forecast.id, actual.id);
      if (comparison) comparisons.push(comparison);
    }
  }
  return {
    realitySnapshotCount: reality.realitySnapshots.length,
    forecastSnapshotCount: reality.forecastSnapshots.length,
    latestRealitySnapshot: clone(reality.realitySnapshots.at(-1) || null),
    latestForecastSnapshot: clone(reality.forecastSnapshots.at(-1) || null),
    comparisons: comparisons.slice(-24)
  };
}

export function createScenarioPatch({ baseSnapshotId, changes, operations, createdAt, id, name } = {}) {
  const legacy = legacyChanges({ changes });
  if (Array.isArray(changes) && changes.length !== legacy.length) throw new Error('模拟修改无效。');
  const candidates = Array.isArray(operations) ? operations : legacy.map((change) => ({ type: 'set_condition', ...change }));
  if (!candidates.length) throw new Error('模拟至少需要一项修改。');
  const normalizedOperations = candidates.map(normalizeScenarioOperation);
  const timestamp = typeof createdAt === 'string' ? createdAt : new Date().toISOString();
  const scenarioName = String(name || '').trim().slice(0, 40);
  return {
    id: String(id || `scenario-${timestamp.replace(/\D/g, '').slice(0, 14)}`),
    ...(scenarioName ? { name: scenarioName } : {}),
    version: 2,
    baseSnapshotId: String(baseSnapshotId || ''),
    changes: legacy,
    operations: normalizedOperations,
    createdAt: timestamp,
    savedAsDraft: false,
    neverApplyToReality: true
  };
}

function patchedReality(source, patch) {
  const reality = normalizeCashReality(source);
  const next = clone(reality);
  for (const [operationIndex, operation] of patch.operations.entries()) {
    if (operation.type === 'set_condition' || operation.type === 'set_status') {
      const index = next.conditions.findIndex((item) => item.id === operation.conditionId);
      if (index < 0) throw new Error(`找不到模拟条件：${operation.conditionId}`);
      if (operation.type === 'set_status' && operation.status === 'paused' && operation.effectiveDate) {
        next.conditions[index] = { ...next.conditions[index], endDate: dateText(addDays(dateValue(operation.effectiveDate), -1)) };
      } else {
        next.conditions[index] = operation.type === 'set_status'
          ? { ...next.conditions[index], status: operation.status }
          : { ...next.conditions[index], [operation.field]: clone(operation.value) };
      }
      continue;
    }
    const id = `scenario-${patch.id}-${operationIndex + 1}`;
    if (operation.type === 'add_recurring') {
      next.conditions.push({
        id,
        name: operation.name,
        type: operation.cashflow === 'income' ? 'recurring_income' : 'recurring_expense',
        amount: operation.amount,
        frequency: operation.frequency,
        nextOccurrence: operation.nextOccurrence,
        endDate: operation.endDate || '',
        status: 'confirmed',
        source: 'user_confirmed'
      });
      continue;
    }
    next.conditions.push({
      id,
      name: operation.name,
      type: 'known_event',
      eventKind: operation.cashflow,
      amount: operation.amount,
      frequency: 'once',
      nextOccurrence: operation.occurredAt,
      status: 'confirmed',
      source: 'user_confirmed'
    });
  }
  return normalizeCashReality(next);
}

export function describeScenarioOperation(operation, reality = {}) {
  const condition = Array.isArray(reality.conditions) ? reality.conditions.find((item) => item.id === operation.conditionId) : null;
  const conditionName = condition?.name || ({ balance: '现金起点', reserve: '保留边界', daily_floor: '最低日常支出' })[condition?.type] || '未命名条件';
  const amount = (value) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(value);
  const cadence = { daily: '每天', weekly: '每周', monthly: '每月', once: '一次' };
  const fieldLabels = { frequency: '频率', startDate: '开始日期', endDate: '结束日期', nextOccurrence: '日期', includedInDailyFloor: '日常支出包含状态' };
  if (operation.type === 'set_condition') return `${conditionName} · ${operation.field === 'amount' ? `金额改为 ${amount(operation.value)}` : `${fieldLabels[operation.field] || '条件'}改为 ${operation.field === 'frequency' ? cadence[operation.value] : operation.value}`}`;
  if (operation.type === 'set_status') return `${conditionName} · ${operation.effectiveDate ? `从 ${operation.effectiveDate} 起` : ''}${operation.status === 'paused' ? '暂停' : '恢复'}`;
  const sign = operation.cashflow === 'income' ? '+' : '-';
  if (operation.type === 'add_recurring') return `${operation.name} · ${sign}${amount(operation.amount)} / ${cadence[operation.frequency]} · ${operation.nextOccurrence} 起${operation.endDate ? `，至 ${operation.endDate}` : ''}`;
  return `${operation.name} · ${sign}${amount(operation.amount)} · ${operation.occurredAt}`;
}

export function runScenarioPatch(source, patch, options = {}) {
  const normalizedPatch = createScenarioPatch(patch);
  const reality = normalizeCashReality(source);
  const baseline = buildCashRealityProjection(reality, options);
  const scenario = buildCashRealityProjection(patchedReality(reality, normalizedPatch), options);
  const baselineDays = baseline.reserveTouch.days ?? baseline.reserveTouch.safeDaysLowerBound;
  const scenarioDays = scenario.reserveTouch.days ?? scenario.reserveTouch.safeDaysLowerBound;
  return {
    valid: baseline.valid && scenario.valid,
    baselineLabel: '现实',
    scenarioLabel: '模拟',
    patch: normalizedPatch,
    operationSummaries: normalizedPatch.operations.map((operation) => describeScenarioOperation(operation, reality)),
    reality: clone(source),
    baseline,
    scenario,
    delta: {
      supportDays: Number.isFinite(baselineDays) && Number.isFinite(scenarioDays) ? scenarioDays - baselineDays : null,
      rangeEndBalanceCents: baseline.valid && scenario.valid
        ? scenario.points.at(-1).closingBalanceCents - baseline.points.at(-1).closingBalanceCents
        : null
    }
  };
}

export function saveScenarioDraft(source, patch) {
  const reality = normalizeCashReality(source);
  const normalized = createScenarioPatch(patch);
  const draft = { ...normalized, savedAsDraft: true, neverApplyToReality: true };
  return normalizeCashReality({
    ...reality,
    scenarioDrafts: [...reality.scenarioDrafts.filter((item) => item.id !== draft.id), draft]
  });
}

export function deleteScenarioDraft(source, draftId) {
  const reality = normalizeCashReality(source);
  return normalizeCashReality({ ...reality, scenarioDrafts: reality.scenarioDrafts.filter((item) => item.id !== String(draftId || '')) });
}

export function appendCashEvent(source, input, options = {}) {
  if (!isRecord(input) || !EVENT_TYPES.has(input.type)) throw new Error('变化类型无效。');
  if (!dateValue(input.occurredAt)) throw new Error('日期不能为空或格式无效。');
  if (toCents(input.amount) === null) throw new Error('金额不能为空或格式无效。');
  const reality = normalizeCashReality(source);
  const event = normalizeEvent({
    ...input,
    id: String(options.id || `event-${Date.now()}`),
    createdAt: String(options.createdAt || new Date().toISOString()),
    source: 'user_confirmed'
  }, reality.events.length);
  return { ...reality, events: [...reality.events, event] };
}
