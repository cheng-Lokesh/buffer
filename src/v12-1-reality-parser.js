const INTERPRETATION_STATUSES = Object.freeze(['candidates', 'partial', 'clarification', 'scenario', 'unsupported']);
const SEMANTIC_TYPES = Object.freeze([
  'income_received',
  'expense_paid',
  'balance_confirmation',
  'recurring_income_started',
  'recurring_expense_started',
  'recurring_change',
  'occurrence_amount_change',
  'occurrence_delayed',
  'occurrence_not_occurred',
  'condition_end',
  'condition_pause',
  'future_income',
  'future_expense',
  'income_not_received',
  'expense_not_required',
  'fact_negated',
  'unsupported'
]);
const DIRECTIONS = Object.freeze(['income', 'expense', 'balance', 'none']);
const AMOUNT_CERTAINTIES = Object.freeze(['exact', 'approximate', 'unknown']);
const REALITY_STATUSES = Object.freeze(['actual', 'known_future', 'uncertain', 'scenario', 'negated', 'unsupported']);
const FREQUENCIES = Object.freeze(['daily', 'weekly', 'monthly', 'yearly']);
const TOP_LEVEL_KEYS = new Set(['status', 'items', 'scenarioItems', 'clarification']);
const ITEM_KEYS = new Set([
  'semanticType', 'direction', 'amount', 'amountCertainty', 'dateExpression',
  'resolvedDate', 'frequency', 'nameHint', 'referenceHint', 'realityStatus', 'evidenceText'
]);
const CLARIFICATION_KEYS = new Set(['question', 'itemIndexes']);

const nullableString = (max) => ({ type: ['string', 'null'], maxLength: max });

const interpretationItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...ITEM_KEYS],
  properties: {
    semanticType: { type: 'string', enum: SEMANTIC_TYPES },
    direction: { type: 'string', enum: DIRECTIONS },
    amount: { type: ['number', 'null'], minimum: 0, maximum: 1_000_000_000 },
    amountCertainty: { type: 'string', enum: AMOUNT_CERTAINTIES },
    dateExpression: nullableString(80),
    resolvedDate: nullableString(10),
    frequency: { type: ['string', 'null'], enum: [...FREQUENCIES, null] },
    nameHint: nullableString(80),
    referenceHint: nullableString(120),
    realityStatus: { type: 'string', enum: REALITY_STATUSES },
    evidenceText: { type: 'string', minLength: 1, maxLength: 240 }
  }
};

export const PARSER_INTERPRETATION_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['status', 'items', 'scenarioItems', 'clarification'],
  properties: {
    status: { type: 'string', enum: INTERPRETATION_STATUSES },
    items: { type: 'array', maxItems: 12, items: interpretationItemSchema },
    scenarioItems: { type: 'array', maxItems: 8, items: interpretationItemSchema },
    clarification: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['question', 'itemIndexes'],
          properties: {
            question: { type: 'string', minLength: 1, maxLength: 160 },
            itemIndexes: { type: 'array', maxItems: 12, items: { type: 'integer', minimum: 0, maximum: 11 } }
          }
        }
      ]
    }
  }
});

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validDate(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function validNullableText(value, max) {
  return value === null || (typeof value === 'string' && value.length <= max);
}

function validItem(value) {
  if (!isRecord(value) || !hasOnlyKeys(value, ITEM_KEYS) || Object.keys(value).length !== ITEM_KEYS.size) return false;
  if (!SEMANTIC_TYPES.includes(value.semanticType)) return false;
  if (!DIRECTIONS.includes(value.direction)) return false;
  if (!AMOUNT_CERTAINTIES.includes(value.amountCertainty)) return false;
  if (!REALITY_STATUSES.includes(value.realityStatus)) return false;
  if (value.frequency !== null && !FREQUENCIES.includes(value.frequency)) return false;
  if (!validNullableText(value.dateExpression, 80) || !validNullableText(value.nameHint, 80) || !validNullableText(value.referenceHint, 120)) return false;
  if (!validDate(value.resolvedDate)) return false;
  if (typeof value.evidenceText !== 'string' || !value.evidenceText.trim() || value.evidenceText.length > 240) return false;
  if (value.amount !== null && (!Number.isFinite(value.amount) || value.amount < 0 || value.amount > 1_000_000_000)) return false;
  if (value.amountCertainty !== 'exact' && value.amount !== null) return false;
  return true;
}

export function validateParserInterpretation(value) {
  const errors = [];
  if (!isRecord(value) || !hasOnlyKeys(value, TOP_LEVEL_KEYS) || Object.keys(value).length !== TOP_LEVEL_KEYS.size) {
    return { valid: false, errors: ['解析结果包含未允许字段或缺少字段。'] };
  }
  if (!INTERPRETATION_STATUSES.includes(value.status)) errors.push('解析状态无效。');
  if (!Array.isArray(value.items) || value.items.length > 12 || value.items.some((entry) => !validItem(entry))) errors.push('候选语义结构无效。');
  if (!Array.isArray(value.scenarioItems) || value.scenarioItems.length > 8 || value.scenarioItems.some((entry) => !validItem(entry) || entry.realityStatus !== 'scenario')) errors.push('假设语义结构无效。');
  if (value.clarification !== null) {
    const clarification = value.clarification;
    if (!isRecord(clarification) || !hasOnlyKeys(clarification, CLARIFICATION_KEYS) || Object.keys(clarification).length !== CLARIFICATION_KEYS.size ||
      typeof clarification.question !== 'string' || !clarification.question.trim() || clarification.question.length > 160 ||
      !Array.isArray(clarification.itemIndexes) || clarification.itemIndexes.length > 12 ||
      clarification.itemIndexes.some((index) => !Number.isInteger(index) || index < 0 || index >= Math.max(value.items.length, 1))) {
      errors.push('澄清结构无效。');
    }
  }
  if (value.status === 'scenario' && value.items.length) errors.push('假设不得包含 Reality 事实。');
  if (value.status === 'clarification' && value.clarification === null) errors.push('澄清问题不能为空。');
  return { valid: errors.length === 0, errors };
}

function normalized(value) {
  return String(value || '').toLocaleLowerCase('zh-CN').replace(/[\s,，。！？!?.￥¥元块钱]/g, '');
}

function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDate(year, month, day) {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day ? value : null;
}

const WEEKDAY_INDEX = Object.freeze({ '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 });
const SMALL_CHINESE_NUMBER = Object.freeze({ '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 });

const CHINESE_DIGIT = Object.freeze({ '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 });
const CHINESE_UNIT = Object.freeze({ '十': 10, '百': 100, '千': 1000 });

function parseChineseSection(text) {
  if (!text) return 0;
  let total = 0;
  let digit = null;
  let lastUnit = 1;
  for (const character of text) {
    if (character in CHINESE_DIGIT) {
      digit = CHINESE_DIGIT[character];
      continue;
    }
    const unit = CHINESE_UNIT[character];
    if (!unit) return null;
    total += (digit === null ? 1 : digit) * unit;
    digit = null;
    lastUnit = unit;
  }
  if (digit !== null) total += total > 0 && lastUnit > 10 ? digit * (lastUnit / 10) : digit;
  return total;
}

function parseChineseMoneyToken(token) {
  if (!/[十百千万]/.test(token)) return null;
  const parts = token.split('万');
  if (parts.length > 2) return null;
  if (parts.length === 1) return parseChineseSection(parts[0]);
  const high = parseChineseSection(parts[0] || '一');
  if (!Number.isFinite(high)) return null;
  if (!parts[1]) return high * 10_000;
  if (parts[1].length === 1 && parts[1] in CHINESE_DIGIT) return high * 10_000 + CHINESE_DIGIT[parts[1]] * 1000;
  const low = parseChineseSection(parts[1]);
  return Number.isFinite(low) ? high * 10_000 + low : null;
}

export function extractExplicitMoneyAmounts(text) {
  const source = String(text || '');
  const amounts = [];
  const occupied = [];
  const arabic = /(\d[\d,]*(?:\.\d+)?)\s*万(?:\s*(\d))?|\d[\d,]*(?:\.\d+)?/g;
  for (const match of source.matchAll(arabic)) {
    const next = source[match.index + match[0].length] || '';
    if (/[年月日号天]/.test(next)) continue;
    let amount;
    if (match[1] !== undefined) {
      amount = Number(match[1].replace(/,/g, '')) * 10_000 + (match[2] ? Number(match[2]) * 1000 : 0);
    } else {
      amount = Number(match[0].replace(/,/g, ''));
    }
    if (Number.isFinite(amount)) amounts.push(amount);
    occupied.push([match.index, match.index + match[0].length]);
  }
  const chinese = /[零〇一二两三四五六七八九十百千万]+/g;
  for (const match of source.matchAll(chinese)) {
    if (occupied.some(([start, end]) => match.index < end && match.index + match[0].length > start)) continue;
    const amount = parseChineseMoneyToken(match[0]);
    if (Number.isFinite(amount)) amounts.push(amount);
  }
  return [...new Set(amounts)];
}

function inferClauseLocalAmount(item, sourceText) {
  const clauses = String(sourceText || '').split(/[，,。；;！？!?]/).map((part) => part.trim()).filter(Boolean);
  const cue = item.semanticType === 'balance_confirmation'
    ? /(?:余额|还剩|剩下|总共|一共|手头|卡里)/
    : item.semanticType === 'income_received'
      ? /(?:到账|到手|收到|转(?:账|给|来|了)?|打(?:给|来|了)?|结算|退(?:回|了)|给了)/
      : item.semanticType === 'expense_paid'
        ? /(?:交了|付了|扣了|花了|还了|支出)/
        : null;
  if (!cue) return null;
  const matches = clauses
    .filter((clause) => cue.test(clause))
    .flatMap((clause) => extractExplicitMoneyAmounts(clause));
  return matches.length === 1 ? matches[0] : null;
}

export function resolveNaturalDateExpression(expression, currentDate) {
  const text = String(expression || '').replace(/\s/g, '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(currentDate || ''))) return null;
  const [year, month] = currentDate.split('-').map(Number);
  const iso = text.match(/(?:^|\D)(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
  if (iso) return formatDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  if (text.includes('前天')) return addDays(currentDate, -2);
  if (text.includes('昨天')) return addDays(currentDate, -1);
  if (text.includes('后天')) return addDays(currentDate, 2);
  if (text.includes('明天')) return addDays(currentDate, 1);
  if (text.includes('今天')) return currentDate;

  const relativeDays = text.match(/([一二两三四五六七八九十]|\d{1,2})天(后|前)/);
  if (relativeDays) {
    const count = Number(relativeDays[1]) || SMALL_CHINESE_NUMBER[relativeDays[1]];
    if (Number.isFinite(count)) return addDays(currentDate, relativeDays[2] === '后' ? count : -count);
  }

  const weekday = text.match(/(下周|这周|本周)?(?:周|星期)([一二三四五六日天])/);
  if (weekday) {
    const target = WEEKDAY_INDEX[weekday[2]];
    const current = new Date(`${currentDate}T00:00:00.000Z`);
    const currentWeekday = current.getUTCDay() || 7;
    let offset = target - currentWeekday;
    if (weekday[1] === '下周') offset += 7;
    else if (!weekday[1] && offset < 0) offset += 7;
    return addDays(currentDate, offset);
  }

  if (/(?:下月|下个月)(?:底|最后一天)/.test(text)) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return formatDate(nextYear, nextMonth, daysInMonth(nextYear, nextMonth));
  }
  if (/(?:本月|这个月|这月)?(?:月底|月末|最后一天)/.test(text)) {
    return formatDate(year, month, daysInMonth(year, month));
  }
  const nextMonthDay = text.match(/(?:下月|下个月)(\d{1,2})[号日]/);
  if (nextMonthDay) {
    const targetMonth = month === 12 ? 1 : month + 1;
    const targetYear = month === 12 ? year + 1 : year;
    return formatDate(targetYear, targetMonth, Number(nextMonthDay[1]));
  }
  const monthDay = text.match(/(\d{1,2})月(\d{1,2})[号日]/);
  if (monthDay) {
    const targetMonth = Number(monthDay[1]);
    const targetDay = Number(monthDay[2]);
    let targetYear = year;
    const candidate = formatDate(targetYear, targetMonth, targetDay);
    if (candidate && candidate < currentDate) targetYear += 1;
    return formatDate(targetYear, targetMonth, targetDay);
  }
  return null;
}

function referencedByText(entity, text) {
  const haystack = normalized(text);
  const name = normalized(entity.name || entity.conditionName);
  if (name && (haystack.includes(name) || name.includes(haystack))) return true;
  const amounts = [entity.amount, entity.expectedAmount].filter(Number.isFinite);
  return amounts.some((amount) => haystack.includes(String(amount)));
}

function minimalCondition(item) {
  return {
    id: String(item.id || '').slice(0, 120),
    name: String(item.name || '').slice(0, 80),
    type: String(item.type || '').slice(0, 40),
    amount: Number.isFinite(item.amount) ? Number(item.amount) : null,
    frequency: item.frequency || null,
    nextOccurrence: item.nextOccurrence || null,
    endDate: item.endDate || null
  };
}

function minimalOccurrence(item) {
  return {
    id: String(item.id || '').slice(0, 180),
    conditionId: String(item.conditionId || '').slice(0, 120),
    conditionName: String(item.conditionName || '').slice(0, 80),
    expectedDate: item.expectedDate || null,
    expectedAmount: Number.isFinite(item.expectedAmount) ? Number(item.expectedAmount) : null,
    direction: item.direction || null
  };
}

export function selectRelevantRealityContext(text, context) {
  const activeConditions = (Array.isArray(context?.activeConditions) ? context.activeConditions : [])
    .filter((item) => referencedByText(item, text))
    .slice(0, 8)
    .map(minimalCondition);
  const dueOccurrences = (Array.isArray(context?.dueOccurrences) ? context.dueOccurrences : [])
    .filter((item) => referencedByText(item, text))
    .slice(0, 8)
    .map(minimalOccurrence);
  return {
    currentDate: String(context?.currentDate || '').slice(0, 10),
    timezone: String(context?.timezone || 'Asia/Shanghai').slice(0, 80),
    currentBalance: Number.isFinite(context?.currentBalance) ? Number(context.currentBalance) : null,
    activeConditions,
    dueOccurrences
  };
}

const SIMPLE_BALANCE = /^(?:余额(?:是|为)?|现在(?:总共)?(?:还有|只有|还剩)?|现在一共(?:有|剩|只有)?|现在还剩)\s*[¥￥]?\s*(\d{1,9}(?:\.\d{1,2})?)\s*(?:元|块)?[。！!]?$/;

export function isConservativeRealityFastPath(text) {
  const value = String(text || '').trim();
  if (!value || /(?:大概|差不多|左右|多一点|多|可能|也许|如果|假设|，|,|；|;)/.test(value)) return false;
  return SIMPLE_BALANCE.test(value);
}

function occurrenceMatches(item, context, sourceText = '') {
  const occurrences = context.dueOccurrences || [];
  const findNameMatches = (reference) => occurrences.filter((entry) => {
    const name = normalized(entry.conditionName);
    const direct = Boolean(reference && name && (reference.includes(name) || name.includes(reference)));
    const clientAlias = /(?:客户|外包|项目款)/.test(reference) && /(?:客户|外包|项目款)/.test(name);
    return direct || clientAlias;
  });
  const primaryReference = normalized(`${item.referenceHint || ''}${item.nameHint || ''}${item.evidenceText || ''}`);
  const sourceReference = normalized(sourceText);
  const explicitOccurrence = ['occurrence_amount_change', 'occurrence_delayed', 'occurrence_not_occurred', 'expense_not_required'].includes(item.semanticType);
  const sourceWithoutTerminal = String(sourceText || '').replace(/[。！？!?]+\s*$/, '');
  const sourceIsSingleClause = !/[，,；;]/.test(sourceWithoutTerminal);
  const nameMatches = findNameMatches(sourceReference);
  if (explicitOccurrence && sourceIsSingleClause && nameMatches.length === 1) return nameMatches;
  const primaryMatches = findNameMatches(primaryReference);
  if (primaryMatches.length) return primaryMatches;
  const amountMatches = occurrences.filter((entry) => Number.isFinite(item.amount) && Number(entry.expectedAmount) === Number(item.amount));
  if (primaryReference) return amountMatches;
  if (nameMatches.length === 1) return nameMatches;
  if (nameMatches.length > 1 && amountMatches.length) {
    const narrowed = nameMatches.filter((entry) => amountMatches.includes(entry));
    if (narrowed.length) return narrowed;
  }
  if (nameMatches.length) return nameMatches;
  return amountMatches;
}

function conditionMatches(item, context, sourceText = '') {
  const conditions = context.activeConditions || [];
  const findNameMatches = (reference) => conditions.filter((entry) => {
    const name = normalized(entry.name);
    const direct = Boolean(reference && name && (reference.includes(name) || name.includes(reference)));
    const salaryAlias = /(?:工作|工资|薪资)/.test(reference) && /(?:工作|工资|薪资)/.test(name);
    return direct || salaryAlias;
  });
  const primaryReference = normalized(`${item.referenceHint || ''}${item.nameHint || ''}${item.evidenceText || ''}`);
  const primaryMatches = findNameMatches(primaryReference);
  if (primaryMatches.length || primaryReference) return primaryMatches;
  return findNameMatches(normalized(sourceText));
}

function clarification(question, matches = []) {
  return {
    question,
    choices: matches.slice(0, 6).map((entry) => ({
      id: entry.id,
      conditionId: entry.conditionId || entry.id,
      conditionName: entry.conditionName || entry.name || '',
      expectedDate: entry.expectedDate || entry.nextOccurrence || '',
      expectedAmount: Number.isFinite(entry.expectedAmount) ? entry.expectedAmount : entry.amount
    }))
  };
}

function candidateFromItem(item, context, sourceText = '') {
  const occurredAt = item.resolvedDate || context.currentDate;
  const common = { name: item.nameHint || item.referenceHint || '', evidenceText: item.evidenceText };
  const evidence = String(item.evidenceText || '');
  if (/(?:如果|假设|要是|万一|假如|模拟)/.test(evidence)) return { ignored: true };
  if (item.realityStatus === 'scenario') return { scenario: item };
  if (/(?:可能|也许|或许|大概|差不多|估计|应该|左右|多一点|两千多)/.test(evidence)) {
    return { clarification: clarification('这部分还不够确定，请只确认实际金额或是否已经确定。') };
  }
  if (item.realityStatus === 'uncertain' || item.amountCertainty === 'approximate') {
    return { clarification: clarification('这部分还不够确定，请只确认实际金额或是否已经确定。') };
  }
  if (['income_not_received', 'fact_negated'].includes(item.semanticType)) return { ignored: true };
  if (item.realityStatus === 'negated' && !['expense_not_required', 'occurrence_not_occurred'].includes(item.semanticType)) return { ignored: true };
  const pendingIncome = /(?:还没|尚未|未|没有|并没有).{0,8}(?:到账|收到|退回|发放|打来|转来|转账|转)/.test(evidence);
  if (item.direction === 'income' && item.semanticType === 'occurrence_not_occurred' && pendingIncome) return { ignored: true };
  if (item.semanticType === 'income_received') {
    if (pendingIncome) return { ignored: true };
    const actualIncomeCue = /(?:到账|到了|到手|收(?:到|了)|转(?:账|给|来|了)?|打(?:给|来|了)|下来(?:了)?|结算|退(?:回|了)|落袋|入账|实际(?:只有|是)|这次(?:只有|是)|那份.{0,6}(?:只有|是))/.test(evidence);
    if (!actualIncomeCue) return { clarification: clarification('这笔钱是否已经实际到账？') };
  }
  if (Number.isFinite(item.amount)) {
    const explicitAmounts = extractExplicitMoneyAmounts(evidence);
    if (explicitAmounts.length && !explicitAmounts.some((amount) => amount === Number(item.amount))) {
      return { clarification: clarification('我没有在原话中找到这个金额，请确认实际金额。') };
    }
  }
  if (item.semanticType === 'balance_confirmation') {
    if (!Number.isFinite(item.amount)) return { clarification: clarification('现在实际可用的总余额是多少？') };
    return { candidate: { type: 'balance_confirmation', amount: item.amount, occurredAt, evidenceText: item.evidenceText } };
  }

  if (['income_received', 'expense_paid', 'occurrence_amount_change', 'occurrence_delayed', 'occurrence_not_occurred', 'expense_not_required'].includes(item.semanticType)) {
    const matches = occurrenceMatches(item, context, sourceText);
    const explicitlyOccurrence = ['occurrence_amount_change', 'occurrence_delayed', 'occurrence_not_occurred', 'expense_not_required'].includes(item.semanticType);
    if (matches.length > 1) return { clarification: clarification('你指的是哪一笔？', matches) };
    if (matches.length === 1) {
      const match = matches[0];
      if (['occurrence_not_occurred', 'expense_not_required'].includes(item.semanticType)) {
        return { candidate: { type: 'existing_occurrence_not_occurred', occurrenceId: match.id, ...common } };
      }
      if (item.semanticType === 'occurrence_delayed') {
        if (!item.resolvedDate) return { clarification: clarification('这笔预计事项改到哪一天？') };
        return { candidate: { type: 'existing_occurrence_date_change', occurrenceId: match.id, actualDate: item.resolvedDate, ...common } };
      }
      if (Number.isFinite(item.amount) && Number(item.amount) !== Number(match.expectedAmount)) {
        return { candidate: { type: 'existing_occurrence_amount_change', occurrenceId: match.id, amount: item.amount, ...common } };
      }
      return { candidate: { type: 'existing_occurrence_confirmation', occurrenceId: match.id, ...common } };
    }
    if (explicitlyOccurrence) return { clarification: clarification('没有唯一找到你说的那一笔，请选择或精确修改。') };
    if (!Number.isFinite(item.amount)) return { clarification: clarification('实际金额是多少？') };
    return { candidate: { type: item.semanticType === 'expense_paid' ? 'one_off_expense' : 'one_off_income', amount: item.amount, occurredAt, ...common } };
  }

  if (['recurring_change', 'condition_end', 'condition_pause'].includes(item.semanticType)) {
    const matches = conditionMatches(item, context, sourceText);
    if (matches.length !== 1) return { clarification: clarification(matches.length ? '你指的是哪一个持续条件？' : '没有唯一找到要修改的持续条件。', matches) };
    if (item.semanticType === 'condition_end') return { candidate: { type: 'condition_end', conditionId: matches[0].id, ...common } };
    if (item.semanticType === 'condition_pause') return { candidate: { type: 'condition_pause', conditionId: matches[0].id, ...common } };
    if (!Number.isFinite(item.amount)) return { clarification: clarification('新的固定金额是多少？') };
    return { candidate: { type: 'condition_update', conditionId: matches[0].id, amount: item.amount, startDate: occurredAt, ...common } };
  }

  if (['recurring_income_started', 'recurring_expense_started'].includes(item.semanticType)) {
    if (!Number.isFinite(item.amount) || !item.frequency) return { clarification: clarification('还需要确认固定金额和发生频率。') };
    return { candidate: {
      type: item.semanticType === 'recurring_income_started' ? 'recurring_income' : 'recurring_expense',
      amount: item.amount,
      frequency: item.frequency,
      startDate: occurredAt,
      ...common
    } };
  }

  if (['future_income', 'future_expense'].includes(item.semanticType)) {
    if (item.realityStatus !== 'known_future' || !Number.isFinite(item.amount) || !item.resolvedDate) {
      return { clarification: clarification('这件事是否已经确定，具体金额和日期是什么？') };
    }
    if (/(?:那笔|这笔|之前|原来|改到|再给|拖到|延期)/.test(`${item.evidenceText}${sourceText}`)) {
      const matches = occurrenceMatches(item, context, sourceText);
      if (matches.length > 1) return { clarification: clarification('你指的是哪一笔？', matches) };
      if (matches.length === 1) {
        const match = matches[0];
        if (item.resolvedDate !== match.expectedDate) {
          return { candidate: { type: 'existing_occurrence_date_change', occurrenceId: match.id, actualDate: item.resolvedDate, ...common } };
        }
        if (Number(item.amount) !== Number(match.expectedAmount)) {
          return { candidate: { type: 'existing_occurrence_amount_change', occurrenceId: match.id, amount: item.amount, ...common } };
        }
        return { candidate: { type: 'existing_occurrence_confirmation', occurrenceId: match.id, ...common } };
      }
    }
    return { candidate: {
      type: item.semanticType === 'future_income' ? 'known_future_income' : 'known_future_expense',
      amount: item.amount,
      occurredAt: item.resolvedDate,
      ...common
    } };
  }
  return { ignored: true };
}

export function resolveRealityParserInterpretation(value, context, sourceText = '') {
  const validation = validateParserInterpretation(value);
  if (!validation.valid) throw new Error(validation.errors[0]);
  const candidates = [];
  const clarifications = [];
  const scenarioItems = [...value.scenarioItems];
  value.items.forEach((item) => {
    const programDate = resolveNaturalDateExpression(`${item.dateExpression || ''} ${item.evidenceText || ''}`, context.currentDate);
    let normalizedItem = programDate ? { ...item, resolvedDate: programDate } : item;
    if (normalizedItem.amount === null) {
      const evidenceAmounts = extractExplicitMoneyAmounts(normalizedItem.evidenceText);
      const sourceAmounts = evidenceAmounts.length ? evidenceAmounts : extractExplicitMoneyAmounts(sourceText);
      const vagueAmount = /(?:大概|差不多|左右|多一点|约莫|估计|应该|两千多|\d+(?:\.\d+)?多)/.test(`${normalizedItem.evidenceText}${sourceText}`);
      const recoveredAmount = sourceAmounts.length === 1 ? sourceAmounts[0] : inferClauseLocalAmount(normalizedItem, sourceText);
      if (Number.isFinite(recoveredAmount) && !vagueAmount) normalizedItem = { ...normalizedItem, amount: recoveredAmount, amountCertainty: 'exact' };
    }
    if (normalizedItem.semanticType === 'recurring_change' && !Number.isFinite(normalizedItem.amount) &&
      /(?:不干了|没有工资|不再有工资|辞职|工作结束|以后不发)/.test(`${normalizedItem.evidenceText}${sourceText}`)) {
      normalizedItem = { ...normalizedItem, semanticType: 'condition_end' };
    }
    if (normalizedItem.semanticType === 'occurrence_delayed' && normalizedItem.resolvedDate &&
      /(?:确认|确定|已经通知|已通知).{0,18}(?:改到|延期到|推迟到|挪到)/.test(sourceText) &&
      !/(?:可能|也许|或许|大概|估计|应该)/.test(sourceText)) {
      normalizedItem = { ...normalizedItem, realityStatus: 'known_future' };
    }
    const resolved = candidateFromItem(normalizedItem, context, sourceText);
    if (resolved.candidate) candidates.push(resolved.candidate);
    if (resolved.clarification) clarifications.push(resolved.clarification);
    if (resolved.scenario) scenarioItems.push(resolved.scenario);
  });
  if (!candidates.length && value.items.length === 0 && sourceText &&
    /(?:不干了|辞职了?|工作结束|不再有工资|开始没有工资|以后不发工资)/.test(sourceText) &&
    !/(?:如果|假设|要是|万一|假如|可能|也许|大概|估计|应该)/.test(sourceText)) {
    const matches = (context.activeConditions || []).filter((entry) => entry.type === 'recurring_income' &&
      /(?:工作|工资|薪资)/.test(`${sourceText}${entry.name || ''}`));
    if (matches.length === 1) candidates.push({
      type: 'condition_end', conditionId: matches[0].id, name: matches[0].name || '工资', evidenceText: String(sourceText).slice(0, 240)
    });
  }
  if (!candidates.length && value.items.length === 0 && sourceText) {
    const scenarioIndex = String(sourceText).search(/(?:如果|假设|要是|万一|假如|模拟)/);
    const actualClause = String(sourceText).slice(0, scenarioIndex >= 0 ? scenarioIndex : undefined);
    const clause = normalized(actualClause);
    const blockedRecovery = /(?:还没|尚未|未到账|未收到|没有|并没有|不曾|可能|也许|或许|大概|差不多|估计|应该|快要|快退|左右)/.test(actualClause);
    const dueMatches = blockedRecovery ? [] : (context.dueOccurrences || []).filter((entry) => {
      const name = normalized(entry.conditionName);
      if (!name || !clause.includes(name)) return false;
      return entry.direction === 'expense'
        ? /(?:已经|刚|实际)?(?:交了|付了|扣了|扣走|花了|还了)/.test(actualClause)
        : /(?:到账|到了|收到|收了|转来|打来|下来了|退回|退了|结算)/.test(actualClause);
    });
    if (dueMatches.length === 1) {
      const match = dueMatches[0];
      const amounts = extractExplicitMoneyAmounts(actualClause);
      if (amounts.length === 1 && Number(amounts[0]) !== Number(match.expectedAmount)) {
        candidates.push({ type: 'existing_occurrence_amount_change', occurrenceId: match.id, amount: amounts[0], name: match.conditionName, evidenceText: actualClause.trim() });
      } else {
        candidates.push({ type: 'existing_occurrence_confirmation', occurrenceId: match.id, name: match.conditionName, evidenceText: actualClause.trim() });
      }
    }
  }
  if (value.clarification && clarifications.length === 0) {
    clarifications.push({ question: value.clarification.question, choices: [] });
  }
  if (!scenarioItems.length) {
    const scenarioStart = String(sourceText).search(/(?:如果|假设|要是|万一|假如|模拟)/);
    if (scenarioStart >= 0) scenarioItems.push({
      semanticType: 'unsupported', direction: 'none', amount: null, amountCertainty: 'unknown',
      dateExpression: null, resolvedDate: null, frequency: null, nameHint: null, referenceHint: null,
      realityStatus: 'scenario', evidenceText: String(sourceText).slice(scenarioStart, scenarioStart + 240)
    });
  }
  const preferredCandidates = candidates.filter((candidate, index, all) => {
    const isGenericFuture = ['known_future_income', 'known_future_expense'].includes(candidate.type);
    if (!isGenericFuture) return true;
    const evidence = normalized(candidate.evidenceText);
    return !all.some((other, otherIndex) => otherIndex !== index && other.type.startsWith('existing_occurrence_') &&
      other.actualDate === candidate.occurredAt && evidence && normalized(other.evidenceText) &&
      (evidence.includes(normalized(other.evidenceText)) || normalized(other.evidenceText).includes(evidence)));
  });
  const seenCandidates = new Set();
  const dedupedCandidates = preferredCandidates.filter((candidate) => {
    const key = [candidate.type, candidate.occurrenceId || '', candidate.conditionId || '', candidate.amount ?? '', candidate.occurredAt || '', candidate.actualDate || '', candidate.startDate || ''].join('|');
    if (seenCandidates.has(key)) return false;
    seenCandidates.add(key);
    return true;
  });
  if (!dedupedCandidates.length && !clarifications.length && !scenarioItems.length &&
    /(?:可能|也许|或许|大概|差不多|估计|应该|左右|多一点|两千多)/.test(sourceText)) {
    clarifications.push(clarification('这部分还不够确定，请确认实际金额或是否已经确定。'));
  }
  const explicitScenario = /(?:如果|假设|要是|万一|假如|模拟)/.test(sourceText);
  const status = dedupedCandidates.length && clarifications.length
    ? 'partial'
    : dedupedCandidates.length ? 'candidates'
      : explicitScenario && scenarioItems.length ? 'scenario'
      : clarifications.length ? 'clarification'
        : scenarioItems.length ? 'scenario' : 'unsupported';
  return { status, candidates: dedupedCandidates, clarifications, scenarioItems };
}

export function createRealityParserRouter({ localAdapter, llmAdapter }) {
  if (!localAdapter?.parse || !llmAdapter?.parse) throw new Error('Reality parser adapters are required.');
  return Object.freeze({
    id: 'hybrid-reality-parser-v12-1',
    async parse(text, context) {
      const originalText = String(text || '').trim().slice(0, 1000);
      try {
        if (isConservativeRealityFastPath(originalText, context)) {
          const result = await localAdapter.parse(originalText, context);
          return { ...result, route: 'fast_path', provider: localAdapter.id || 'local' };
        }
        const relevantContext = selectRelevantRealityContext(originalText, context);
        const interpretation = await llmAdapter.parse(originalText, relevantContext);
        const resolved = resolveRealityParserInterpretation(interpretation, relevantContext, originalText);
        return { ...resolved, route: 'llm', provider: llmAdapter.id || 'llm' };
      } catch {
        return {
          status: 'error',
          candidates: [],
          originalText,
          canRetry: true,
          manualFallback: true,
          manualFallbacks: ['precise_edit', 'balance_checkpoint'],
          message: '暂时不能自动整理这句话，原文已经保留。'
        };
      }
    }
  });
}
