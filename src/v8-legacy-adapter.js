import { normalizeCashReality } from './v8-cash-reality.js';

function localDateAfter(value, days = 1) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function money(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function baseCondition(id, type, amount, status, confirmedAt) {
  return {
    id,
    type,
    amount: money(amount),
    status,
    confirmedAt: confirmedAt || '',
    source: 'user_confirmed'
  };
}

export function adaptLegacyCashToV8Reality(value = {}, options = {}) {
  const legacy = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const cash = legacy.cash && typeof legacy.cash === 'object' ? legacy.cash : {};
  const cashflow = legacy.cashflow && typeof legacy.cashflow === 'object' ? legacy.cashflow : {};
  const mode = cashflow.mode === 'full' ? 'full' : 'quick';
  const section = cashflow[mode] && typeof cashflow[mode] === 'object' ? cashflow[mode] : {};
  const asOf = String(options.asOf || section.asOf || new Date().toISOString().slice(0, 10));
  const confirmedAt = String(options.confirmedAt || legacy.cashflowConfirmation?.confirmedAt || '');
  const evidenceValues = [section.balance, section.reserve, section.daily, cash.balance, cash.reserve, cash.daily];
  const hasEvidence = options.confirmed === true || evidenceValues.some((item) => item !== '' && Number.isFinite(Number(item)) && Number(item) > 0);
  const status = hasEvidence ? 'confirmed' : 'missing';
  const balance = section.balance !== undefined && section.balance !== '' ? section.balance : cash.balance;
  const reserve = section.reserve !== undefined && section.reserve !== '' ? section.reserve : cash.reserve;
  const daily = mode === 'quick' && section.daily !== undefined && section.daily !== '' ? section.daily : cash.daily;
  const conditions = [
    baseCondition('balance', 'balance', balance, status, confirmedAt),
    baseCondition('reserve', 'reserve', reserve, status, confirmedAt),
    {
      ...baseCondition('daily-floor', 'daily_floor', daily, status, confirmedAt),
      frequency: 'daily',
      startDate: localDateAfter(asOf, 1)
    }
  ];

  if (mode === 'full') {
    for (const expense of Array.isArray(section.expenses) ? section.expenses : []) {
      if (!expense || typeof expense !== 'object' || !String(expense.id || '') || !Number.isFinite(Number(expense.amount))) continue;
      conditions.push({
        ...baseCondition(`legacy-expense-${expense.id}`, 'recurring_expense', expense.amount, status, confirmedAt),
        frequency: String(expense.frequency || 'monthly'),
        nextOccurrence: String(expense.nextDate || ''),
        includedInDailyFloor: expense.includedInDailyFloor === true
      });
    }
    for (const income of Array.isArray(section.incomes) ? section.incomes : []) {
      if (!income || income.certainty !== 'confirmed' || !String(income.id || '') || !Number.isFinite(Number(income.amount))) continue;
      conditions.push({
        ...baseCondition(`legacy-income-${income.id}`, 'known_event', income.amount, status, confirmedAt),
        frequency: 'once',
        nextOccurrence: String(income.date || ''),
        eventKind: 'income'
      });
    }
  }

  return normalizeCashReality({ version: 1, conditions, events: [], scenarioDrafts: [] });
}

export function syncLegacyCashFromV8(value, existing = {}) {
  const reality = normalizeCashReality(value);
  const amountFor = (type) => reality.conditions.find((item) => item.type === type && item.status === 'confirmed')?.amount;
  return {
    balance: money(amountFor('balance'), money(existing.balance)),
    reserve: money(amountFor('reserve'), money(existing.reserve)),
    daily: money(amountFor('daily_floor'), money(existing.daily)),
    monthly: money(existing.monthly)
  };
}
