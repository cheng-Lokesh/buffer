const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TEMPORAL_TYPES = new Set(['recurring_income', 'recurring_expense', 'known_event']);

function isDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function occurrenceId(condition) {
  return condition?.nextOccurrence && isDate(condition.nextOccurrence)
    ? `occurrence:${condition.id}:${condition.nextOccurrence}`
    : '';
}

export function describeConditionLifecycle(condition, options = {}) {
  const asOf = String(options.asOf || '');
  if (!condition || typeof condition !== 'object' || !isDate(asOf)) throw new Error('条件或当前日期无效。');
  if (condition.status === 'missing' || condition.status === 'stale') {
    return { state: 'missing', label: '需要确认', historical: false, detail: '尚未形成本人确认的现实条件' };
  }
  if (condition.status === 'ended' || (isDate(condition.endDate) && condition.endDate < asOf)) {
    return { state: 'ended', label: '已结束', historical: true, detail: condition.endDate ? `结束于 ${condition.endDate}` : '本人已确认结束' };
  }
  if (condition.type === 'known_event' && options.resolvedOccurrenceIds?.has(occurrenceId(condition))) {
    return { state: 'resolved', label: '已核对', historical: true, detail: `${condition.nextOccurrence} 的预计事项已经核对` };
  }
  if (condition.status === 'paused') {
    return { state: 'paused', label: '已暂停', historical: false, detail: '当前不进入未来计算，历史仍保留' };
  }
  if (condition.type === 'known_event' && isDate(condition.nextOccurrence) && condition.nextOccurrence <= asOf) {
    return { state: 'due', label: '待核对', historical: false, detail: `${condition.nextOccurrence} 日期已到，尚未确认实际结果` };
  }
  return {
    state: 'active',
    label: '生效中',
    historical: false,
    detail: TEMPORAL_TYPES.has(condition.type) ? '继续进入未来计算' : '当前基础事实'
  };
}

export function buildConditionMaintenanceView(reality = {}, options = {}) {
  const resolvedOccurrenceIds = new Set((Array.isArray(reality.occurrenceResolutions) ? reality.occurrenceResolutions : [])
    .map((item) => String(item?.occurrenceId || ''))
    .filter(Boolean));
  const decorated = (Array.isArray(reality.conditions) ? reality.conditions : []).map((condition) => ({
    ...condition,
    lifecycle: describeConditionLifecycle(condition, { ...options, resolvedOccurrenceIds })
  }));
  const current = decorated.filter((item) => !item.lifecycle.historical);
  const historical = decorated.filter((item) => item.lifecycle.historical);
  return {
    current,
    historical,
    counts: {
      current: current.length,
      historical: historical.length,
      active: current.filter((item) => item.lifecycle.state === 'active').length,
      paused: current.filter((item) => item.lifecycle.state === 'paused').length,
      due: current.filter((item) => item.lifecycle.state === 'due').length
    }
  };
}

export function lifecyclePatch(condition, action, options = {}) {
  const asOf = String(options.asOf || '');
  if (!condition || typeof condition !== 'object' || !isDate(asOf)) throw new Error('条件或当前日期无效。');
  if (action === 'pause') return { status: 'paused' };
  if (action === 'resume') return { status: 'confirmed', endDate: '' };
  if (action === 'end') return { status: 'ended', endDate: asOf };
  throw new Error('维护动作无效。');
}
