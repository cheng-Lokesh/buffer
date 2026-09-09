const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function labelIndexes(count, limit) {
  const visibleCount = Math.max(1, Math.min(count, Number.isInteger(limit) ? limit : 12));
  if (visibleCount === 1) return new Set([0]);
  return new Set(Array.from({ length: visibleCount }, (_, index) => Math.round((index * (count - 1)) / (visibleCount - 1))));
}

export function buildDenseEventTrack(events = [], options = {}) {
  const safeEvents = (Array.isArray(events) ? events : [])
    .filter((event) => event && DATE_PATTERN.test(String(event.date || '')) && Number.isFinite(Number(event.position)))
    .map((event) => structuredClone(event))
    .sort((left, right) => left.date.localeCompare(right.date) || String(left.id || '').localeCompare(String(right.id || '')));
  const byDate = new Map();
  for (const event of safeEvents) {
    if (!byDate.has(event.date)) byDate.set(event.date, []);
    byDate.get(event.date).push(event);
  }
  const grouped = [...byDate.entries()].map(([date, items]) => ({
    id: items.length > 1 ? `cluster:${date}` : items[0].id,
    kind: items.length > 1 ? 'cluster' : 'single',
    date,
    count: items.length,
    items,
    position: items[0].position,
    pointIndex: items[0].pointIndex,
    edge: items[0].edge || 'middle',
    label: items.length > 1 ? `同日 ${items.length} 项` : items[0].label,
    status: items.length > 1 ? 'clustered' : items[0].status,
    contextType: items.length > 1 ? 'cluster' : items[0].contextType,
    contextId: items.length > 1 ? date : items[0].contextId
  }));
  const visible = labelIndexes(grouped.length, Number(options.maxLabels ?? 12));
  const groups = grouped.map((group, index) => ({ ...group, labelVisible: visible.has(index) }));
  return {
    totalItems: safeEvents.length,
    totalDates: groups.length,
    clusteredDates: groups.filter((group) => group.kind === 'cluster').length,
    groups
  };
}

export function filterConditionMaintenance(items = [], filters = {}) {
  const query = String(filters.query || '').trim().toLocaleLowerCase('zh-CN');
  const type = String(filters.type || 'all');
  const lifecycle = String(filters.lifecycle || 'all');
  return (Array.isArray(items) ? items : []).filter((item) => {
    const searchable = `${item?.name || ''} ${item?.id || ''} ${item?.type || ''}`.toLocaleLowerCase('zh-CN');
    return (!query || searchable.includes(query))
      && (type === 'all' || item?.type === type)
      && (lifecycle === 'all' || item?.lifecycle?.state === lifecycle);
  });
}

export function groupRealityRecordsByMonth(records = []) {
  const sorted = (Array.isArray(records) ? records : [])
    .filter((item) => item && DATE_PATTERN.test(String(item.occurredAt || '')))
    .map((item) => structuredClone(item))
    .sort((left, right) => `${right.occurredAt}${right.createdAt || ''}`.localeCompare(`${left.occurredAt}${left.createdAt || ''}`));
  const byMonth = new Map();
  for (const item of sorted) {
    const month = item.occurredAt.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(item);
  }
  return [...byMonth.entries()].map(([month, items], index) => ({
    month,
    label: `${Number(month.slice(5, 7))} 月`,
    count: items.length,
    items,
    expanded: index === 0
  }));
}
