import { normalizeCashReality } from './v8-cash-reality.js';

const clone = (value) => value == null ? value : structuredClone(value);

export function buildFutureContextCatalog(value, projection, scenarioResult = null) {
  const reality = normalizeCashReality(value);
  const points = projection?.valid && Array.isArray(projection.points) ? projection.points : [];
  const firstDate = points[0]?.date || '';
  const lastDate = points.at(-1)?.date || '';
  const dates = points.map((point) => ({
    type: 'date',
    id: point.date,
    contextId: `date:${point.date}`,
    domain: point.state === 'actual' ? 'REALITY' : 'FORECAST',
    date: point.date,
    label: point.state === 'actual' ? '今天' : '预计日期',
    data: clone(point)
  }));
  const occurrences = (projection?.expectedOccurrences || []).map((occurrence) => ({
    type: 'occurrence',
    id: occurrence.id,
    contextId: `occurrence:${occurrence.id}`,
    domain: occurrence.status === 'resolved' ? 'REALITY' : 'FORECAST',
    date: occurrence.expectedDate,
    label: occurrence.conditionName,
    data: clone(occurrence)
  }));
  const conditions = reality.conditions.map((condition) => ({
    type: 'condition',
    id: condition.id,
    contextId: `condition:${condition.id}`,
    domain: 'REALITY',
    date: condition.nextOccurrence || condition.startDate || '',
    label: condition.name || condition.type,
    data: clone(condition)
  }));
  const events = reality.events
    .filter((event) => firstDate && lastDate && event.occurredAt >= firstDate && event.occurredAt <= lastDate)
    .map((event) => ({
      type: 'event',
      id: event.id,
      contextId: `event:${event.id}`,
      domain: 'REALITY',
      date: event.occurredAt,
      label: event.name || (event.type === 'income' ? '已确认收入' : '已确认支出'),
      data: clone(event)
    }));
  const scenarios = scenarioResult?.valid ? [{
    type: 'scenario',
    id: scenarioResult.patch.id,
    contextId: `scenario:${scenarioResult.patch.id}`,
    domain: 'SCENARIO',
    date: projection?.asOf || '',
    label: '本次模拟差异',
    data: {
      operationSummaries: clone(scenarioResult.operationSummaries || []),
      delta: clone(scenarioResult.delta || {}),
      baseline: clone(scenarioResult.baseline?.reserveTouch || null),
      scenario: clone(scenarioResult.scenario?.reserveTouch || null)
    }
  }] : [];
  return { dates, occurrences, conditions, events, scenarios };
}

export function resolveFutureContext(catalog, selection, fallbackDate = '') {
  const groups = {
    date: catalog?.dates || [],
    occurrence: catalog?.occurrences || [],
    condition: catalog?.conditions || [],
    event: catalog?.events || [],
    scenario: catalog?.scenarios || []
  };
  if (selection?.type && groups[selection.type]) {
    const selected = groups[selection.type].find((item) => item.id === selection.id);
    if (selected) return clone(selected);
  }
  const fallback = groups.date.find((item) => item.id === fallbackDate) || groups.date[0] || null;
  return clone(fallback);
}
