import { normalizeCashReality } from './v8-cash-reality.js';

const BASE_NAMES = Object.freeze({
  balance: '现金起点',
  reserve: '保留边界',
  daily_floor: '最低日常支出'
});

const FALLBACK_NAMES = Object.freeze({
  recurring_income: '未命名固定收入',
  recurring_expense: '未命名固定支出',
  known_event: '未命名已知事件'
});

const IDENTITY_TYPES = new Set(Object.keys(FALLBACK_NAMES));

export function normalizeConditionName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

export function conditionDisplayName(condition = {}) {
  if (BASE_NAMES[condition.type]) return BASE_NAMES[condition.type];
  return normalizeConditionName(condition.name) || FALLBACK_NAMES[condition.type] || '未命名现实条件';
}

export function conditionScheduleText(condition = {}) {
  if (condition.status === 'paused') return '已暂停';
  if (condition.status === 'ended') return condition.endDate ? `已结束于 ${condition.endDate}` : '已结束';
  if (condition.type === 'daily_floor') return condition.endDate ? `每天，至 ${condition.endDate}` : '每天';
  if (condition.type === 'known_event') return condition.nextOccurrence || '日期待确认';
  const frequency = { daily: '每天', weekly: '每周', monthly: '每月', once: '一次' }[condition.frequency] || '频率待确认';
  const start = condition.nextOccurrence || condition.startDate;
  const end = condition.endDate ? `，至 ${condition.endDate}` : '';
  return `${frequency}${start ? `，${start} 起` : ''}${end}`;
}

export function updateConditionDetails(source, id, patch = {}, options = {}) {
  const reality = normalizeCashReality(source);
  const index = reality.conditions.findIndex((condition) => condition.id === id);
  if (index < 0) throw new Error(`找不到现实条件：${id}`);
  const current = reality.conditions[index];
  const nextPatch = { ...patch };
  if (Object.hasOwn(nextPatch, 'name')) {
    const name = normalizeConditionName(nextPatch.name);
    if (IDENTITY_TYPES.has(current.type) && !name) throw new Error('名称不能为空。');
    nextPatch.name = name;
  }
  if (Object.hasOwn(nextPatch, 'status') && !['confirmed', 'paused', 'ended'].includes(nextPatch.status)) throw new Error('条件状态无效。');
  const next = {
    ...current,
    ...nextPatch,
    amount: Number(nextPatch.amount ?? current.amount),
    confirmedAt: typeof options.confirmedAt === 'string' ? options.confirmedAt : current.confirmedAt,
    source: 'user_confirmed'
  };
  const conditions = reality.conditions.map((condition, conditionIndex) => conditionIndex === index ? next : condition);
  return normalizeCashReality({ ...reality, conditions });
}
