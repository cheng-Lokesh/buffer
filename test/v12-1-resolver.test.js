import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARSER_INTERPRETATION_SCHEMA,
  extractExplicitMoneyAmounts,
  resolveNaturalDateExpression,
  resolveRealityParserInterpretation,
  validateParserInterpretation
} from '../src/v12-1-reality-parser.js';

const context = {
  currentDate: '2026-08-25',
  timezone: 'Asia/Shanghai',
  currentBalance: 5000,
  activeConditions: [
    { id: 'salary', name: '工资', type: 'recurring_income', amount: 10000, frequency: 'monthly', nextOccurrence: '2026-08-25' },
    { id: 'rent', name: '房租', type: 'recurring_expense', amount: 1500, frequency: 'monthly', nextOccurrence: '2026-09-01' }
  ],
  dueOccurrences: [
    { id: 'occurrence:salary:2026-08-25', conditionId: 'salary', conditionName: '工资', expectedDate: '2026-08-25', expectedAmount: 10000, direction: 'income' },
    { id: 'occurrence:client-a:2026-08-30', conditionId: 'client-a', conditionName: '外包款', expectedDate: '2026-08-30', expectedAmount: 3000, direction: 'income' },
    { id: 'occurrence:deposit:2026-09-02', conditionId: 'deposit', conditionName: '押金', expectedDate: '2026-09-02', expectedAmount: 3000, direction: 'income' }
  ]
};

const item = (overrides = {}) => ({
  semanticType: 'income_received',
  direction: 'income',
  amount: 8500,
  amountCertainty: 'exact',
  dateExpression: '今天',
  resolvedDate: '2026-08-25',
  frequency: null,
  nameHint: '工资',
  referenceHint: '工资',
  realityStatus: 'actual',
  evidenceText: '工资今天实际到了8500',
  ...overrides
});

const interpretation = (items, overrides = {}) => ({
  status: 'candidates',
  items,
  scenarioItems: [],
  clarification: null,
  ...overrides
});

test('published schema is strict and never exposes business write tools or ids', () => {
  const text = JSON.stringify(PARSER_INTERPRETATION_SCHEMA);
  assert.match(text, /additionalProperties/);
  assert.doesNotMatch(text, /conditionId|occurrenceId|commitRealityCapture|tool_call|localStorage/);
});

test('strict validation rejects unknown fields, invalid dates, invented ids and imprecise exact amounts', () => {
  const cases = [
    { ...interpretation([item()]), execute: 'commit' },
    interpretation([{ ...item(), conditionId: 'invented' }]),
    interpretation([item({ resolvedDate: '2026-02-30' })]),
    interpretation([item({ amount: -1 })]),
    interpretation([item({ amount: 3000, amountCertainty: 'approximate' })])
  ];
  for (const value of cases) assert.equal(validateParserInterpretation(value).valid, false);
});

test('program resolves Chinese relative dates instead of trusting model calendar arithmetic', () => {
  assert.equal(resolveNaturalDateExpression('这周五', '2026-08-25'), '2026-08-28');
  assert.equal(resolveNaturalDateExpression('下周一', '2026-08-25'), '2026-08-31');
  assert.equal(resolveNaturalDateExpression('月底', '2026-08-25'), '2026-08-31');
  assert.equal(resolveNaturalDateExpression('下个月15号', '2026-08-25'), '2026-09-15');
  assert.equal(resolveNaturalDateExpression('三天后', '2026-08-25'), '2026-08-28');
  assert.equal(resolveNaturalDateExpression('后天', '2026-08-25'), '2026-08-27');
  assert.equal(resolveNaturalDateExpression('三天前', '2026-08-25'), '2026-08-22');
  assert.equal(resolveNaturalDateExpression('下月底', '2026-12-25'), '2027-01-31');
  assert.equal(resolveNaturalDateExpression('下个月15号', '2026-12-25'), '2027-01-15');
  assert.equal(resolveNaturalDateExpression('1月2日', '2026-08-25'), '2027-01-02');
  assert.equal(resolveNaturalDateExpression('随便哪天', 'bad-date'), null);

  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'occurrence_delayed', amount: 3000, dateExpression: '这周五', resolvedDate: '2026-08-27', referenceHint: '外包款', nameHint: '外包款', realityStatus: 'known_future', evidenceText: '外包款改到这周五' })
  ]), context);
  assert.equal(result.candidates[0].actualDate, '2026-08-28');
});

test('explicit name match wins over same-amount occurrences', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'occurrence_delayed', amount: 3000, dateExpression: '周五', resolvedDate: '2026-08-28', referenceHint: '外包款那笔', nameHint: '外包款', realityStatus: 'known_future', evidenceText: '外包款那笔周五再给' })
  ]), context);
  assert.equal(result.status, 'candidates');
  assert.equal(result.candidates[0].occurrenceId, 'occurrence:client-a:2026-08-30');
});

test('pending income and continuing salary statements cannot become received-income Reality', () => {
  const pending = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'occurrence_not_occurred', amount: 10000, referenceHint: '工资', nameHint: '工资', evidenceText: '工资还没到账' })
  ]), context);
  assert.equal(pending.candidates.length, 0);

  const continuing = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'income_received', amount: 10000, referenceHint: '工资', nameHint: '工资', evidenceText: '没有取消工资，还是照常发' })
  ]), context);
  assert.equal(continuing.candidates.length, 0);
  assert.equal(continuing.clarifications.length, 1);
});

test('program blocks a provider amount that is contradicted by its evidence span', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'occurrence_amount_change', amount: 1500, referenceHint: '工资', nameHint: '工资', evidenceText: '这次工资只有8500' })
  ]), context);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.clarifications.length, 1);
});

test('program recovers exact Arabic and colloquial Chinese amounts from evidence', () => {
  assert.deepEqual(extractExplicitMoneyAmounts('客户转了一万二'), [12000]);
  assert.deepEqual(extractExplicitMoneyAmounts('平台结算2万5'), [25000]);
  assert.deepEqual(extractExplicitMoneyAmounts('报销到账1.2万'), [12000]);
  assert.deepEqual(extractExplicitMoneyAmounts('房东扣了一千五'), [1500]);

  const result = resolveRealityParserInterpretation(interpretation([
    item({ amount: null, amountCertainty: 'exact', referenceHint: '客户', nameHint: '客户款', evidenceText: '客户转了一万二' })
  ]), { ...context, dueOccurrences: [] }, '客户转了一万二');
  assert.equal(result.candidates[0].amount, 12000);

  const unknownCertainty = resolveRealityParserInterpretation(interpretation([
    item({ amount: null, amountCertainty: 'unknown', referenceHint: '客户', nameHint: '客户款', evidenceText: '客户转了一万二' })
  ]), { ...context, dueOccurrences: [] }, '客户转了一万二');
  assert.equal(unknownCertainty.candidates[0].amount, 12000);

  const wrongApproximateLabel = resolveRealityParserInterpretation(interpretation([
    item({ amount: null, amountCertainty: 'approximate', referenceHint: '客户', nameHint: '客户款', evidenceText: '平台结算2万5' })
  ]), { ...context, dueOccurrences: [] }, '平台结算2万5');
  assert.equal(wrongApproximateLabel.candidates[0].amount, 25000);
});

test('strong end-of-income language corrects a loose recurring-change semantic', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'recurring_change', amount: null, amountCertainty: 'unknown', referenceHint: '这份工作', nameHint: '工作', resolvedDate: '2026-09-01', evidenceText: '这份工作不干了，下个月开始没有工资' })
  ]), context, '这份工作不干了，下个月开始没有工资');
  assert.equal(result.candidates[0].type, 'condition_end');
  assert.equal(result.candidates[0].conditionId, 'salary');
});

test('explicit end-of-income language recovers a unique condition even if provider returns unsupported', () => {
  const result = resolveRealityParserInterpretation(interpretation([], { status: 'unsupported' }), context, '这份工作不干了，下个月开始没有工资');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].type, 'condition_end');
  assert.equal(result.candidates[0].conditionId, 'salary');
});

test('generic future semantic with explicit prior-occurrence language resolves to that occurrence', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'future_income', amount: 3000, referenceHint: '外包款那笔', nameHint: '外包款', resolvedDate: '2026-08-28', realityStatus: 'known_future', evidenceText: '外包款那笔客户说周五再给' })
  ]), context, '同样是3000，我指的是外包款那笔，客户说周五再给');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].type, 'existing_occurrence_date_change');
  assert.equal(result.candidates[0].occurrenceId, 'occurrence:client-a:2026-08-30');
});

test('a missed hypothetical clause is retained as scenario and never Reality', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'expense_paid', direction: 'expense', amount: 1500, referenceHint: '房租', nameHint: '房租', evidenceText: '这月房租已经交了' })
  ]), {
    ...context,
    dueOccurrences: [...context.dueOccurrences, { id: 'occurrence:rent:2026-08-25', conditionId: 'rent', conditionName: '房租', expectedDate: '2026-08-25', expectedAmount: 1500, direction: 'expense' }]
  }, '这月房租已经交了，以后如果能免租就好了。');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.scenarioItems.length, 1);
  assert.equal(result.scenarioItems[0].realityStatus, 'scenario');
});

test('a provider item extracted from an explicit scenario clause can never become Reality', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'expense_paid', direction: 'expense', amount: 1500, referenceHint: '房租', nameHint: '房租', evidenceText: '这月房租已经交了' }),
    item({ semanticType: 'occurrence_not_occurred', direction: 'expense', amount: 1500, referenceHint: '房租', nameHint: '房租', evidenceText: '以后如果能免租', realityStatus: 'actual' })
  ], {
    status: 'partial',
    scenarioItems: [item({ semanticType: 'expense_not_required', direction: 'expense', amount: null, amountCertainty: 'unknown', realityStatus: 'scenario', evidenceText: '以后如果能免租' })]
  }), {
    ...context,
    dueOccurrences: [...context.dueOccurrences, { id: 'occurrence:rent:2026-08-25', conditionId: 'rent', conditionName: '房租', expectedDate: '2026-08-25', expectedAmount: 1500, direction: 'expense' }]
  }, '这月房租已经交了，以后如果能免租就好了。');
  assert.deepEqual(result.candidates.map((entry) => entry.type), ['existing_occurrence_confirmation']);
  assert.equal(result.scenarioItems.length, 1);
});

test('an explicitly confirmed occurrence delay overrides a provider uncertain label', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'occurrence_delayed', direction: 'income', amount: null, amountCertainty: 'unknown', dateExpression: '这周五', referenceHint: '那笔3000', nameHint: '客户款', resolvedDate: '2026-08-28', realityStatus: 'uncertain', evidenceText: '客户确认那笔改到这周五给' })
  ], { status: 'partial' }), context, '客户确认那笔3000改到这周五给。');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].type, 'existing_occurrence_date_change');
  assert.equal(result.candidates[0].occurrenceId, 'occurrence:client-a:2026-08-30');
  assert.equal(result.candidates[0].actualDate, '2026-08-28');
});

test('a model that returns only the scenario cannot drop an explicit unique due-occurrence confirmation', () => {
  const scenarioOnly = interpretation([], {
    status: 'scenario',
    scenarioItems: [item({ semanticType: 'expense_not_required', direction: 'expense', amount: null, amountCertainty: 'unknown', realityStatus: 'scenario', evidenceText: '以后如果能免租' })]
  });
  const result = resolveRealityParserInterpretation(scenarioOnly, {
    ...context,
    dueOccurrences: [...context.dueOccurrences, { id: 'occurrence:rent:2026-08-25', conditionId: 'rent', conditionName: '房租', expectedDate: '2026-08-25', expectedAmount: 1500, direction: 'expense' }]
  }, '这月房租已经交了，以后如果能免租就好了。');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].type, 'existing_occurrence_confirmation');
  assert.equal(result.candidates[0].occurrenceId, 'occurrence:rent:2026-08-25');
  assert.equal(result.scenarioItems.length, 1);
});

test('due-occurrence recovery never overrides negation or uncertainty', () => {
  const salaryNegated = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'income_not_received', amount: null, amountCertainty: 'unknown', referenceHint: '工资', nameHint: '工资', evidenceText: '工资还没到账' })
  ]), context, '工资还没到账');
  assert.equal(salaryNegated.candidates.length, 0);

  const uncertainDeposit = resolveRealityParserInterpretation(interpretation([], { status: 'unsupported' }), context, '押金应该快退了');
  assert.equal(uncertainDeposit.candidates.length, 0);
  assert.equal(uncertainDeposit.status, 'clarification');
});

test('an explicit pure scenario remains scenario even if the provider also asks a question', () => {
  const result = resolveRealityParserInterpretation(interpretation([], {
    status: 'scenario',
    scenarioItems: [item({ semanticType: 'condition_end', amount: null, amountCertainty: 'unknown', realityStatus: 'scenario', evidenceText: '万一我辞职了' })],
    clarification: { question: '要确认吗？', itemIndexes: [] }
  }), context, '万一我辞职了还能撑多久？');
  assert.equal(result.status, 'scenario');
  assert.equal(result.candidates.length, 0);
});

test('explicit uncertainty language overrides an overconfident known-future label', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'future_income', amount: 3000, referenceHint: '客户', nameHint: '客户款', resolvedDate: '2026-08-28', realityStatus: 'known_future', evidenceText: '客户3000可能周五给' })
  ]), context, '客户3000可能周五给');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.clarifications.length, 1);
});

test('one item uses its own evidence before other clauses when matching occurrences', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'income_received', amount: 1300, referenceHint: '押金', nameHint: '押金', evidenceText: '押金1300已经退了' }),
    item({ semanticType: 'future_income', amount: 3000, referenceHint: '客户', nameHint: '客户款', resolvedDate: '2026-08-28', realityStatus: 'uncertain', evidenceText: '客户3000可能周五给' })
  ], { status: 'partial' }), context, '押金1300已经退了，客户3000可能周五给');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].occurrenceId, 'occurrence:deposit:2026-09-02');
  assert.equal(result.clarifications.length, 1);
});

test('an unmatched item never borrows a sibling clause occurrence from the full sentence', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'expense_paid', direction: 'expense', amount: 1500, referenceHint: '房租', nameHint: '房租', evidenceText: '今天房租1500' }),
    item({ semanticType: 'income_received', direction: 'income', amount: 1300, referenceHint: '押金', nameHint: '押金', evidenceText: '押金退了1300' })
  ]), {
    ...context,
    dueOccurrences: [{ id: 'occurrence:rent:2026-08-25', conditionId: 'rent', conditionName: '房租', expectedDate: '2026-08-25', expectedAmount: 1500, direction: 'expense' }]
  }, '今天房租1500，押金退了1300，现在4680');
  assert.deepEqual(result.candidates.map((entry) => entry.type), ['existing_occurrence_confirmation', 'one_off_income']);
  assert.equal(result.candidates[1].amount, 1300);
});

test('an exact transfer phrase without 了 is still an actual received-income cue', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'income_received', amount: 2000, referenceHint: '妈妈转账', nameHint: '家人转账', evidenceText: '我妈刚转两千' })
  ]), { ...context, dueOccurrences: [] }, '我妈刚转两千，现在总共有6700');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].type, 'one_off_income');
  assert.equal(result.candidates[0].amount, 2000);
});

test('duplicate provider items for the same occurrence become one confirmation candidate', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'expense_paid', direction: 'expense', amount: 1700, referenceHint: '房租', nameHint: '房租', evidenceText: '这次房租实际扣了1700' }),
    item({ semanticType: 'occurrence_amount_change', direction: 'expense', amount: 1700, referenceHint: '房租', nameHint: '房租', evidenceText: '这次房租实际扣了1700' })
  ]), {
    ...context,
    dueOccurrences: [...context.dueOccurrences, { id: 'occurrence:rent:2026-08-25', conditionId: 'rent', conditionName: '房租', expectedDate: '2026-08-25', expectedAmount: 1500, direction: 'expense' }]
  }, '这次房租实际扣了1700');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].type, 'existing_occurrence_amount_change');
});

test('an explicit actual-only amount statement updates the unique due occurrence without an arrival verb', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'income_received', amount: 8500, referenceHint: '那份工资', nameHint: '工资', evidenceText: '那份工资实际只有8500' })
  ]), context, '那份工资实际只有8500');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].type, 'existing_occurrence_amount_change');
  assert.equal(result.candidates[0].amount, 8500);
});

test('a negated expense obligation can still resolve as this occurrence not happening', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'expense_not_required', direction: 'expense', amount: 1500, referenceHint: '房租', nameHint: '房租', realityStatus: 'negated', evidenceText: '这个月房租不用交' })
  ]), {
    ...context,
    dueOccurrences: [...context.dueOccurrences, { id: 'occurrence:rent:2026-08-25', conditionId: 'rent', conditionName: '房租', expectedDate: '2026-08-25', expectedAmount: 1500, direction: 'expense' }]
  });
  assert.equal(result.candidates[0].type, 'existing_occurrence_not_occurred');
});

test('unique occurrence reference is resolved to a real id by code', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'income_received', amount: 8500, referenceHint: '工资', nameHint: '工资' })
  ]), context);
  assert.equal(result.status, 'candidates');
  assert.equal(result.candidates[0].type, 'existing_occurrence_amount_change');
  assert.equal(result.candidates[0].occurrenceId, 'occurrence:salary:2026-08-25');
  assert.equal(result.candidates[0].amount, 8500);
});

test('ambiguous reference asks one clarification and never guesses an id', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'occurrence_delayed', amount: 3000, resolvedDate: '2026-08-29', referenceHint: '那笔3000', nameHint: null, realityStatus: 'known_future', evidenceText: '那笔3000改到周五' })
  ]), context);
  assert.equal(result.status, 'clarification');
  assert.deepEqual(result.candidates, []);
  assert.equal(result.clarifications.length, 1);
  assert.equal(result.clarifications[0].choices.length, 2);
});

test('partial success preserves certain facts while clarifying only the uncertain item', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'income_received', amount: 1300, referenceHint: '押金', nameHint: '押金返还', evidenceText: '押金1300已经退了' }),
    item({ semanticType: 'future_income', amount: 3000, amountCertainty: 'exact', resolvedDate: '2026-08-29', referenceHint: '客户', nameHint: '客户款', realityStatus: 'uncertain', evidenceText: '客户3000可能周五给' })
  ], { status: 'partial', clarification: { question: '客户款是否已经确定？', itemIndexes: [1] } }), context);
  assert.equal(result.status, 'partial');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].type, 'existing_occurrence_amount_change');
  assert.equal(result.candidates[0].occurrenceId, 'occurrence:deposit:2026-09-02');
  assert.equal(result.clarifications.length, 1);
});

test('scenario and negation can never become positive Reality candidates', () => {
  const mixed = resolveRealityParserInterpretation(interpretation([
    item({ amount: 8500, evidenceText: '工资8500到了' })
  ], { scenarioItems: [item({ semanticType: 'recurring_change', amount: 12000, realityStatus: 'scenario', evidenceText: '如果以后涨到12000' })] }), context);
  assert.equal(mixed.candidates.length, 1);
  assert.equal(mixed.scenarioItems.length, 1);

  for (const semanticType of ['income_not_received', 'fact_negated']) {
    const negated = resolveRealityParserInterpretation(interpretation([
      item({ semanticType, amount: null, amountCertainty: 'unknown', realityStatus: 'actual', evidenceText: '工资还没到账' })
    ]), context);
    assert.equal(negated.candidates.length, 0);
  }
});

test('occurrence change and long-term condition change remain distinct', () => {
  const occurrence = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'occurrence_amount_change', amount: 8500, referenceHint: '工资', nameHint: '工资' })
  ]), context);
  assert.equal(occurrence.candidates[0].type, 'existing_occurrence_amount_change');

  const condition = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'recurring_change', amount: 8500, referenceHint: '工资', nameHint: '工资', realityStatus: 'known_future', resolvedDate: '2026-09-01' })
  ]), context);
  assert.equal(condition.candidates[0].type, 'condition_update');
  assert.equal(condition.candidates[0].conditionId, 'salary');
});

test('final balance anchor is retained alongside other resolved facts', () => {
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'expense_paid', direction: 'expense', amount: 1500, nameHint: '房租', referenceHint: '房租', evidenceText: '房东扣了1500' }),
    item({ semanticType: 'income_received', amount: 1300, nameHint: '押金返还', referenceHint: '押金', evidenceText: '押金退了1300' }),
    item({ semanticType: 'balance_confirmation', direction: 'balance', amount: 4680, nameHint: null, referenceHint: null, evidenceText: '现在4680' })
  ]), context);
  assert.deepEqual(result.candidates.map((entry) => entry.type), ['one_off_expense', 'existing_occurrence_amount_change', 'balance_confirmation']);
});

test('recurring starts, pauses and future one-offs cover deterministic mapper branches', () => {
  const recurring = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'recurring_income_started', direction: 'income', amount: 12000, frequency: 'monthly', realityStatus: 'known_future', nameHint: '新工作', referenceHint: '新工作', evidenceText: '新工作每月12000' }),
    item({ semanticType: 'recurring_expense_started', direction: 'expense', amount: 2000, frequency: 'monthly', realityStatus: 'known_future', nameHint: '新房租', referenceHint: '新房租', evidenceText: '新房租每月2000' })
  ]), context);
  assert.deepEqual(recurring.candidates.map((entry) => entry.type), ['recurring_income', 'recurring_expense']);

  const pause = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'condition_pause', amount: null, amountCertainty: 'unknown', referenceHint: '工资', nameHint: '工资', evidenceText: '工资暂停' })
  ]), context);
  assert.equal(pause.candidates[0].type, 'condition_pause');

  const incompleteRecurring = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'recurring_income_started', amount: null, amountCertainty: 'unknown', frequency: null, nameHint: null, referenceHint: null, evidenceText: '新增固定收入' })
  ]), context);
  assert.equal(incompleteRecurring.status, 'clarification');

  const future = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'future_income', direction: 'income', amount: 500, resolvedDate: '2026-08-28', realityStatus: 'known_future', nameHint: '退款', referenceHint: '退款', evidenceText: '退款三天后退500' }),
    item({ semanticType: 'future_expense', direction: 'expense', amount: 600, resolvedDate: '2026-08-29', realityStatus: 'known_future', nameHint: '维修', referenceHint: '维修', evidenceText: '维修周六扣600' })
  ]), { ...context, dueOccurrences: [] });
  assert.deepEqual(future.candidates.map((entry) => entry.type), ['known_future_income', 'known_future_expense']);

  const incompleteFuture = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'future_income', amount: null, amountCertainty: 'unknown', resolvedDate: null, realityStatus: 'known_future', nameHint: null, referenceHint: null, evidenceText: '会有一笔钱' })
  ]), context);
  assert.equal(incompleteFuture.status, 'clarification');
});

test('known future facts resolve matching occurrences as confirmation or amount change', () => {
  const confirmed = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'future_income', amount: 3000, dateExpression: '8月30日', resolvedDate: '2026-08-30', realityStatus: 'known_future', referenceHint: '外包款', nameHint: '外包款', evidenceText: '那笔外包款按原计划8月30日给3000' })
  ]), context, '那笔外包款按原计划给3000');
  assert.equal(confirmed.candidates[0].type, 'existing_occurrence_confirmation');

  const changed = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'future_income', amount: 2800, dateExpression: '8月30日', resolvedDate: '2026-08-30', realityStatus: 'known_future', referenceHint: '外包款', nameHint: '外包款', evidenceText: '那笔外包款8月30日改成2800' })
  ]), context, '那笔外包款改成2800');
  assert.equal(changed.candidates[0].type, 'existing_occurrence_amount_change');
});

test('code recovers clause-local amounts when the model omits both facts in a multi-fact sentence', () => {
  const source = '我妈刚转两千，之前多少忘了，反正现在总共有6700。';
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'income_received', direction: 'income', amount: null, amountCertainty: 'unknown', nameHint: null, referenceHint: null, evidenceText: source }),
    item({ semanticType: 'balance_confirmation', direction: 'balance', amount: null, amountCertainty: 'unknown', nameHint: null, referenceHint: null, evidenceText: source })
  ]), context, source);
  assert.deepEqual(result.candidates.map((entry) => [entry.type, entry.amount]), [
    ['one_off_income', 2000],
    ['balance_confirmation', 6700]
  ]);
});

test('full source customer wording disambiguates a delayed occurrence when model evidence only says that amount', () => {
  const source = '客户确认那笔3000改到这周五给。';
  const result = resolveRealityParserInterpretation(interpretation([
    item({ semanticType: 'occurrence_delayed', direction: 'income', amount: 3000, resolvedDate: '2026-08-28', realityStatus: 'known_future', nameHint: null, referenceHint: '那笔3000', evidenceText: '那笔3000改到这周五给' })
  ]), context, source);
  assert.equal(result.status, 'candidates');
  assert.equal(result.candidates[0].type, 'existing_occurrence_date_change');
  assert.equal(result.candidates[0].occurrenceId, 'occurrence:client-a:2026-08-30');
});
