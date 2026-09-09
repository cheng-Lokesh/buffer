const DAY_MS = 86400000;
const MAX_HORIZON_DAYS = 366;
const V8_ENGINE_VERSION = 'v8.0.0';
const CONDITION_TYPES = new Set(['balance', 'reserve', 'daily_floor', 'recurring_income', 'recurring_expense', 'known_event']);
const EVENT_TYPES = new Set(['expense', 'income', 'balance_confirmation', 'condition_change', 'correction']);
const CONDITION_STATUSES = new Set(['confirmed', 'stale', 'missing', 'paused', 'ended']);
const CAPTURE_SOURCES = new Set(['manual_balance', 'quick_occurrence', 'natural_language', 'voice', 'precise_edit']);
const FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'once']);
const PATCH_FIELDS = new Set(['amount', 'frequency', 'startDate', 'endDate', 'nextOccurrence', 'status', 'includedInDailyFloor']);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parts = value.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2] ? date : null;
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

function normalizeCondition(item, index) {
  if (!isRecord(item) || item.source !== 'user_confirmed' || !CONDITION_TYPES.has(item.type)) return null;
  const amountCents = toCents(item.amount);
  if (amountCents === null) return null;
  const status = CONDITION_STATUSES.has(item.status) ? item.status : 'confirmed';
  const frequency = item.frequency == null ? '' : String(item.frequency);
  if (['daily_floor', 'recurring_income', 'recurring_expense'].includes(item.type) && frequency && !FREQUENCIES.has(frequency)) return null;
  const optionalDate = (value) => value && dateValue(value) ? value : '';
  return {
    id: String(item.id || `condition-${index + 1}`),
    ...(typeof item.name === 'string' && item.name.trim() ? { name: item.name.trim().slice(0, 80) } : {}),
    type: item.type,
    amount: amountCents / 100,
    frequency: frequency || (item.type === 'daily_floor' ? 'daily' : ''),
    startDate: optionalDate(item.startDate),
    endDate: optionalDate(item.endDate),
    nextOccurrence: optionalDate(item.nextOccurrence),
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
  if (!isRecord(item) || item.source !== 'user_confirmed' || !['as_expected', 'amount_changed', 'date_changed', 'did_not_occur'].includes(item.result)) return null;
  if (!item.occurrenceId || !item.conditionId || !dateValue(item.expectedDate) || toCents(item.expectedAmount) === null) return null;
  return {
    id: String(item.id || `resolution-${index + 1}`),
    occurrenceId: String(item.occurrenceId),
    conditionId: String(item.conditionId),
    expectedDate: item.expectedDate,
    expectedAmount: Number(item.expectedAmount),
    direction: item.direction === 'income' ? 'income' : 'expense',
    result: item.result,
    actualDate: item.result === 'did_not_occur' ? '' : String(item.actualDate || item.expectedDate),
    actualAmount: item.result === 'did_not_occur' ? null : Number(item.actualAmount == null ? item.expectedAmount : item.actualAmount),
    eventId: item.result === 'did_not_occur' ? '' : String(item.eventId || ''),
    resolvedAt: typeof item.resolvedAt === 'string' ? item.resolvedAt : '',
    source: 'user_confirmed',
    ...(CAPTURE_SOURCES.has(item.captureSource) ? { captureSource: item.captureSource } : {})
  };
}

function normalizeDraft(item, index) {
  if (!isRecord(item) || item.neverApplyToReality !== true || !Array.isArray(item.changes)) return null;
  const changes = item.changes.filter((change) => isRecord(change) && typeof change.conditionId === 'string' && PATCH_FIELDS.has(change.field)).map(clone);
  return {
    id: String(item.id || `scenario-${index + 1}`), baseSnapshotId: String(item.baseSnapshotId || ''), changes,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '', savedAsDraft: true, neverApplyToReality: true
  };
}

function normalizeCashReality(value) {
  const source = isRecord(value) ? value : {};
  return {
    version: 1,
    engineVersion: V8_ENGINE_VERSION,
    conditions: Array.isArray(source.conditions) ? source.conditions.map(normalizeCondition).filter(Boolean) : [],
    events: Array.isArray(source.events) ? source.events.map(normalizeEvent).filter(Boolean) : [],
    scenarioDrafts: Array.isArray(source.scenarioDrafts) ? source.scenarioDrafts.map(normalizeDraft).filter(Boolean) : [],
    occurrenceResolutions: Array.isArray(source.occurrenceResolutions) ? source.occurrenceResolutions.map(normalizeOccurrenceResolution).filter(Boolean) : []
  };
}

function occurrenceDates(condition, start, end) {
  const anchor = dateValue(condition.nextOccurrence || condition.startDate);
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

function buildCashRealityProjection(value, options = {}) {
  const reality = normalizeCashReality(value);
  const asOf = String(options.asOf || '');
  const start = dateValue(asOf);
  const horizonDays = Number(options.horizonDays == null ? 90 : options.horizonDays);
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
      addEntry(date, {
        kind: covered ? 'covered' : condition.type === 'recurring_income' || (condition.type === 'known_event' && condition.eventKind === 'income') ? 'income' : 'recurring_expense',
        amountCents: toCents(condition.amount),
        evidenceId: `condition:${condition.id}${covered ? ':covered_by_daily_floor' : ''}`
      });
    }
  }
  for (const event of reality.events) {
    const date = dateValue(event.occurredAt);
    if (!date || date <= start || date > end || !['income', 'expense'].includes(event.type)) continue;
    addEntry(date, {
      kind: event.type === 'income' ? 'one_off_income' : 'one_off_expense',
      amountCents: toCents(event.amount),
      evidenceId: `event:${event.id}`
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
    const closingBalanceCents = openingBalanceCents + confirmedInflowsCents - recurringOutflowsCents - dailyFloorOutflowsCents + oneOffEventsCents;
    const evidenceIds = [...new Set([
      'condition:balance', 'condition:reserve',
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
    points,
    reserveCents,
    reserveTouch
  };
}

function buildNowSummary(projection) {
  if (!projection || !projection.valid || !projection.points || !projection.points.length) {
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
    supportDays: projection.reserveTouch.days == null ? projection.reserveTouch.safeDaysLowerBound : projection.reserveTouch.days,
    supportIsLowerBound: projection.reserveTouch.status === 'not_reached_within_horizon',
    reserveTouchDate: projection.reserveTouch.date,
    rangeEndBalanceCents: projection.points[projection.points.length - 1].closingBalanceCents,
    engineVersion: projection.engineVersion
  };
}

function explainProjectionPoint(projection, date) {
  if (!projection || !projection.valid || !Array.isArray(projection.points)) return null;
  const point = projection.points.find((item) => item.date === date);
  if (!point) return null;
  const calculated = point.openingBalanceCents + point.confirmedInflowsCents - point.recurringOutflowsCents - point.dailyFloorOutflowsCents + point.oneOffEventsCents;
  return {
    date: point.date, state: point.state, label: point.state === 'actual' ? '今天' : '预计',
    equation: { ...point, calculatedClosingBalanceCents: calculated, matches: calculated === point.closingBalanceCents },
    reserveCents: point.reserveCents, reserveDeltaCents: point.reserveDeltaCents,
    evidenceIds: [...point.evidenceIds], engineVersion: point.engineVersion
  };
}

function createScenarioPatch({ baseSnapshotId, changes, createdAt, id } = {}) {
  if (!Array.isArray(changes) || !changes.length) throw new Error('模拟至少需要一项修改。');
  const normalizedChanges = changes.map((change) => {
    if (!isRecord(change) || !String(change.conditionId || '') || !PATCH_FIELDS.has(change.field)) throw new Error('模拟修改无效。');
    return { conditionId: String(change.conditionId), field: change.field, value: clone(change.value) };
  });
  const timestamp = typeof createdAt === 'string' ? createdAt : new Date().toISOString();
  return { id: String(id || `scenario-${timestamp.replace(/\D/g, '').slice(0, 14)}`), baseSnapshotId: String(baseSnapshotId || ''), changes: normalizedChanges, createdAt: timestamp, savedAsDraft: false, neverApplyToReality: true };
}

function runScenarioPatch(source, patch, options = {}) {
  const normalizedPatch = createScenarioPatch(patch);
  const reality = normalizeCashReality(source);
  const next = clone(reality);
  for (const change of normalizedPatch.changes) {
    const index = next.conditions.findIndex((item) => item.id === change.conditionId);
    if (index < 0) throw new Error(`找不到模拟条件：${change.conditionId}`);
    next.conditions[index] = { ...next.conditions[index], [change.field]: clone(change.value) };
  }
  const baseline = buildCashRealityProjection(reality, options);
  const scenario = buildCashRealityProjection(next, options);
  const baselineDays = baseline.reserveTouch.days == null ? baseline.reserveTouch.safeDaysLowerBound : baseline.reserveTouch.days;
  const scenarioDays = scenario.reserveTouch.days == null ? scenario.reserveTouch.safeDaysLowerBound : scenario.reserveTouch.days;
  return {
    valid: baseline.valid && scenario.valid, baselineLabel: '现实', scenarioLabel: '模拟', patch: normalizedPatch,
    reality: clone(source), baseline, scenario,
    delta: {
      supportDays: Number.isFinite(baselineDays) && Number.isFinite(scenarioDays) ? scenarioDays - baselineDays : null,
      rangeEndBalanceCents: baseline.valid && scenario.valid ? scenario.points[scenario.points.length - 1].closingBalanceCents - baseline.points[baseline.points.length - 1].closingBalanceCents : null
    }
  };
}

module.exports = {
  V8_ENGINE_VERSION,
  normalizeCashReality,
  buildCashRealityProjection,
  buildNowSummary,
  explainProjectionPoint,
  createScenarioPatch,
  runScenarioPatch
};
