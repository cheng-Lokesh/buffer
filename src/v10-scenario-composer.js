import { normalizeCashReality } from './v8-cash-reality.js';

const INTENTS = [
  { id: 'add_income', label: '增加收入', note: '一次到账或持续收入' },
  { id: 'add_expense', label: '增加支出', note: '一次支出或持续支出' },
  { id: 'change_condition', label: '改变已有条件', note: '从当前现实复制后修改' },
  { id: 'pause_condition', label: '暂停已有条件', note: '现在或某个日期起暂停' },
  { id: 'change_event', label: '改变某次事件', note: '修改一次事件的金额或日期' }
];

const clone = (value) => value == null ? value : structuredClone(value);
const amountValue = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('请填写大于 0 的金额。');
  return amount;
};

export function humanScenarioIntentOptions() {
  return clone(INTENTS);
}

export function createHumanScenarioDraft(intent, value, asOf) {
  if (!INTENTS.some((item) => item.id === intent)) throw new Error('请选择想改变的内容。');
  const reality = normalizeCashReality(value);
  if (intent === 'add_income' || intent === 'add_expense') {
    return { intent, rhythm: 'once', name: '', amount: '', date: asOf, frequency: 'monthly', endDate: '' };
  }
  if (intent === 'change_event') {
    const event = reality.conditions.find((item) => item.type === 'known_event');
    return { intent, conditionId: event?.id || '', amount: event ? String(event.amount) : '', date: event?.nextOccurrence || asOf };
  }
  const recurring = reality.conditions.filter((item) => ['recurring_income', 'recurring_expense'].includes(item.type));
  const target = recurring[0] || reality.conditions.find((item) => item.type === 'daily_floor');
  if (intent === 'pause_condition') return { intent, conditionId: target?.id || '', effectiveDate: asOf };
  return { intent, conditionId: target?.id || '', field: 'amount', value: target ? String(target.amount) : '' };
}

export function buildHumanScenarioOperations(draft, value) {
  const reality = normalizeCashReality(value);
  if (!draft || !INTENTS.some((item) => item.id === draft.intent)) throw new Error('请选择想改变的内容。');
  if (draft.intent === 'add_income' || draft.intent === 'add_expense') {
    const name = String(draft.name || '').trim();
    if (!name) throw new Error('请为这项变化写一个便于辨认的名称。');
    const cashflow = draft.intent === 'add_income' ? 'income' : 'expense';
    const amount = amountValue(draft.amount);
    if (draft.rhythm === 'recurring') {
      return [{
        type: 'add_recurring', name, cashflow, amount,
        frequency: draft.frequency || 'monthly', nextOccurrence: draft.date,
        ...(draft.endDate ? { endDate: draft.endDate } : {})
      }];
    }
    return [{ type: 'add_one_off', name, cashflow, amount, occurredAt: draft.date }];
  }
  const condition = reality.conditions.find((item) => item.id === draft.conditionId);
  if (!condition) throw new Error('请选择一项现实条件。');
  if (draft.intent === 'pause_condition') {
    return [{ type: 'set_status', conditionId: condition.id, status: 'paused', effectiveDate: draft.effectiveDate }];
  }
  if (draft.intent === 'change_event') {
    if (condition.type !== 'known_event') throw new Error('请选择一次未来事件。');
    const operations = [];
    const amount = amountValue(draft.amount);
    if (amount !== condition.amount) operations.push({ type: 'set_condition', conditionId: condition.id, field: 'amount', value: amount });
    if (draft.date !== condition.nextOccurrence) operations.push({ type: 'set_condition', conditionId: condition.id, field: 'nextOccurrence', value: draft.date });
    if (!operations.length) throw new Error('金额或日期至少需要改变一项。');
    return operations;
  }
  let valueToUse = draft.value;
  if (draft.field === 'amount') valueToUse = amountValue(draft.value);
  return [{ type: 'set_condition', conditionId: condition.id, field: draft.field, value: valueToUse }];
}
