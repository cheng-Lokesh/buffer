import {
  appendCashEvent,
  buildExpectedOccurrences,
  normalizeCashReality,
  reconcileExpectedOccurrence
} from './v8-cash-reality.js';
import { updateConditionDetails } from './v9-condition-identity.js';

export const REALITY_CANDIDATE_TYPES = Object.freeze([
  'balance_confirmation',
  'one_off_income',
  'one_off_expense',
  'known_future_income',
  'known_future_expense',
  'recurring_income',
  'recurring_expense',
  'existing_occurrence_confirmation',
  'existing_occurrence_amount_change',
  'existing_occurrence_date_change',
  'existing_occurrence_not_occurred',
  'condition_update',
  'condition_pause',
  'condition_end'
]);

export const REALITY_CAPTURE_PROVENANCE = Object.freeze([
  'manual_balance',
  'quick_occurrence',
  'natural_language',
  'voice',
  'precise_edit'
]);

const CANDIDATE_TYPES = new Set(REALITY_CANDIDATE_TYPES);
const PROVENANCE = new Set(REALITY_CAPTURE_PROVENANCE);
const HYPOTHETICAL = /(?:如果|假设|要是|万一|假如)/;
const UNCERTAIN = /(?:可能|也许|或许|大概|不一定)/;

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && Number.isSafeInteger(Math.round(number * 100));
}

function cleanText(value, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function addMonth(dateText, day) {
  const [year, month] = dateText.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString().slice(0, 10);
}

function candidateError(message) {
  return { valid: false, errors: [message], candidates: [] };
}

function sanitizedCandidate(value, context) {
  if (!isRecord(value) || !CANDIDATE_TYPES.has(value.type)) throw new Error('变化类型无效。');
  const candidate = { type: value.type };
  const copyText = (key, max) => {
    const text = cleanText(value[key], max);
    if (text) candidate[key] = text;
  };
  copyText('name', 80);
  copyText('occurrenceId', 180);
  copyText('conditionId', 120);
  copyText('frequency', 20);
  copyText('occurredAt', 10);
  copyText('actualDate', 10);
  copyText('startDate', 10);
  copyText('endDate', 10);
  copyText('evidenceText', 240);
  if (value.amount !== undefined) candidate.amount = Number(value.amount);

  const amountTypes = new Set(['balance_confirmation', 'one_off_income', 'one_off_expense', 'known_future_income', 'known_future_expense', 'recurring_income', 'recurring_expense', 'existing_occurrence_amount_change']);
  if (amountTypes.has(candidate.type) && !validAmount(candidate.amount)) throw new Error('金额不能为空或格式无效。');
  if (['balance_confirmation', 'one_off_income', 'one_off_expense', 'known_future_income', 'known_future_expense'].includes(candidate.type)) {
    candidate.occurredAt ||= context.currentDate;
    if (!validDate(candidate.occurredAt)) throw new Error('日期不能为空或格式无效。');
  }
  if (['known_future_income', 'known_future_expense'].includes(candidate.type) && !candidate.name) throw new Error('未来事项名称不能为空。');
  if (['recurring_income', 'recurring_expense'].includes(candidate.type)) {
    if (!candidate.name) throw new Error('名称不能为空。');
    if (!['daily', 'weekly', 'monthly'].includes(candidate.frequency)) throw new Error('重复频率无效。');
    candidate.startDate ||= context.currentDate;
    if (!validDate(candidate.startDate)) throw new Error('开始日期无效。');
    if (candidate.endDate && !validDate(candidate.endDate)) throw new Error('结束日期无效。');
  }
  if (candidate.type.startsWith('existing_occurrence_')) {
    if (!candidate.occurrenceId || !context.dueOccurrences.some((item) => item.id === candidate.occurrenceId)) throw new Error('找不到待确认事项。');
  }
  if (candidate.type === 'existing_occurrence_date_change' && !validDate(candidate.actualDate)) throw new Error('实际日期无效。');
  if (candidate.type.startsWith('condition_')) {
    if (!candidate.conditionId || !context.activeConditions.some((item) => item.id === candidate.conditionId)) throw new Error('找不到现实条件。');
    if (candidate.type === 'condition_update' && !validAmount(candidate.amount)) throw new Error('金额不能为空或格式无效。');
  }
  return candidate;
}

export function buildRealityCaptureContext(source, options = {}) {
  const reality = normalizeCashReality(source);
  const currentDate = cleanText(options.asOf, 10);
  if (!validDate(currentDate)) throw new Error('当前日期无效。');
  const balance = reality.conditions.find((item) => item.type === 'balance' && item.status === 'confirmed');
  const activeConditions = reality.conditions
    .filter((item) => ['recurring_income', 'recurring_expense', 'known_event'].includes(item.type) && item.status === 'confirmed')
    .map((item) => ({
      id: item.id,
      name: item.name || '',
      type: item.type,
      amount: item.amount,
      frequency: item.frequency,
      nextOccurrence: item.nextOccurrence,
      endDate: item.endDate,
      eventKind: item.eventKind
    }));
  const dueOccurrences = buildExpectedOccurrences(reality, { asOf: currentDate, horizonDays: 0 })
    .filter((item) => item.status === 'due')
    .map((item) => ({
      id: item.id,
      conditionId: item.conditionId,
      conditionName: item.conditionName,
      expectedDate: item.expectedDate,
      expectedAmount: item.expectedAmount,
      direction: item.direction
    }));
  return {
    currentDate,
    timezone: cleanText(options.timezone, 80) || 'Asia/Shanghai',
    currentBalance: balance ? balance.amount : null,
    balanceConfirmedAt: balance?.confirmedAt || '',
    activeConditions,
    dueOccurrences
  };
}

export function validateRealityCandidates(values, context) {
  if (!Array.isArray(values) || values.length === 0) return candidateError('至少需要一项变化。');
  try {
    const candidates = values.map((value) => sanitizedCandidate(value, context));
    const occurrenceIds = candidates.filter((item) => item.occurrenceId).map((item) => item.occurrenceId);
    if (new Set(occurrenceIds).size !== occurrenceIds.length) return candidateError('同一待确认事项不能重复写入。');
    const balanceCount = candidates.filter((item) => item.type === 'balance_confirmation').length;
    if (balanceCount > 1) return candidateError('一次更新只能确认一个最终余额。');
    return { valid: true, errors: [], candidates };
  } catch (error) {
    return candidateError(error instanceof Error ? error.message : '变化无法确认。');
  }
}

function idFactory(options) {
  const provided = typeof options.makeId === 'function' ? options.makeId : null;
  let index = 0;
  return (kind) => {
    index += 1;
    return String(provided ? provided(kind, index) : `${kind}-${Date.now()}-${index}`);
  };
}

function applyCandidate(source, candidate, context, options, nextId) {
  const captureSource = options.provenance;
  const confirmedAt = options.confirmedAt;
  if (candidate.type.startsWith('existing_occurrence_')) {
    const resultMap = {
      existing_occurrence_confirmation: { result: 'as_expected' },
      existing_occurrence_amount_change: { result: 'amount_changed', actualAmount: candidate.amount },
      existing_occurrence_date_change: { result: 'date_changed', actualDate: candidate.actualDate },
      existing_occurrence_not_occurred: { result: 'did_not_occur' }
    };
    return reconcileExpectedOccurrence(source, candidate.occurrenceId, resultMap[candidate.type], {
      asOf: context.currentDate,
      id: nextId('resolution'),
      eventId: nextId('event'),
      resolvedAt: confirmedAt,
      captureSource
    }).reality;
  }

  if (candidate.type === 'condition_update' || candidate.type === 'condition_pause' || candidate.type === 'condition_end') {
    const patch = candidate.type === 'condition_update'
      ? { amount: candidate.amount, captureSource }
      : { status: candidate.type === 'condition_pause' ? 'paused' : 'ended', captureSource };
    return updateConditionDetails(source, candidate.conditionId, patch, { confirmedAt });
  }

  if (candidate.type === 'recurring_income' || candidate.type === 'recurring_expense') {
    const reality = normalizeCashReality(source);
    const condition = {
      id: nextId('condition'),
      name: candidate.name,
      type: candidate.type,
      amount: candidate.amount,
      frequency: candidate.frequency,
      startDate: candidate.startDate,
      nextOccurrence: candidate.startDate,
      endDate: candidate.endDate || '',
      status: 'confirmed',
      confirmedAt,
      source: 'user_confirmed',
      captureSource
    };
    return normalizeCashReality({ ...reality, conditions: [...reality.conditions, condition] });
  }

  if (candidate.type === 'known_future_income' || candidate.type === 'known_future_expense') {
    const reality = normalizeCashReality(source);
    const condition = {
      id: nextId('condition'),
      name: candidate.name,
      type: 'known_event',
      eventKind: candidate.type === 'known_future_income' ? 'income' : 'expense',
      amount: candidate.amount,
      startDate: candidate.occurredAt,
      nextOccurrence: candidate.occurredAt,
      status: 'confirmed',
      confirmedAt,
      source: 'user_confirmed',
      captureSource
    };
    return normalizeCashReality({ ...reality, conditions: [...reality.conditions, condition] });
  }

  const eventType = candidate.type === 'balance_confirmation'
    ? 'balance_confirmation'
    : candidate.type === 'one_off_income' ? 'income' : 'expense';
  return appendCashEvent(source, {
    type: eventType,
    name: candidate.name || (eventType === 'balance_confirmation' ? '余额重新确认' : ''),
    amount: candidate.amount,
    occurredAt: candidate.occurredAt,
    captureSource
  }, { id: nextId('event'), createdAt: confirmedAt });
}

function reanchorBalance(source, amount, confirmedAt, captureSource) {
  const reality = normalizeCashReality(source);
  let found = false;
  const conditions = reality.conditions.map((item) => {
    if (item.type !== 'balance') return item;
    found = true;
    return { ...item, amount, status: 'confirmed', confirmedAt, captureSource };
  });
  if (!found) conditions.push({
    id: 'balance',
    type: 'balance',
    amount,
    status: 'confirmed',
    confirmedAt,
    source: 'user_confirmed',
    captureSource
  });
  return normalizeCashReality({ ...reality, conditions });
}

export function commitRealityCapture(source, values, options = {}) {
  const context = buildRealityCaptureContext(source, { asOf: options.asOf });
  const validation = validateRealityCandidates(values, context);
  if (!validation.valid) throw new Error(validation.errors[0]);
  if (!PROVENANCE.has(options.provenance)) throw new Error('现实来源无效。');
  const confirmedAt = cleanText(options.confirmedAt, 80);
  if (!confirmedAt || Number.isNaN(Date.parse(confirmedAt))) throw new Error('确认时间无效。');
  const nextId = idFactory(options);
  const balanceBefore = context.currentBalance;
  const anchor = validation.candidates.find((item) => item.type === 'balance_confirmation');
  let next = normalizeCashReality(structuredClone(source));
  for (const candidate of validation.candidates) next = applyCandidate(next, candidate, context, { ...options, confirmedAt }, nextId);

  if (anchor) {
    next = reanchorBalance(next, anchor.amount, confirmedAt, options.provenance);
  } else {
    const delta = validation.candidates.reduce((sum, candidate) => {
      if (candidate.type === 'one_off_income') return sum + candidate.amount;
      if (candidate.type === 'one_off_expense') return sum - candidate.amount;
      return sum;
    }, 0);
    if (delta && balanceBefore !== null) next = reanchorBalance(next, Math.max(0, balanceBefore + delta), confirmedAt, options.provenance);
  }
  const balanceAfter = next.conditions.find((item) => item.type === 'balance' && item.status === 'confirmed')?.amount ?? null;
  return {
    reality: next,
    candidates: structuredClone(validation.candidates),
    summary: {
      changeCount: validation.candidates.length,
      balanceBefore,
      balanceAfter,
      usedBalanceAnchor: Boolean(anchor)
    }
  };
}

export function previewRealityCapture(source, values, options = {}) {
  const result = commitRealityCapture(source, values, {
    ...options,
    provenance: options.provenance || 'precise_edit',
    confirmedAt: options.confirmedAt || new Date().toISOString(),
    makeId: options.makeId || ((kind, index) => `preview-${kind}-${index}`)
  });
  return { ...result, preview: true };
}

function moneyFrom(text, pattern) {
  const match = text.match(pattern);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function dueMatches(context, term) {
  return context.dueOccurrences.filter((item) => item.conditionName.includes(term));
}

function conditionMatches(context, term, type) {
  return context.activeConditions.filter((item) => (!type || item.type === type) && item.name.includes(term));
}

function deterministicParse(text, context) {
  if (HYPOTHETICAL.test(text)) return { status: 'scenario', candidates: [], message: '这是一个模拟变化，可以在未来中模拟。' };
  if (UNCERTAIN.test(text)) return { status: 'clarification', candidates: [], question: '这是已经确定的未来事项，还是你想模拟的假设？', choices: [] };

  if (/下个月\s*(\d{1,2})\s*号/.test(text) && /(?:每个月|每月)/.test(text) && /工资/.test(text)) {
    const day = Number(text.match(/下个月\s*(\d{1,2})\s*号/)[1]);
    const amount = moneyFrom(text, /工资\s*(\d+(?:\.\d+)?)/);
    if (amount === null) return { status: 'clarification', candidates: [], question: '每月工资金额是多少？', choices: [] };
    return { status: 'candidates', candidates: [{ type: 'recurring_income', name: '工资', amount, frequency: 'monthly', startDate: addMonth(context.currentDate, day) }] };
  }

  if (/以后/.test(text) && /房租/.test(text) && /(?:改成|变成|涨到)/.test(text)) {
    const amount = moneyFrom(text, /(?:改成|变成|涨到)\s*(\d+(?:\.\d+)?)/);
    const matches = conditionMatches(context, '房租', 'recurring_expense');
    if (amount === null) return { status: 'clarification', candidates: [], question: '新的房租金额是多少？', choices: [] };
    if (matches.length !== 1) return { status: 'clarification', candidates: [], question: matches.length ? '你要修改哪一项房租？' : '没有找到可修改的固定房租，要新增一项吗？', choices: matches };
    return { status: 'candidates', candidates: [{ type: 'condition_update', conditionId: matches[0].id, name: matches[0].name, amount }] };
  }

  if (/工资/.test(text) && /(?:到账|到了|收到)/.test(text)) {
    const matches = dueMatches(context, '工资');
    if (matches.length > 1) return { status: 'clarification', candidates: [], question: '你说的是哪一项工资？', choices: matches };
    const amount = moneyFrom(text, /(?:但是|只有|实际|到账|到了)\s*(\d+(?:\.\d+)?)/);
    if (matches.length === 1) return {
      status: 'candidates',
      candidates: [{
        type: amount !== null && amount !== matches[0].expectedAmount ? 'existing_occurrence_amount_change' : 'existing_occurrence_confirmation',
        occurrenceId: matches[0].id,
        name: matches[0].conditionName,
        ...(amount !== null && amount !== matches[0].expectedAmount ? { amount } : {})
      }]
    };
    if (amount === null) return { status: 'clarification', candidates: [], question: '这次工资实际到账多少？', choices: [] };
    return { status: 'candidates', candidates: [{ type: 'one_off_income', name: '工资', amount, occurredAt: context.currentDate }] };
  }

  if (/工资\s*\d/.test(text) && !/(?:每月|每个月|到账|到了|收到)/.test(text)) {
    return { status: 'clarification', candidates: [], question: '这是一次收入，还是以后每月都会发生？', choices: [] };
  }

  const candidates = [];
  const rent = moneyFrom(text, /房租\s*(\d+(?:\.\d+)?)/);
  if (rent !== null) candidates.push({ type: 'one_off_expense', name: '房租', amount: rent, occurredAt: context.currentDate });
  const deposit = moneyFrom(text, /押金\s*(?:退了|退回|返还|到账)?\s*(\d+(?:\.\d+)?)/);
  if (deposit !== null && /(?:退|返还)/.test(text)) candidates.push({ type: 'one_off_income', name: '押金返还', amount: deposit, occurredAt: context.currentDate });
  const balance = moneyFrom(text, /(?:现在(?:总共)?(?:还有|余额是|只有)?|总共还有|余额(?:是|变成)?)\s*(\d+(?:\.\d+)?)/);
  if (balance !== null) candidates.push({ type: 'balance_confirmation', amount: balance, occurredAt: context.currentDate });
  if (candidates.length) return { status: 'candidates', candidates };
  return { status: 'clarification', candidates: [], question: '我还不能确定金额、日期或这是不是持续变化。请只补充缺少的事实。', choices: [] };
}

export function createDeterministicRealityParserAdapter() {
  return Object.freeze({
    id: 'deterministic-local-v12',
    provider: 'local',
    sendsDataExternally: false,
    async parse(text, context) {
      return deterministicParse(text, context);
    }
  });
}

function cleanParserResult(raw, context) {
  if (!isRecord(raw)) throw new Error('解析结果无效。');
  if (raw.status === 'scenario') return { status: 'scenario', candidates: [], message: cleanText(raw.message, 160) || '这是一个模拟变化。' };
  if (raw.status === 'clarification') return {
    status: 'clarification',
    candidates: [],
    question: cleanText(raw.question, 160) || '还需要确认一个事实。',
    choices: Array.isArray(raw.choices) ? raw.choices.slice(0, 6).map((item) => ({
      id: cleanText(item?.id, 180),
      conditionId: cleanText(item?.conditionId, 120),
      conditionName: cleanText(item?.conditionName || item?.name, 80),
      expectedDate: cleanText(item?.expectedDate, 10),
      expectedAmount: validAmount(item?.expectedAmount) ? Number(item.expectedAmount) : null
    })) : []
  };
  if (raw.status !== 'candidates') throw new Error('解析状态无效。');
  const validation = validateRealityCandidates(raw.candidates, context);
  if (!validation.valid) throw new Error(validation.errors[0]);
  return { status: 'candidates', candidates: validation.candidates };
}

export async function parseRealityMessage(text, context, adapter = createDeterministicRealityParserAdapter()) {
  const message = cleanText(text, 1000);
  if (!message) return { status: 'error', candidates: [], message: '请先写下发生了什么。', canRetry: false, manualFallback: true };
  if (!isRecord(context) || !validDate(context.currentDate)) return { status: 'error', candidates: [], message: '现实上下文无效。', canRetry: false, manualFallback: true };
  if (!adapter || typeof adapter.parse !== 'function') return { status: 'error', candidates: [], message: '暂时无法解析这句话。', canRetry: true, manualFallback: true };
  try {
    const raw = await adapter.parse(message, structuredClone(context));
    return cleanParserResult(raw, context);
  } catch {
    return { status: 'error', candidates: [], message: '暂时无法解析这句话。', canRetry: true, manualFallback: true };
  }
}
