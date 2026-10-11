const TYPES = new Set(['income_once', 'expense_once', 'income_recurring', 'expense_recurring', 'change_amount', 'pause_condition']);
const FREQUENCIES = new Set(['daily', 'weekly', 'monthly']);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function positiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) <= 0) throw new Error('金额需要大于 0。');
  return Math.round(amount * 100) / 100;
}

export function scenarioConditionOptions(conditions, operationType = '') {
  return (Array.isArray(conditions) ? conditions : [])
    .filter((condition) => condition && condition.status === 'confirmed' && !(operationType === 'pause_condition' && ['balance', 'reserve'].includes(condition.type)))
    .map((condition) => ({ id: String(condition.id), type: String(condition.type || ''), label: String(condition.name || condition.type || '未命名条件'), amount: condition.amount }));
}

export function buildScenarioOperation(draft, conditions) {
  if (!draft || !TYPES.has(draft.type)) throw new Error('请选择一种变化。');
  if (draft.type === 'change_amount' || draft.type === 'pause_condition') {
    const condition = scenarioConditionOptions(conditions).find((item) => item.id === String(draft.conditionId || ''));
    if (!condition) throw new Error('请选择一项已有条件。');
    if (draft.type === 'change_amount') {
      return { type: 'set_condition', conditionId: condition.id, field: 'amount', value: positiveAmount(draft.amount) };
    }
    if (['balance', 'reserve'].includes(condition.type)) throw new Error('现金起点和保留金额不能暂停。');
    if (!validDate(draft.date)) throw new Error('请选择有效日期。');
    return { type: 'set_status', conditionId: condition.id, status: 'paused', effectiveDate: draft.date };
  }

  const name = String(draft.name || '').trim().slice(0, 80);
  if (!name) throw new Error('名称不能为空。');
  const amount = positiveAmount(draft.amount);
  const recurring = draft.type.endsWith('_recurring');
  if (recurring && !FREQUENCIES.has(draft.frequency)) throw new Error('请选择有效的重复频率。');
  if (!validDate(draft.date)) throw new Error('请选择有效日期。');
  const cashflow = draft.type.startsWith('income_') ? 'income' : 'expense';
  return recurring
    ? { type: 'add_recurring', name, cashflow, amount, frequency: draft.frequency, nextOccurrence: draft.date }
    : { type: 'add_one_off', name, cashflow, amount, occurredAt: draft.date };
}
