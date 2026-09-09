const GROUPS = [
  { id: 'base', label: '现金基础', types: ['balance', 'reserve', 'daily_floor'] },
  { id: 'income', label: '固定收入', types: ['recurring_income'] },
  { id: 'expense', label: '固定支出', types: ['recurring_expense'] },
  { id: 'one-off', label: '未来一次事项', types: ['known_event'] }
];

const FREQUENCY_LABELS = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  once: '一次'
};

function conditionWhen(condition) {
  if (condition.type === 'known_event') return condition.nextOccurrence || '日期待确认';
  if (['recurring_income', 'recurring_expense'].includes(condition.type)) return FREQUENCY_LABELS[condition.frequency] || '频率待确认';
  if (condition.type === 'daily_floor') return '每天';
  return '当前事实';
}

export function buildConditionReadingGroups(conditions = []) {
  return GROUPS.map((group) => ({
    ...group,
    items: conditions
      .filter((condition) => group.types.includes(condition.type))
      .map((condition) => ({ ...condition, when: conditionWhen(condition) }))
  }));
}

function eventLabel(event) {
  if (event.name) return event.name;
  if (event.type === 'income') return '收入到账';
  if (event.type === 'expense') return '支出发生';
  if (event.type === 'balance_confirmation') return '余额确认';
  if (event.type === 'condition_change') return '现金条件更新';
  return '现金记录';
}

export function buildHumanRecordTimeline(events = [], legacyRecords = []) {
  const current = events.map((event) => ({
    id: event.id,
    date: event.occurredAt || event.date || '',
    createdAt: event.createdAt || '',
    label: eventLabel(event),
    amount: Number(event.amount || 0),
    direction: event.type === 'expense' ? 'out' : event.type === 'income' ? 'in' : 'neutral',
    note: event.note || (event.type === 'balance_confirmation' ? '本人确认的余额' : '本人确认的现金变化')
  }));
  const legacy = legacyRecords.map((record) => ({
    id: record.id,
    date: record.date || '',
    createdAt: record.createdAt || '',
    label: record.note || record.mood || '过去记录',
    amount: Number(record.cashDelta || 0),
    direction: Number(record.cashDelta || 0) < 0 ? 'out' : Number(record.cashDelta || 0) > 0 ? 'in' : 'neutral',
    note: '过去保留的本人记录'
  }));
  return [...current, ...legacy].sort((left, right) => `${right.date}${right.createdAt}`.localeCompare(`${left.date}${left.createdAt}`));
}

export function buildV11ChartLabels({ currentBalanceCents, reserveCents, scenarioActive }) {
  const labels = [
    { id: 'baseline', label: '当前预计', valueCents: currentBalanceCents },
    { id: 'reserve', label: '保留边界', valueCents: reserveCents }
  ];
  if (scenarioActive) labels.push({ id: 'scenario', label: '本次模拟', valueCents: null });
  return labels;
}
