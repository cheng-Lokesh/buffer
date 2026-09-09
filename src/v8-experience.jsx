import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Eye,
  History,
  List,
  Plus,
  ReceiptText,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import {
  buildCashRealityProjection,
  buildNowSummary,
  buildTemporalMemorySummary,
  createScenarioPatch,
  describeScenarioOperation,
  explainProjectionPoint,
  runScenarioPatch
} from './v8-cash-reality.js';
import { buildCashChartScale, buildFutureChartAnnotations, buildTimeAxisTicks, chartPath } from './v9-chart-scale.js';
import { conditionDisplayName, conditionScheduleText } from './v9-condition-identity.js';
import { buildFutureContextCatalog, resolveFutureContext } from './v10-future-context.js';
import { buildHumanScenarioOperations, createHumanScenarioDraft, humanScenarioIntentOptions } from './v10-scenario-composer.js';
import { buildConditionMaintenanceView } from './v10-reality-maintenance.js';
import { buildDenseEventTrack, filterConditionMaintenance } from './v10-density-scale.js';
import { buildConditionReadingGroups, buildHumanRecordTimeline } from './v11-experience-compression.js';
import { RealityCapturePanel } from './v12-reality-capture-panel.jsx';

const MONEY = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 });
const CONDITION_LABELS = {
  balance: '现金起点',
  reserve: '保留边界',
  daily_floor: '最低日常支出',
  recurring_income: '固定收入',
  recurring_expense: '固定支出',
  known_event: '未来一次事项'
};
const BASE_FACT_LABELS = { balance: '现金起点', reserve: '保留边界', daily_floor: '最低日常支出', 'daily-floor': '最低日常支出' };

const money = (cents) => cents == null ? '待确认' : MONEY.format(cents / 100);
const daysLabel = (summary) => summary.supportDays == null ? '暂无法判断' : `${summary.supportIsLowerBound ? '至少 ' : ''}${summary.supportDays} 天`;
const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '预测范围外';
const missingBaseFacts = (projection) => [...new Set((projection?.issues || []).map((issue) => BASE_FACT_LABELS[issue.conditionId]).filter(Boolean))];

function useMobileLayout() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

function V9DialogSurface({ className, label, onClose, children }) {
  const surfaceRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const surface = surfaceRef.current;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const frame = window.requestAnimationFrame(() => surface?.querySelector('[data-dialog-close], input, select, button')?.focus());
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !surface) return;
      const focusable = [...surface.querySelectorAll(focusableSelector)].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <aside ref={surfaceRef} className={className} role="dialog" aria-label={label} aria-modal="true">{children}</aside>;
}

function pointPosition(points, point, scale, width = 800, height = 320) {
  const index = points.indexOf(point);
  return {
    left: `${(scale.xForIndex(index, points.length) / width) * 100}%`,
    top: `${(scale.yForValue(point.closingBalanceCents) / height) * 100}%`
  };
}

function V8Metric({ label, value, note, tone = '' }) {
  return <article className={`v8-metric ${tone}`} data-skin-region="card"><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</article>;
}

function V8Now({ projection, summary, onNavigate, onOpenRealityCapture }) {
  const confidence = projection.valid ? '由已确认条件计算' : '条件需要确认';
  const dueCount = projection.dueOccurrences?.length || 0;
  const missingFacts = missingBaseFacts(projection);
  const confirmedAt = projection.lastConfirmedReality?.confirmedAt
    ? new Date(projection.lastConfirmedReality.confirmedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '时间尚未确认';
  const touchLabel = summary.reserveTouchDate ? dateLabel(summary.reserveTouchDate) : `${projection.horizonDays || 90} 天内未触及`;
  return <section className="v8-space v8-now v11-now" data-v8-space="now">
    <header className="v8-space-heading v11-space-heading">
      <span><Eye size={15} /> 我的当前情况</span>
      <h1 id="workspace-title">我的现金现在在哪里</h1>
    </header>

    <section className="v11-now-answer" data-v11-level="answer" data-skin-region="hero" aria-label="当前现金答案">
      <div className="v11-now-copy">
        <span className="v8-truth-badge"><ShieldCheck size={15} /> {confidence}</span>
        <div className="v11-primary-result"><small>当前余额</small><strong>{money(summary.balanceCents)}</strong></div>
        <div className="v11-now-outlook">
          <span><small>可支撑</small><b>{daysLabel(summary)}</b></span>
          <span><small>预计触及保留边界</small><b>{touchLabel}</b></span>
        </div>
        <div className="v11-now-secondary" data-v11-level="reason">
          <span>截至 {confirmedAt} 确认</span>
          <span>保留边界 {money(summary.reserveCents)}</span>
        </div>
        <div className="v8-now-actions">
          <button type="button" className="v8-primary-action" onClick={() => onNavigate('future')}>查看未来 <ArrowRight size={17} /></button>
          <button type="button" className="v8-quiet-action" onClick={onOpenRealityCapture}>现实有变化</button>
        </div>
      </div>
      <div className="v8-now-art" aria-hidden="true"><span>现在</span><i /><i /><i /><small>现实位置</small></div>
    </section>

    {dueCount ? <section className="v10-now-temporal has-due" data-v11-level="reason" aria-label="待核对事项">
      <div><CalendarDays size={17} /><span>待核对</span><strong>{dueCount} 项原预计事项日期已到</strong><small>当前余额仍是最后确认值。</small></div>
      <button type="button" onClick={onOpenRealityCapture}>查看待核对 <ChevronRight size={16} /></button>
    </section> : null}

    {!projection.valid ? <section className="v10-missing-facts" data-v11-level="reason" aria-label="缺少的基础事实"><div><span>尚未确认</span><strong>目前还缺{missingFacts.length ? missingFacts.join('、') : '可用于预测的基础事实'}</strong><p>缺少这些事实，因此暂时无法生成未来预测。已确认的内容不会丢失，也不会自动补成 ¥0。</p></div><button type="button" onClick={() => onNavigate('conditions')}>补充基础事实 <ChevronRight size={16} /></button></section> : null}

    <details className="v11-now-details" data-v11-level="data">
      <summary><List size={16} /> 查看现金组成</summary>
      <dl>
        <div><dt>可动用现金</dt><dd>{money(summary.usableCashCents)}</dd></div>
        <div><dt>保留边界</dt><dd>{money(summary.reserveCents)}</dd></div>
        <div><dt>最低日常支出</dt><dd>{money(summary.minimumDailySpendCents)}</dd></div>
      </dl>
    </details>
  </section>;
}

const OCCURRENCE_STATUS_LABELS = { upcoming: '预计', due: '待核对', resolved: '已核对' };
const RECONCILIATION_LABELS = {
  as_expected: '如期发生',
  amount_changed: '金额不同',
  date_changed: '日期不同',
  did_not_occur: '这次未发生'
};

function ReconciliationInspector({ occurrence, mobileOpen, onClose, onReconcile, onSelectCondition, className = '' }) {
  const [result, setResult] = useState('as_expected');
  const [actualAmount, setActualAmount] = useState('');
  const [actualDate, setActualDate] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setResult('as_expected');
    setActualAmount(occurrence ? String(occurrence.expectedAmount) : '');
    setActualDate(occurrence?.expectedDate || '');
    setError('');
  }, [occurrence?.id]);
  if (!occurrence) return null;
  const submit = (event) => {
    event.preventDefault();
    try {
      const input = { result };
      if (result === 'amount_changed') input.actualAmount = Number(actualAmount);
      if (result === 'date_changed') {
        input.actualDate = actualDate;
        input.actualAmount = Number(actualAmount);
      }
      onReconcile(occurrence.id, input);
      onClose();
    } catch (failure) { setError(failure.message); }
  };
  return <aside className={`v8-inspector v10-reconciliation ${className} ${mobileOpen ? 'is-mobile-open' : ''}`} role={mobileOpen ? 'dialog' : 'complementary'} aria-modal={mobileOpen ? 'true' : undefined} aria-label="预计事项核对">
    <button type="button" className="v8-sheet-close" aria-label="关闭预计事项" onClick={onClose}><X size={18} /></button>
    <header><div><span>{OCCURRENCE_STATUS_LABELS[occurrence.status]} · 预计事项</span><h2>{occurrence.conditionName}</h2></div><b>{MONEY.format(occurrence.expectedAmount)}</b></header>
    <dl className="v10-occurrence-facts"><div><dt>原预计日期</dt><dd>{occurrence.expectedDate}</dd></div><div><dt>来源条件</dt><dd>{occurrence.conditionName}</dd></div></dl>
    <button type="button" className="v10-context-link" onClick={() => onSelectCondition?.(occurrence.conditionId)}>查看来源条件 <ChevronRight size={15} /></button>
    {occurrence.status === 'due' ? <form onSubmit={submit}>
      <fieldset><legend>实际发生情况</legend>{Object.entries(RECONCILIATION_LABELS).map(([value, label]) => <label key={value}><input type="radio" name="reconciliation-result" value={value} checked={result === value} onChange={() => setResult(value)} /><span>{label}</span></label>)}</fieldset>
      {result === 'amount_changed' || result === 'date_changed' ? <label>实际金额<input aria-label="实际金额" type="number" min="0" step="0.01" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} /></label> : null}
      {result === 'date_changed' ? <label>实际日期<input aria-label="实际日期" type="date" value={actualDate} onChange={(event) => setActualDate(event.target.value)} /></label> : null}
      <p><ShieldCheck size={14} /> 只核对这一次，不会修改后续固定条件，也不会自动改写最后确认余额。</p>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" className="v8-primary-action"><Check size={16} /> 保存核对结果</button>
    </form> : occurrence.status === 'resolved' ? <section className="v10-resolution-summary"><strong>{RECONCILIATION_LABELS[occurrence.resolution?.result] || '已核对'}</strong><p>原预计已保留，现实只使用本人确认的结果。</p></section> : <section className="v10-resolution-summary"><strong>日期还没到</strong><p>这仍是预计，不是已经发生的现实。</p></section>}
  </aside>;
}

function ProjectionInspector({ explanation, mobileOpen, onClose, className = '' }) {
  const closeButtonRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  if (!explanation) return null;
  const equation = explanation.equation;
  const dailyChangeCents = equation.closingBalanceCents - equation.openingBalanceCents;
  const visibleDrivers = explanation.drivers.slice(0, 3);
  return <aside className={`v8-inspector ${className} ${mobileOpen ? 'is-mobile-open' : ''}`} role={mobileOpen ? 'dialog' : 'complementary'} aria-modal={mobileOpen ? 'true' : undefined} aria-label="日期说明" aria-live="polite">
    <button ref={closeButtonRef} type="button" className="v8-sheet-close" aria-label="关闭日期说明" onClick={onClose}><X size={18} /></button>
    <header><div><span>预计 · 选中日期</span><h2>{explanation.date}</h2></div><b>{money(equation.closingBalanceCents)}</b></header>
    <div className="v11-date-summary" data-v11-level="reason"><span>当天变化<strong>{dailyChangeCents > 0 ? '＋' : dailyChangeCents < 0 ? '−' : ''}{money(Math.abs(dailyChangeCents))}</strong></span><span>预计余额<strong>{money(equation.closingBalanceCents)}</strong></span></div>
    <div className="v9-point-drivers" aria-label="点位变化来源">
      <strong>这一天为什么变化</strong>
      {visibleDrivers.length ? visibleDrivers.map((driver) => <span key={`${driver.evidenceId}:${driver.sourceId}`}><i aria-hidden="true">{driver.direction === 'inflow' ? '＋' : '－'}</i><b>{driver.label}</b><small>{money(driver.amountCents)}</small></span>) : <p>这一天没有新的现金变化。</p>}
    </div>
    <details className="v11-date-calculation" data-v11-level="data">
      <summary>查看这天的完整计算</summary>
      <div className="v8-equation" aria-label="现金点位计算等式">
        <span>期初余额<strong>{money(equation.openingBalanceCents)}</strong></span>
        <i>＋</i><span>确认收入<strong>{money(equation.confirmedInflowsCents)}</strong></span>
        <i>－</i><span>固定支出<strong>{money(equation.recurringOutflowsCents)}</strong></span>
        <i>－</i><span>日常支出<strong>{money(equation.dailyFloorOutflowsCents)}</strong></span>
        <i>＋</i><span>一次事项<strong>{money(equation.oneOffEventsCents)}</strong></span>
        <i>＝</i><span>预计余额<strong>{money(equation.closingBalanceCents)}</strong></span>
      </div>
      <small><ShieldCheck size={14} /> {equation.matches ? '计算已核对' : '需要重新计算'} · {explanation.evidenceIds.length} 条依据</small>
    </details>
  </aside>;
}

function ContextFactInspector({ context, mobileOpen, onClose }) {
  const data = context?.data || {};
  const surfaceClass = `v8-inspector v10-context-inspector ${mobileOpen ? 'is-mobile-open' : ''}`;
  const surfaceProps = { className: surfaceClass, role: mobileOpen ? 'dialog' : 'complementary', 'aria-modal': mobileOpen ? 'true' : undefined };
  if (context.type === 'condition') return <aside {...surfaceProps} aria-label="来源条件">
    <button type="button" className="v8-sheet-close" aria-label="关闭来源条件" onClick={onClose}><X size={18} /></button>
    <header><div><span>已确认条件</span><h2>{conditionDisplayName(data)}</h2></div><b>{MONEY.format(data.amount || 0)}</b></header>
    <dl className="v10-context-facts"><div><dt>条件类型</dt><dd>{CONDITION_LABELS[data.type] || '现实条件'}</dd></div><div><dt>发生方式</dt><dd>{conditionScheduleText(data)}</dd></div><div><dt>当前状态</dt><dd>{data.status === 'paused' ? '已暂停' : '生效中'}</dd></div></dl>
    <footer><ShieldCheck size={14} /> 这是本人确认的现实条件。</footer>
  </aside>;
  if (context.type === 'event') return <aside {...surfaceProps} aria-label="已确认事件">
    <button type="button" className="v8-sheet-close" aria-label="关闭已确认事件" onClick={onClose}><X size={18} /></button>
    <header><div><span>已确认事件</span><h2>{context.label}</h2></div><b>{MONEY.format(data.amount || 0)}</b></header>
    <dl className="v10-context-facts"><div><dt>确认日期</dt><dd>{data.occurredAt}</dd></div><div><dt>现实方向</dt><dd>{data.type === 'income' ? '收入' : '支出'}</dd></div><div><dt>记录状态</dt><dd>已经确认</dd></div></dl>
    <footer><ShieldCheck size={14} /> 这条事实来自本人确认的现实记录。</footer>
  </aside>;
  if (context.type === 'scenario') return <aside {...surfaceProps} aria-label="模拟差异">
    <button type="button" className="v8-sheet-close" aria-label="关闭模拟差异" onClick={onClose}><X size={18} /></button>
    <header><div><span>模拟差异</span><h2>当前预计与本次模拟</h2></div><b>{data.delta?.supportDays == null ? '边界之外' : `${data.delta.supportDays > 0 ? '+' : ''}${data.delta.supportDays} 天`}</b></header>
    <div className="v10-scenario-comparison" aria-label="关键差异"><span>当前预计<strong>{data.baseline?.days ?? `至少 ${data.baseline?.safeDaysLowerBound || 0} 天`}</strong></span><span>本次模拟<strong>{data.scenario?.days ?? `至少 ${data.scenario?.safeDaysLowerBound || 0} 天`}</strong></span><span>关键差异<strong>{money(data.delta?.rangeEndBalanceCents)}</strong></span></div>
    <section className="v10-context-operation-list"><strong>本次修改</strong>{data.operationSummaries?.map((summary, index) => <p key={`${summary}-${index}`}>{index + 1}. {summary}</p>)}</section>
    <footer><ShieldCheck size={14} /> 模拟只用于对照，不会修改现实。</footer>
  </aside>;
  return null;
}

function FutureContextInspector({ context, explanation, mobileOpen, onClose, onReconcile, onSelectCondition }) {
  if (context && context.type === 'date') return <ProjectionInspector explanation={explanation} mobileOpen={mobileOpen} onClose={onClose} className="v10-context-inspector" />;
  if (context && context.type === 'occurrence') return <ReconciliationInspector occurrence={context.data} mobileOpen={mobileOpen} onClose={onClose} onReconcile={onReconcile} onSelectCondition={onSelectCondition} className="v10-context-inspector" />;
  if (context && context.type === 'condition') return <ContextFactInspector context={context} mobileOpen={mobileOpen} onClose={onClose} />;
  if (context && context.type === 'event') return <ContextFactInspector context={context} mobileOpen={mobileOpen} onClose={onClose} />;
  if (context && context.type === 'scenario') return <ContextFactInspector context={context} mobileOpen={mobileOpen} onClose={onClose} />;
  return <ProjectionInspector explanation={explanation} mobileOpen={mobileOpen} onClose={onClose} className="v10-context-inspector" />;
}

function ScenarioIntentChooser({ onChoose }) {
  return <section className="v10-scenario-intents" aria-label="你想改变什么">
    <header><span>添加一个变化</span><h3>你想改变什么？</h3><p>先选一种变化，只填写与它有关的内容。</p></header>
    <div>{humanScenarioIntentOptions().map((intent) => <button type="button" key={intent.id} onClick={() => onChoose(intent.id)}><strong>{intent.label}</strong><small>{intent.note}</small><ChevronRight size={17} /></button>)}</div>
  </section>;
}

function HumanScenarioEditor({ reality, draft, setDraft, onAdd, onCancel }) {
  const update = (patch) => setDraft({ ...draft, ...patch });
  const target = reality.conditions.find((item) => item.id === draft.conditionId);
  const recurringConditions = reality.conditions.filter((item) => ['recurring_income', 'recurring_expense'].includes(item.type));
  const editableConditions = reality.conditions.filter((item) => item.type !== 'known_event');
  const eventConditions = reality.conditions.filter((item) => item.type === 'known_event');
  const setTarget = (conditionId, intent = draft.intent) => {
    const condition = reality.conditions.find((item) => item.id === conditionId);
    if (intent === 'change_event') return update({ conditionId, amount: String(condition?.amount ?? ''), date: condition?.nextOccurrence || '' });
    if (intent === 'change_condition') return update({ conditionId, field: 'amount', value: String(condition?.amount ?? '') });
    update({ conditionId });
  };
  const submit = (event) => { event.preventDefault(); onAdd(draft); };
  const isCashAddition = draft.intent === 'add_income' || draft.intent === 'add_expense';
  return <form className="v10-human-scenario-editor" aria-label="填写模拟变化" onSubmit={submit}>
    <header><button type="button" onClick={onCancel}>返回选择</button><strong>{humanScenarioIntentOptions().find((item) => item.id === draft.intent)?.label}</strong></header>
    {isCashAddition ? <>
      <fieldset><legend>发生方式</legend><label><input type="radio" name="scenario-rhythm" value="once" checked={draft.rhythm === 'once'} onChange={() => update({ rhythm: 'once' })} /><span>一次</span></label><label><input type="radio" name="scenario-rhythm" value="recurring" checked={draft.rhythm === 'recurring'} onChange={() => update({ rhythm: 'recurring' })} /><span>持续</span></label></fieldset>
      <label>名称<input aria-label="变化名称" value={draft.name} maxLength="80" onChange={(event) => update({ name: event.target.value })} placeholder={draft.intent === 'add_income' ? '例如：新固定收入' : '例如：设备维修'} /></label>
      <label>金额<input aria-label="变化金额" type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => update({ amount: event.target.value })} /></label>
      {draft.rhythm === 'recurring' ? <label>发生频率<select aria-label="发生频率" value={draft.frequency} onChange={(event) => update({ frequency: event.target.value })}><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label> : null}
      <label>{draft.rhythm === 'recurring' ? '首次日期' : '发生日期'}<input aria-label={draft.rhythm === 'recurring' ? '首次日期' : '发生日期'} type="date" value={draft.date} onChange={(event) => update({ date: event.target.value })} /></label>
      {draft.rhythm === 'recurring' ? <label>结束日期（可不填）<input aria-label="结束日期" type="date" value={draft.endDate || ''} min={draft.date || undefined} onChange={(event) => update({ endDate: event.target.value })} /></label> : null}
    </> : null}
    {draft.intent === 'change_condition' ? <>
      <label>现实条件<select aria-label="现实条件" value={draft.conditionId} onChange={(event) => setTarget(event.target.value)}>{editableConditions.map((item) => <option value={item.id} key={item.id}>{conditionDisplayName(item)}</option>)}</select></label>
      <label>改变内容<select aria-label="改变内容" value={draft.field} onChange={(event) => update({ field: event.target.value, value: event.target.value === 'frequency' ? target?.frequency || 'monthly' : event.target.value === 'amount' ? String(target?.amount ?? '') : target?.[event.target.value] || '' })}><option value="amount">金额</option>{target && !['balance', 'reserve'].includes(target.type) ? <option value="endDate">结束日期</option> : null}{target && ['recurring_income', 'recurring_expense'].includes(target.type) ? <option value="nextOccurrence">下次日期</option> : null}{target && ['recurring_income', 'recurring_expense'].includes(target.type) ? <option value="frequency">发生频率</option> : null}</select></label>
      {draft.field === 'frequency' ? <label>改成<select aria-label="改成" value={draft.value} onChange={(event) => update({ value: event.target.value })}><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label> : <label>改成<input aria-label="改成" type={['endDate', 'nextOccurrence'].includes(draft.field) ? 'date' : 'number'} min={draft.field === 'amount' ? '0.01' : undefined} step={draft.field === 'amount' ? '0.01' : undefined} value={draft.value} onChange={(event) => update({ value: event.target.value })} /></label>}
    </> : null}
    {draft.intent === 'pause_condition' ? <><label>现实条件<select aria-label="要暂停的条件" value={draft.conditionId} onChange={(event) => setTarget(event.target.value)}>{recurringConditions.map((item) => <option value={item.id} key={item.id}>{conditionDisplayName(item)}</option>)}</select></label><label>从哪天起暂停<input aria-label="暂停日期" type="date" value={draft.effectiveDate} onChange={(event) => update({ effectiveDate: event.target.value })} /></label></> : null}
    {draft.intent === 'change_event' ? <><label>一次事件<select aria-label="要改变的事件" value={draft.conditionId} onChange={(event) => setTarget(event.target.value, 'change_event')}>{eventConditions.map((item) => <option value={item.id} key={item.id}>{conditionDisplayName(item)}</option>)}</select></label><label>金额<input aria-label="事件金额" type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => update({ amount: event.target.value })} /></label><label>日期<input aria-label="事件日期" type="date" value={draft.date} onChange={(event) => update({ date: event.target.value })} /></label></> : null}
    <button type="submit" className="v8-primary-action"><Plus size={16} /> 加入本次模拟</button>
  </form>;
}

function ScenarioComposer({ reality, asOf, rangeDays, result, setResult, initialPatch, onSaveScenarioDraft, onDeleteScenarioDraft, onClose, mobileOpen }) {
  const [operations, setOperations] = useState(initialPatch?.operations || []);
  const [draft, setDraft] = useState(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState(initialPatch?.name || '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(Boolean(initialPatch?.savedAsDraft));
  const surfaceRef = useRef(null);
  const closeButtonRef = useRef(null);
  const requestClose = () => {
    if (operations.length && !saved && !window.confirm('这份模拟还没有保存，确定关闭吗？')) return;
    onClose();
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (!mobileOpen || event.key !== 'Tab' || !surfaceRef.current) return;
      const focusable = [...surfaceRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  const addOperation = (humanDraft) => {
    try {
      const nextOperations = buildHumanScenarioOperations(humanDraft, reality);
      const normalized = createScenarioPatch({ operations: nextOperations }).operations;
      setOperations((current) => [...current, ...normalized]);
      setDraft(null);
      setChooserOpen(false);
      setSaved(false);
      setError('');
    } catch (failure) { setError(failure.message); }
  };
  useEffect(() => {
    if (!operations.length) {
      setResult(null);
      return;
    }
    try {
      const patch = createScenarioPatch({ id: initialPatch?.id, name: scenarioName, baseSnapshotId: `cash-${asOf}`, operations });
      setResult(runScenarioPatch(reality, patch, { asOf, horizonDays: rangeDays }));
      setError('');
    } catch (failure) { setError(failure.message); }
  }, [operations, scenarioName, reality, asOf, rangeDays]);
  return <aside ref={surfaceRef} className={`v8-scenario v11-scenario-mode v11-1-scenario-composer ${mobileOpen ? 'is-mobile-open' : ''}`} role={mobileOpen ? 'dialog' : 'complementary'} aria-modal={mobileOpen ? 'true' : undefined} aria-label="What If 模拟">
    <header><div><span><Sparkles size={15} /> 模拟</span><h2>另一个未来</h2></div><button ref={closeButtonRef} type="button" data-dialog-close aria-label="关闭模拟" onClick={requestClose}><X size={18} /></button></header>
    <p className="v9-scenario-boundary"><ShieldCheck size={15} /> 这里只做对照，不会修改已确认的现实。</p>
    <label className="v10-scenario-name">模拟名称（可不填）<input value={scenarioName} maxLength="40" onChange={(event) => { setScenarioName(event.target.value); setSaved(false); }} placeholder="例如：9月入职" /></label>
    <div className="v10-scenario-composer">
      <section className="v10-scenario-building">
        {draft ? <HumanScenarioEditor reality={reality} draft={draft} setDraft={setDraft} onAdd={addOperation} onCancel={() => { setDraft(null); setChooserOpen(false); setError(''); }} /> : chooserOpen ? <ScenarioIntentChooser onChoose={(intent) => { setDraft(createHumanScenarioDraft(intent, reality, asOf)); setError(''); }} /> : <section className="v11-1-scenario-empty" aria-label="本次变化"><span>本次变化</span><strong>{operations.length ? `${operations.length} 项变化` : '暂无变化'}</strong><button type="button" onClick={() => setChooserOpen(true)}><Plus size={16} /> 添加变化</button></section>}
        {error ? <p className="v9-scenario-error" role="alert">{error}</p> : null}
        <details className="v9-saved-scenarios v11-saved-scenarios" aria-label="已保存的模拟" data-v11-level="data">
          <summary><strong>已保存的模拟</strong><span>{reality.scenarioDrafts.length} 份</span></summary>
          {reality.scenarioDrafts.map((savedDraft) => <article key={savedDraft.id}><div><strong>{savedDraft.name || '未命名模拟'}</strong><small>{savedDraft.operations.length} 项改变 · {savedDraft.createdAt ? new Date(savedDraft.createdAt).toLocaleString('zh-CN') : '本机草稿'}</small></div><button type="button" onClick={() => { setScenarioName(savedDraft.name || ''); setOperations(savedDraft.operations); setResult(runScenarioPatch(reality, savedDraft, { asOf, horizonDays: rangeDays })); setError(''); setSaved(true); setDraft(null); }}>重新打开</button><button type="button" onClick={() => onDeleteScenarioDraft(savedDraft.id)}>删除草稿</button></article>)}
          {reality.scenarioDrafts.length === 0 ? <p>还没有保存的模拟。</p> : null}
        </details>
      </section>
      <aside className="v10-scenario-summary" aria-label="本次模拟改变了什么">
        <header><div><span>本次模拟</span><strong>本次变化</strong></div><b>{operations.length} 项</b></header>
        <section className="v9-operation-list" aria-label="本次变化">
          {operations.map((operation, index) => <article key={`${operation.type}-${index}`}><span>{index + 1}</span><p>{describeScenarioOperation(operation, reality)}</p><button type="button" aria-label={`删除第 ${index + 1} 项模拟变化`} onClick={() => { setOperations((current) => current.filter((_, itemIndex) => itemIndex !== index)); setResult(null); setSaved(false); }}><Trash2 size={15} /></button></article>)}
          {operations.length === 0 ? <p>添加变化后，图中会直接出现模拟轨迹。</p> : null}
        </section>
        {result ? <div className="v8-scenario-result" aria-label="关键差异">
          <span>现实<strong>{result.baseline.reserveTouch.days ?? `至少 ${result.baseline.reserveTouch.safeDaysLowerBound}`} 天</strong><small>范围末 {money(result.baseline.points.at(-1)?.closingBalanceCents)}</small></span>
          <span>模拟<strong>{result.scenario.reserveTouch.days ?? `至少 ${result.scenario.reserveTouch.safeDaysLowerBound}`} 天</strong><small>范围末 {money(result.scenario.points.at(-1)?.closingBalanceCents)}</small></span>
          <span>差异<strong>{result.delta.supportDays == null ? '边界之外' : `${result.delta.supportDays > 0 ? '+' : ''}${result.delta.supportDays} 天`}</strong><small>范围末 {result.delta.rangeEndBalanceCents > 0 ? '+' : ''}{money(result.delta.rangeEndBalanceCents)}</small></span>
        </div> : <p>加入变化并比较后，模拟轨迹会叠加在现实轨迹上。</p>}
      </aside>
    </div>
    <footer>
      <button type="button" onClick={() => { setOperations([]); setDraft(null); setChooserOpen(false); setScenarioName(''); setResult(null); setError(''); setSaved(true); }}><X size={16} /> 清空变化</button>
      <button type="button" disabled={!result} onClick={() => { onSaveScenarioDraft(result.patch); setSaved(true); }}><Save size={16} /> 保存模拟草稿</button>
    </footer>
  </aside>;
}

function V8Future({ reality, asOf, onSaveScenarioDraft, onDeleteScenarioDraft, onReconcileOccurrence, onNavigate }) {
  const mobileLayout = useMobileLayout();
  const futureRef = useRef(null);
  const [rangeDays, setRangeDays] = useState(90);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [scenarioResult, setScenarioResult] = useState(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [selectedContext, setSelectedContext] = useState({ type: 'date', id: asOf });
  const [expandedEventDate, setExpandedEventDate] = useState('');
  const projection = useMemo(() => buildCashRealityProjection(reality, { asOf, horizonDays: rangeDays }), [reality, asOf, rangeDays]);
  const points = projection.points || [];
  const selectedPoint = points[Math.min(selectedIndex, Math.max(0, points.length - 1))];
  const explanation = explainProjectionPoint(projection, selectedPoint?.date);
  const contextCatalog = useMemo(() => buildFutureContextCatalog(reality, projection, scenarioResult), [reality, projection, scenarioResult]);
  const context = resolveFutureContext(contextCatalog, selectedContext, selectedPoint?.date || asOf);
  const scenarioPoints = scenarioResult?.scenario?.points || [];
  const scale = buildCashChartScale({ baselinePoints: points, scenarioPoints, reserveCents: projection.reserveCents, width: 800, height: 320, padding: { top: 32, right: 40, bottom: 42, left: 66 }, tickCount: mobileLayout ? 3 : 5 });
  const scenarioPath = chartPath(scenarioPoints, scale);
  const xTicks = buildTimeAxisTicks(points, scale, 4);
  const annotations = buildFutureChartAnnotations({ points, reserveCents: projection.reserveCents, reserveTouch: projection.reserveTouch });
  const selectPoint = (index, openInspector = true) => {
    const nextIndex = Math.max(0, Math.min(points.length - 1, index));
    setSelectedIndex(nextIndex);
    setSelectedContext({ type: 'date', id: points[nextIndex]?.date || asOf });
    if (openInspector) setInspectorOpen(true);
  };
  const selectPointFromChart = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const plotStart = rect.width * (scale.plotBounds.left / 800);
    const plotWidth = rect.width * ((scale.plotBounds.right - scale.plotBounds.left) / 800);
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - plotStart) / Math.max(1, plotWidth)));
    selectPoint(Math.round(ratio * Math.max(0, points.length - 1)));
  };
  const events = [
    ...contextCatalog.occurrences.map((item) => ({
    id: item.contextId,
    contextId: item.id,
    contextType: 'occurrence',
    date: item.date,
    label: item.label,
    amount: item.data.expectedAmount,
    status: item.data.status,
    domain: item.domain
  })),
    ...contextCatalog.events.map((item) => ({
      id: item.contextId,
      contextId: item.id,
      contextType: 'event',
      date: item.date,
      label: item.label,
      amount: item.data.amount,
      status: 'confirmed',
      domain: item.domain
    }))
  ].filter((item) => item.date).sort((left, right) => left.date.localeCompare(right.date)).map((event) => {
    const matchingIndex = points.findIndex((point) => point.date === event.date);
    const pointIndex = matchingIndex < 0 && event.status === 'due' ? 0 : matchingIndex;
    const edge = pointIndex === 0 ? 'start' : pointIndex === points.length - 1 ? 'end' : 'middle';
    return { ...event, pointIndex, edge, position: pointIndex < 0 ? null : (scale.xForIndex(pointIndex, points.length) / 800) * 100 };
  }).filter((event) => event.position !== null);
  const denseEventTrack = buildDenseEventTrack(events, { maxLabels: rangeDays === 30 ? 10 : 12 });
  const expandedEventCluster = denseEventTrack.groups.find((group) => group.kind === 'cluster' && group.date === expandedEventDate) || null;

  useEffect(() => {
    if (!inspectorOpen) return undefined;
    const previousFocus = document.activeElement;
    const frame = window.requestAnimationFrame(() => futureRef.current?.querySelector('.v11-1-context-rail .v8-sheet-close')?.focus());
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setInspectorOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleEscape);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [inspectorOpen]);

  if (!projection.valid) {
    const missingFacts = missingBaseFacts(projection);
    return <section className="v8-space v8-future" data-v8-space="future"><header className="v8-space-heading"><span>现金未来轨迹</span><h1 id="workspace-title">目前还缺{missingFacts.length ? missingFacts.join('、') : '基础事实'}</h1><p>缺少这些事实，因此暂时无法生成未来预测。已知事实会继续保留。</p></header><button type="button" className="v8-primary-action v10-missing-action" onClick={() => onNavigate('conditions')}>补充基础事实 <ChevronRight size={16} /></button></section>;
  }

  return <section ref={futureRef} className="v8-space v8-future v11-future" data-v8-space="future" data-scenario-mode={scenarioOpen ? 'editing' : scenarioResult ? 'active' : 'reality'}>
    <header className="v8-space-heading v8-heading-row v11-space-heading">
      <div><span><CalendarDays size={15} /> 未来</span><h1 id="workspace-title">现金未来</h1><p>当前条件继续成立时</p></div>
      <div className="v8-range" aria-label="未来范围">{[30, 60, 90].map((days) => <button type="button" aria-pressed={rangeDays === days} onClick={() => { setRangeDays(days); setSelectedIndex(0); setSelectedContext({ type: 'date', id: asOf }); setInspectorOpen(false); setScenarioResult(null); }} key={days}>{days} 天</button>)}</div>
    </header>

    <section className="v11-future-outcomes v11-1-mobile-outcomes" data-v11-level="answer" aria-label="未来关键结果">
      <div className="v11-primary-result"><small>现在</small><strong>{money(points[0]?.closingBalanceCents)}</strong></div>
      <div><small>{rangeDays} 天后</small><strong>{money(points.at(-1)?.closingBalanceCents)}</strong></div>
      <div><small>预计触及保留边界</small><strong>{projection.reserveTouch.date ? dateLabel(projection.reserveTouch.date) : `至少 ${projection.reserveTouch.safeDaysLowerBound} 天`}</strong></div>
    </section>

    <div className="v11-1-secondary-actions" data-v11-level="reason">
      {projection.dueOccurrences.length ? <button type="button" className="v11-due-entry" onClick={() => { const due = contextCatalog.occurrences.find((item) => item.data.status === 'due'); if (due) { setSelectedContext({ type: 'occurrence', id: due.id }); setScenarioOpen(false); setInspectorOpen(true); } }}><span>{projection.dueOccurrences.length} 项原预计事项待核对</span><ChevronRight size={15} /></button> : null}
      {scenarioResult ? <button type="button" className="v8-simulate-entry is-active" onClick={() => { setInspectorOpen(false); setScenarioOpen(true); }}><Sparkles size={16} /> 编辑模拟</button> : <button type="button" className="v8-simulate-entry" aria-expanded={scenarioOpen} onClick={() => { setInspectorOpen(false); setScenarioOpen(true); }}><Sparkles size={16} /> 开始模拟</button>}
      {scenarioResult ? <button type="button" className="v11-exit-scenario" onClick={() => { setScenarioResult(null); setScenarioOpen(false); setInspectorOpen(false); }}>退出模拟</button> : null}
    </div>

    <div className={`v8-future-layout v11-1-future-workspace ${inspectorOpen ? 'has-context' : ''} ${scenarioOpen ? 'has-composer' : ''}`}>
      <section className="v8-chart-panel v11-future-canvas" data-v11-level="answer" aria-label="未来现金图表">
        <div className="v8-chart" onClick={selectPointFromChart}>
          <svg viewBox="0 0 800 320" role="img" aria-label={`从 ${asOf} 开始的 ${rangeDays} 天现金轨迹`} preserveAspectRatio="none">
            {scale.ticks.map((tick, index) => <line className="v9-y-grid" data-grid-priority={index === 0 || index === scale.ticks.length - 1 ? 'edge' : 'normal'} key={tick.value} x1={scale.plotBounds.left} x2={scale.plotBounds.right} y1={tick.y} y2={tick.y} />)}
            <line className="v8-reserve-line" x1={scale.plotBounds.left} x2={scale.plotBounds.right} y1={scale.yForValue(projection.reserveCents)} y2={scale.yForValue(projection.reserveCents)} />
            <path className="v8-baseline-path" d={chartPath(points, scale)} />
            {scenarioResult ? <path className="v8-scenario-path" d={scenarioPath} /> : null}
          </svg>
          <div className="v9-y-axis" aria-hidden="true">{scale.ticks.map((tick) => <span key={tick.value} style={{ top: `${(tick.y / 320) * 100}%` }}>{money(tick.value)}</span>)}</div>
          <div className="v9-x-axis" aria-hidden="true">{xTicks.map((tick) => <span key={tick.pointIndex} style={{ left: `${(tick.x / 800) * 100}%` }}>{dateLabel(tick.date)}</span>)}</div>
          {selectedPoint ? <button type="button" className="v8-chart-point is-selected" style={pointPosition(points, selectedPoint, scale)} aria-label={`查看${selectedPoint.date}点位解释`} aria-pressed="true" onClick={(event) => { event.stopPropagation(); setSelectedContext({ type: 'date', id: selectedPoint.date }); setInspectorOpen(true); }} /> : null}
          <input className="v8-chart-slider" type="range" min="0" max={Math.max(0, points.length - 1)} step="1" value={selectedIndex} aria-label="选择未来日期" onChange={(event) => selectPoint(Number(event.target.value))} />
          <span className="v8-today-line">今天</span>
          <span className="v11-1-horizon-start" style={pointPosition(points, points[0], scale)}>今天<br /><strong>{money(annotations.start?.valueCents)}</strong></span>
          <span className="v11-1-horizon-end" style={pointPosition(points, points.at(-1), scale)}>{rangeDays} 天后<br /><strong>{money(annotations.end?.valueCents)}</strong></span>
          <span className="v8-reserve-label" style={{ top: `${(scale.yForValue(projection.reserveCents) / 320) * 100}%` }}>保留边界 {money(projection.reserveCents)}</span>
          {annotations.crossing ? <button type="button" className="v11-1-crossing-annotation" style={{ left: `${(scale.xForIndex(annotations.crossing.pointIndex, points.length) / 800) * 100}%`, top: `${(scale.yForValue(projection.reserveCents) / 320) * 100}%` }} onClick={(event) => { event.stopPropagation(); selectPoint(annotations.crossing.pointIndex); }}><i aria-hidden="true" /><span>{dateLabel(annotations.crossing.date)}<strong>触及 {money(projection.reserveCents)}</strong></span></button> : null}
          {scenarioResult ? <button type="button" className="v11-scenario-label" onClick={(event) => { event.stopPropagation(); setScenarioOpen(false); setSelectedContext({ type: 'scenario', id: scenarioResult.patch.id }); setInspectorOpen(true); }}>本次模拟</button> : null}
        </div>
        <div className="v8-event-track" aria-label="时间事项轨道"><span>预计事项与已确认事件 · {denseEventTrack.totalItems} 项，按日期与上方对齐</span><div className="v9-event-rail">{denseEventTrack.groups.length ? denseEventTrack.groups.map((group, index) => group.kind === 'cluster' ? <button type="button" className={`v9-event-anchor v10-event-cluster ${group.labelVisible ? '' : 'is-marker-only'}`} aria-label={`展开 ${group.date} 同日 ${group.count} 项`} aria-expanded={expandedEventDate === group.date} data-position-edge={group.edge} style={{ left: `${group.position}%`, '--event-row-top': `${4 + (index % 3) * 46}px` }} onClick={() => { setExpandedEventDate((value) => value === group.date ? '' : group.date); setSelectedIndex(group.pointIndex); setInspectorOpen(false); }} key={group.id}><i /><b>{group.count}</b><span>{dateLabel(group.date)} · 同日 {group.count} 项</span></button> : <button type="button" className={`v9-event-anchor ${group.labelVisible ? '' : 'is-marker-only'}`} data-occurrence-status={group.status} data-context-type={group.contextType} data-position-edge={group.edge} aria-label={`${group.contextType === 'event' ? '已确认' : OCCURRENCE_STATUS_LABELS[group.status]} ${group.date} ${group.label}`} style={{ left: `${group.position}%`, '--event-row-top': `${4 + (index % 3) * 46}px` }} onClick={() => { setExpandedEventDate(''); setSelectedContext({ type: group.contextType, id: group.contextId }); setSelectedIndex(group.pointIndex); setInspectorOpen(true); }} key={group.id}><i /><span>{group.contextType === 'event' ? '已确认' : OCCURRENCE_STATUS_LABELS[group.status]} · {dateLabel(group.date)} · {group.label} {MONEY.format(group.items[0].amount)}</span></button>) : <p>范围内没有预计事项或已确认事件</p>}</div>{expandedEventCluster ? <section className="v10-event-cluster-panel" aria-label={`${expandedEventCluster.date} 同日事项`}><header><div><span>{expandedEventCluster.date}</span><strong>同日 {expandedEventCluster.count} 项</strong></div><button type="button" aria-label="关闭同日事项" onClick={() => setExpandedEventDate('')}><X size={16} /></button></header><div>{expandedEventCluster.items.map((item) => <button type="button" onClick={() => { setSelectedContext({ type: item.contextType, id: item.contextId }); setSelectedIndex(item.pointIndex); setInspectorOpen(true); }} key={item.id}><span>{item.contextType === 'event' ? '已确认' : OCCURRENCE_STATUS_LABELS[item.status]}</span><strong>{item.label}</strong><b>{MONEY.format(item.amount)}</b></button>)}</div></section> : null}</div>
      </section>
      {inspectorOpen ? <div className="v11-1-context-rail"><FutureContextInspector context={context} explanation={explanation} mobileOpen={mobileLayout} onClose={() => setInspectorOpen(false)} onReconcile={onReconcileOccurrence} onSelectCondition={(conditionId) => { setSelectedContext({ type: 'condition', id: conditionId }); setInspectorOpen(true); }} /></div> : null}
      {scenarioOpen ? <ScenarioComposer reality={reality} asOf={asOf} rangeDays={rangeDays} result={scenarioResult} setResult={setScenarioResult} initialPatch={scenarioResult?.patch} onSaveScenarioDraft={onSaveScenarioDraft} onDeleteScenarioDraft={onDeleteScenarioDraft} onClose={() => setScenarioOpen(false)} mobileOpen={mobileLayout} /> : null}
    </div>

    <details className="v8-list-view" data-v11-level="data"><summary><List size={16} /> 查看全部 {points.length} 天 <ChevronRight size={15} /></summary><div><table><thead><tr><th>日期</th><th>状态</th><th>期初余额</th><th>期末余额</th><th>与保留边界距离</th></tr></thead><tbody>{points.map((point, index) => <tr key={point.date}><td><button type="button" onClick={() => selectPoint(index)}>{point.date}</button></td><td>{point.state === 'actual' ? '今天' : '预计未来'}</td><td>{money(point.openingBalanceCents)}</td><td>{money(point.closingBalanceCents)}</td><td>{money(point.reserveDeltaCents)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

function V8Conditions({ reality, asOf, onUpdateCondition, onAddCondition }) {
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [lifecycleFilter, setLifecycleFilter] = useState('all');
  const maintenance = useMemo(() => buildConditionMaintenanceView(reality, { asOf }), [reality, asOf]);
  const conditionFilters = { query, type: typeFilter, lifecycle: lifecycleFilter };
  const filteredCurrent = filterConditionMaintenance(maintenance.current, conditionFilters);
  const filteredHistorical = filterConditionMaintenance(maintenance.historical, conditionFilters);
  const startEdit = (condition) => {
    const { lifecycle, when, ...editable } = condition;
    setEditingId(condition.id);
    setDraft(editable);
  };
  const addCondition = (type) => {
    const created = onAddCondition(type);
    if (created) startEdit(created);
  };
  const amount = Number(draft?.amount);
  const identityNeedsName = Boolean(draft && ['recurring_income', 'recurring_expense', 'known_event'].includes(draft.type));
  const identityNameIsValid = !identityNeedsName || Boolean(String(draft?.name || '').trim());
  const amountIsValid = Number.isFinite(amount) && (['balance', 'reserve'].includes(draft?.type) ? amount >= 0 : amount > 0);
  const dateIsValid = Boolean(draft && (['balance', 'reserve'].includes(draft.type) || (draft.type === 'daily_floor' ? draft.startDate : draft.nextOccurrence)));
  const canSave = amountIsValid && dateIsValid && identityNameIsValid;
  const original = draft ? reality.conditions.find((item) => item.id === editingId) : null;
  const dirty = Boolean(draft && original && JSON.stringify(draft) !== JSON.stringify(original));
  const closeEditor = () => {
    if (dirty && !window.confirm('这项条件的修改还没有保存，确定关闭吗？')) return;
    setEditingId('');
    setDraft(null);
  };
  const save = () => {
    if (!canSave) return;
    onUpdateCondition(editingId, {
      ...draft,
      status: ['paused', 'ended'].includes(draft.status) ? draft.status : 'confirmed'
    });
    setEditingId('');
    setDraft(null);
  };
  const readingGroups = buildConditionReadingGroups(filteredCurrent);
  const conditionCard = (condition) => <button type="button" className={`v8-condition-card ${editingId === condition.id ? 'is-selected' : ''}`} aria-pressed={editingId === condition.id} onClick={() => startEdit(condition)} key={condition.id}>
    <span className="v9-condition-identity"><b title={conditionDisplayName(condition)}>{conditionDisplayName(condition)}</b><small>{CONDITION_LABELS[condition.type]} · {condition.lifecycle.label}</small></span>
    <strong>{condition.status === 'missing' ? '尚未确认' : MONEY.format(condition.amount)}</strong>
    <small>{condition.lifecycle.detail}</small><ChevronRight size={17} />
  </button>;
  return <section className="v8-space v8-conditions" data-v8-space="conditions">
    <header className="v8-space-heading"><span><SlidersHorizontal size={15} /> 现金条件</span><h1 id="workspace-title">未来依据了哪些事实</h1><p>现金基础、固定收入、固定支出与未来一次事项，按读懂现金的顺序排列。</p></header>
    <div className="v10-condition-overview" data-v11-level="answer" aria-label="条件概览"><span>当前 <b>{maintenance.counts.current}</b> 项</span><span>生效中 <b>{maintenance.counts.active}</b></span>{maintenance.counts.due ? <span>待核对 <b>{maintenance.counts.due}</b></span> : null}</div>
    <details className="v11-condition-tools" data-v11-level="data"><summary><Search size={16} /> 查找与筛选条件</summary><section className="v10-condition-finder" aria-label="查找条件"><label><Search size={16} /><input type="search" aria-label="搜索条件" value={query} placeholder="搜索条件名称" onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="条件类型" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">全部类型</option><option value="recurring_income">固定收入</option><option value="recurring_expense">固定支出</option><option value="known_event">未来一次事项</option></select><select aria-label="条件状态" value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)}><option value="all">全部状态</option><option value="active">生效中</option><option value="paused">已暂停</option><option value="due">待核对</option><option value="ended">已结束</option><option value="resolved">已核对</option><option value="missing">需要确认</option></select><span>{filteredCurrent.length + filteredHistorical.length} 项匹配</span></section></details>
    <div className="v8-condition-groups v11-condition-groups" data-v11-level="reason" aria-label="当前条件">
      {readingGroups.map((group) => <section className="v8-condition-group" key={group.id}>
        <header><div><span>{group.label}</span><p>{group.id === 'base' ? '余额、保留边界与最低日常支出' : group.id === 'income' ? '已确认会持续到账的收入' : group.id === 'expense' ? '已确认会持续发生的支出' : '只发生一次的未来收支'}</p></div>{group.id !== 'base' ? <button type="button" onClick={() => addCondition(group.id === 'income' ? 'recurring_income' : group.id === 'expense' ? 'recurring_expense' : 'known_event')}><Plus size={16} /> 新增</button> : null}</header>
        <div className="v8-condition-list">
          {group.items.map(conditionCard)}
          {group.items.length === 0 ? <p className="v8-empty">这一组还没有已确认事项。</p> : null}
        </div>
      </section>)}
    </div>
    <details className="v10-historical-conditions" data-v11-level="data">
      <summary><History size={16} /> 历史条件 <b>{maintenance.counts.historical}</b><small>已结束或已核对，继续保留过去依据</small></summary>
      <div className="v8-condition-list">{filteredHistorical.length ? filteredHistorical.map(conditionCard) : <p className="v8-empty">{maintenance.historical.length ? '当前筛选没有匹配的历史条件。' : '还没有历史条件。'}</p>}</div>
    </details>
    <p className="v8-condition-foot"><ShieldCheck size={15} /> 可能收入不会进入曲线。任何缺失或过期条件都会让相关结论显示为“未知”。</p>
    {draft ? <V9DialogSurface className="v8-editor-surface" label="编辑现实条件" onClose={closeEditor}>
      <header><div><span>现实条件</span><h2>{CONDITION_LABELS[draft.type]}</h2><p>只保存你本人确认的数字。</p></div><button type="button" data-dialog-close aria-label="关闭条件编辑" onClick={closeEditor}><X size={18} /></button></header>
      <article className="v8-condition-editor">
        {identityNeedsName ? <label>条件名称<input required maxLength="80" value={draft.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={CONDITION_LABELS[draft.type]} /></label> : null}
        {['recurring_income', 'recurring_expense'].includes(draft.type) ? <label>收支类型<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option value="recurring_expense">固定支出</option><option value="recurring_income">固定收入</option></select></label> : null}
        {draft.type === 'known_event' ? <label>事件类型<select value={draft.eventKind || 'expense'} onChange={(event) => setDraft({ ...draft, eventKind: event.target.value })}><option value="expense">未来支出</option><option value="income">未来收入</option></select></label> : null}
        <label>{CONDITION_LABELS[draft.type]}金额<input required type="number" min={['balance', 'reserve'].includes(draft.type) ? '0' : '0.01'} step="0.01" value={draft.status === 'missing' && draft.amount === 0 ? '' : draft.amount} placeholder={draft.status === 'missing' ? '尚未确认' : undefined} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
        {!['balance', 'reserve'].includes(draft.type) ? <label>{draft.type === 'daily_floor' ? '开始日期' : '下次日期'}<input type="date" value={draft.type === 'daily_floor' ? draft.startDate : draft.nextOccurrence} onChange={(event) => setDraft({ ...draft, [draft.type === 'daily_floor' ? 'startDate' : 'nextOccurrence']: event.target.value })} /></label> : null}
        {['recurring_income', 'recurring_expense'].includes(draft.type) ? <label>发生频率<select value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value })}><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="once">一次</option></select></label> : null}
        {identityNeedsName ? <details className="v9-condition-more"><summary>状态与结束时间</summary><div><label>结束日期<input type="date" value={draft.endDate || ''} min={draft.nextOccurrence || undefined} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label><div className="v10-lifecycle-actions" aria-label="条件生命周期">{draft.status !== 'confirmed' ? <button type="button" onClick={() => setDraft({ ...draft, status: 'confirmed', endDate: '' })}>{draft.status === 'ended' ? '重新启用这项条件' : '恢复这项条件'}</button> : null}{draft.status !== 'paused' && draft.status !== 'ended' ? <button type="button" onClick={() => setDraft({ ...draft, status: 'paused' })}>暂停这项条件</button> : null}{draft.status !== 'ended' ? <button type="button" onClick={() => setDraft({ ...draft, status: 'ended', endDate: asOf })}>结束这项条件</button> : null}</div></div></details> : null}
        <div><button type="button" onClick={closeEditor}>取消</button><button type="button" className="v8-primary-action" disabled={!canSave} onClick={save}><Check size={16} /> 确认条件</button></div>
      </article>
    </V9DialogSurface> : null}
  </section>;
}

function V8Records({ reality, legacyRecords, onAppendEvent, dataPanel }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ type: 'expense', occurredAt: new Date().toISOString().slice(0, 10), amount: '' });
  const amountEntered = String(draft.amount).trim() !== '';
  const amount = Number(draft.amount);
  const balance = Number(reality.conditions.find((item) => item.type === 'balance' && item.status === 'confirmed')?.amount || 0);
  const today = new Date().toISOString().slice(0, 10);
  const impactPreview = amountEntered && Number.isFinite(amount) && amount >= 0 && draft.occurredAt
    ? draft.occurredAt > today
      ? `${draft.occurredAt} 的未来轨迹将${draft.type === 'income' ? '增加' : draft.type === 'expense' ? '减少' : '更新为'} ${MONEY.format(amount)}。当前余额暂时不变。`
      : draft.type === 'balance_confirmation'
        ? `当前余额将从 ${MONEY.format(balance)} 更新为 ${MONEY.format(amount)}。`
        : `当前余额将从 ${MONEY.format(balance)} ${draft.type === 'income' ? '增加' : '减少'}到 ${MONEY.format(Math.max(0, balance + (draft.type === 'income' ? amount : -amount)))}。`
    : '填完三个信息后，这里会先显示它将怎样改变现在和未来。';
  const captureDirty = amountEntered || draft.type !== 'expense' || draft.occurredAt !== today;
  const closeCapture = () => {
    if (captureDirty && !window.confirm('这次变化还没有保存，确定关闭吗？')) return;
    setOpen(false);
  };
  const submit = (event) => {
    event.preventDefault();
    onAppendEvent({ ...draft, amount: Number(draft.amount) });
    setDraft({ type: 'expense', occurredAt: new Date().toISOString().slice(0, 10), amount: '' });
    setOpen(false);
  };
  const timeline = useMemo(() => buildHumanRecordTimeline(reality.events, legacyRecords), [reality.events, legacyRecords]);
  const memory = useMemo(() => buildTemporalMemorySummary(reality), [reality]);
  const latestComparison = memory.comparisons.at(-1) || null;
  const recentSnapshots = reality.realitySnapshots.slice(-4).reverse();
  return <section className="v8-space v8-records" data-v8-space="records">
    <header className="v8-space-heading v8-heading-row"><div><span><History size={15} /> 真实变化</span><h1 id="workspace-title">过去发生了什么</h1><p>只呈现本人确认的变化。没有变化时，不需要做任何事。</p></div><button type="button" className="v8-primary-action" onClick={() => setOpen((value) => !value)}><Plus size={17} /> 记录变化</button></header>
    {open ? <V9DialogSurface className="v8-editor-surface v8-capture-surface" label="记录真实变化" onClose={closeCapture}>
      <header><div><span>真实变化</span><h2>记录发生的现金变化</h2><p>保存前先看清它会怎样影响现在和未来。</p></div><button type="button" data-dialog-close aria-label="关闭变化记录" onClick={closeCapture}><X size={18} /></button></header>
      <form className="v8-change-form" data-v8-change-form onSubmit={submit}>
        <label>变化类型<select required value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option value="expense">支出发生</option><option value="income">收入到账</option><option value="balance_confirmation">余额确认</option></select></label>
        <label>日期<input required type="date" value={draft.occurredAt} onChange={(event) => setDraft({ ...draft, occurredAt: event.target.value })} /></label>
        <label>金额<input required type="number" min={draft.type === 'balance_confirmation' ? '0' : '0.01'} step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="0.00" /></label>
        <section className="v8-change-preview" aria-live="polite"><ShieldCheck size={16} /><div><strong>保存前影响预览</strong><p>{impactPreview}</p></div></section>
        <div><span>本人确认后，现在、未来和记录会同步更新。</span><button type="button" onClick={closeCapture}>取消</button><button type="submit" className="v8-primary-action"><ReceiptText size={16} /> 写入真实记录</button></div>
      </form>
    </V9DialogSurface> : null}
    <details className="v10-memory-panel v11-memory-panel" data-v11-level="reason" aria-label="过去预计与后来现实">
      <summary><History size={16} /> 过去预计与后来现实 <b>{memory.forecastSnapshotCount} 次</b></summary>
      <section>
      <header><div><span>现实进展</span><strong>{memory.realitySnapshotCount} 次真实快照 · {memory.forecastSnapshotCount} 份预测记忆</strong></div>{memory.latestRealitySnapshot ? <small>最近保存于 {memory.latestRealitySnapshot.asOf}</small> : null}</header>
      {latestComparison ? <article className="v10-forecast-comparison is-neutral" data-tone="neutral">
        <span>当时预计<strong>{money(latestComparison.forecastBalanceCents)}</strong><small>{latestComparison.forecastDate}</small></span>
        <i>与</i>
        <span>后来确认<strong>{money(latestComparison.actualBalanceCents)}</strong><small>本人确认余额</small></span>
        <i>相差</i>
        <span>差异<strong>{latestComparison.deltaCents > 0 ? '＋' : latestComparison.deltaCents < 0 ? '−' : ''}{money(Math.abs(latestComparison.deltaCents))}</strong><small>只陈述差异，不作评价</small></span>
      </article> : <div className="v10-memory-empty"><History size={18} /><div><strong>还没有可比较的历史</strong><p>从下一次真实确认开始保存。旧数据没有生成历史，也不会用今天的数据改写过去。</p></div></div>}
      {recentSnapshots.length ? <div className="v10-snapshot-strip" aria-label="最近现实快照">{recentSnapshots.map((snapshot) => <span key={snapshot.id}><b>{snapshot.asOf}</b><small>{money(snapshot.balanceCents)} · {snapshot.conditionCount} 项条件</small></span>)}</div> : null}
      </section>
    </details>
    <section className="v8-record-timeline v11-record-timeline" data-v11-level="answer">
      <header><span>本人确认的变化</span><b>{timeline.length} 条</b></header>
      {timeline.length ? timeline.map((item) => <article key={`${item.id}-${item.date}`}><i /><div><span>{item.date}</span><strong>{item.label}</strong><small>{item.note}</small></div><b className={item.direction === 'out' ? 'is-out' : ''}>{item.direction === 'neutral' ? '已记录' : <>{item.direction === 'out' ? '−' : '＋'}{MONEY.format(Math.abs(item.amount))}</>}</b></article>) : <p className="v8-empty">还没有真实变化。当前条件仍然会展示现在与未来。</p>}
    </section>
    {dataPanel ? <details className="v8-data-tools" data-v11-level="data"><summary><CircleDollarSign size={16} /> 数据、备份与恢复</summary>{dataPanel}</details> : null}
  </section>;
}

export function V8Experience({ space, reality, asOf, legacyRecords = [], onNavigate, onUpdateCondition, onAddCondition, onAppendEvent, onReconcileOccurrence, onCommitRealityCapture, onSaveScenarioDraft, onDeleteScenarioDraft, dataPanel }) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const projection = useMemo(() => buildCashRealityProjection(reality, { asOf, horizonDays: 90 }), [reality, asOf]);
  const summary = useMemo(() => buildNowSummary(projection), [projection]);
  const content = space === 'future'
    ? <V8Future reality={reality} asOf={asOf} onSaveScenarioDraft={onSaveScenarioDraft} onDeleteScenarioDraft={onDeleteScenarioDraft} onReconcileOccurrence={onReconcileOccurrence} onNavigate={onNavigate} />
    : space === 'conditions'
      ? <V8Conditions reality={reality} asOf={asOf} onUpdateCondition={onUpdateCondition} onAddCondition={onAddCondition} />
      : space === 'records'
        ? <V8Records reality={reality} legacyRecords={legacyRecords} onAppendEvent={onAppendEvent} dataPanel={dataPanel} />
        : <V8Now projection={projection} summary={summary} onNavigate={onNavigate} onOpenRealityCapture={() => setCaptureOpen(true)} />;
  return <>{content}<RealityCapturePanel open={captureOpen} reality={reality} asOf={asOf} onClose={() => setCaptureOpen(false)} onCommit={onCommitRealityCapture} onNavigate={onNavigate} /></>;
}
