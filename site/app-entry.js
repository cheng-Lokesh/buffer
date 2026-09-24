import { createV12_1RealityParser } from '../src/v12-1-browser-adapter.js';
import { buildRealityCaptureContext, commitRealityCapture, validateRealityCandidates } from '../src/v12-reality-capture.js';
import { buildCashRealityProjection, buildNowSummary, buildExpectedOccurrences, captureTemporalMemory, normalizeCashReality, createScenarioPatch, runScenarioPatch, saveScenarioDraft } from '../src/v8-cash-reality.js';
import { adaptLegacyCashToV8Reality } from '../src/v8-legacy-adapter.js';
import { buildProductStateEnvelope } from '../src/state-envelope.js';
import { persistProductState } from '../src/product-persistence.js';
import { prepareBackupPreview } from '../src/backup-restore.js';
import { buildNowDashboardFacts } from '../src/v12-1-now-dashboard-facts.js';
import { parseBillCsv, summarizeBillRows, setBillRowStatus, includeClearBillRows } from '../src/bill-observation.js';

const SITE_APPEARANCE = 'ink-contours';

const STATE_KEY = 'buffer-zone.product.state.v1';
const RECOVERY_KEY = 'buffer-zone.recovery.v1';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const nowIso = () => new Date().toISOString();
const money = (value) => `¥${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(value || 0))}`;
const centsMoney = (value) => value == null ? '待确认' : money(value / 100);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

let state = loadState();
let recoveryVault = loadJson(RECOVERY_KEY, {});
let pending = null;
let futureHorizon = 90;
let scenarioResult = null;
let billRows = [];
let billView = 'confirmed';
let nowBillView = false;
let billError = '';
const parser = createV12_1RealityParser();

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; }
}

function loadState() {
  const stored = loadJson(STATE_KEY, {});
  const cashReality = stored.cashReality
    ? normalizeCashReality(stored.cashReality)
    : adaptLegacyCashToV8Reality(stored, { asOf: today(), confirmedAt: stored.cashflowConfirmation?.confirmedAt || '' });
  return {
    ...stored,
    schemaVersion: 9,
    visualSkinId: SITE_APPEARANCE,
    cashReality
  };
}

function completeReality(reality, reason) {
  try {
    return captureTemporalMemory(reality, { asOf: today(), capturedAt: nowIso(), reason }).reality;
  } catch {
    return normalizeCashReality(reality);
  }
}

function saveReality(reality, reason = 'reality_confirmed') {
  state = { ...state, cashReality: completeReality(reality, reason) };
  const payload = buildProductStateEnvelope(state);
  const result = persistProductState(localStorage, {
    stateKey: STATE_KEY,
    recoveryKey: RECOVERY_KEY,
    payload,
    recoveryVault,
    id: `recovery-${Date.now()}`,
    createdAt: nowIso()
  });
  if (!result.ok) throw new Error(result.message || '保存失败');
  recoveryVault = result.recoveryVault;
  state = payload;
  document.body.dataset.productState = 'live';
  document.body.dataset.skin = SITE_APPEARANCE;
  renderAll();
}

function savePreferences() {
  const payload = buildProductStateEnvelope(state);
  const result = persistProductState(localStorage, {
    stateKey: STATE_KEY,
    recoveryKey: RECOVERY_KEY,
    payload,
    recoveryVault,
    id: `recovery-${Date.now()}`,
    createdAt: nowIso()
  });
  if (!result.ok) throw new Error(result.message || '保存失败');
  recoveryVault = result.recoveryVault;
  state = payload;
}

function baselineReady() {
  const types = new Set(state.cashReality.conditions.filter((item) => item.status === 'confirmed').map((item) => item.type));
  return ['balance', 'reserve', 'daily_floor'].every((type) => types.has(type));
}

function projection() {
  return buildCashRealityProjection(state.cashReality, { asOf: today(), horizonDays: 90 });
}

function renderAll() {
  document.querySelector('.preview-banner')?.remove();
  document.body.dataset.productState = baselineReady() ? 'live' : 'empty';
  document.body.dataset.skin = SITE_APPEARANCE;
  renderNow();
  renderFuture();
  renderConditions();
  renderRecords();
}

function pageHeading(kicker, title, _copy, action = '') {
  return `<header class="live-heading"><div><span>${kicker}</span><h1>${title}</h1></div>${action}</header>`;
}

function dateZh(value) {
  if (!value) return '日期待确认';
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(parsed);
}

function signedCents(value, direction) {
  return `${direction === 'inflow' ? '+' : '-'}${centsMoney(Math.abs(value))}`;
}

function displayName(value) {
  const text = String(value || '');
  return ({ '最低日常支出': '每日最低支出', '保留边界': '保留金额' })[text] || text;
}

function cadence(item) {
  return ({ daily: '每天', weekly: '每周', monthly: '每月', once: '一次' })[item.frequency] || '已确认';
}

function chartGeometry(points, reserveCents, scenarioPoints = []) {
  const all = [...points, ...scenarioPoints];
  const values = all.flatMap((item) => [item.openingBalanceCents, item.closingBalanceCents]).filter(Number.isFinite);
  const minimum = Math.min(...values, reserveCents);
  const maximum = Math.max(...values, reserveCents, minimum + 1);
  const y = (value) => 252 - ((value - minimum) / (maximum - minimum)) * 204;
  const path = (items) => items.map((item, index) => `${index ? 'L' : 'M'} ${(index / Math.max(1, items.length - 1)) * 1000} ${y(item.closingBalanceCents)}`).join(' ');
  return { path: path(points), scenarioPath: scenarioPoints.length ? path(scenarioPoints) : '', reserveY: y(reserveCents), minimum, maximum };
}

function billObservationCards() {
  const facts = summarizeBillRows(billRows);
  const known = facts.includedCount > 0;
  const range = facts.startDate ? `${dateZh(facts.startDate)}至${dateZh(facts.endDate)}` : '日期待核对';
  return [
    `<article><span>已导入范围</span><strong>${range}</strong><small>仅限本次选择的文件</small></article>`,
    `<article><span>已核对交易</span><strong>${known ? `${facts.includedCount} 笔` : '待核对'}</strong><small>${facts.pendingCount} 笔待核对</small></article>`,
    `<article class="expense"><span>已核对支出</span><strong>${known ? centsMoney(facts.expenseCents) : '待核对'}</strong></article>`,
    `<article class="income"><span>已核对收入</span><strong>${known ? centsMoney(facts.incomeCents) : '待核对'}</strong></article>`,
    `<article><span>导入范围净变化</span><strong>${known ? centsMoney(facts.incomeCents - facts.expenseCents) : '待核对'}</strong></article>`,
    `<article><span>最大一笔已核对支出</span><strong>${facts.largestExpense ? centsMoney(facts.largestExpense.amountCents) : '暂无'}</strong><small>${facts.largestExpense ? dateZh(facts.largestExpense.date) : '仅限已核对交易'}</small></article>`
  ].join('');
}

function renderNow() {
  const root = document.getElementById('page-now');
  if (!baselineReady()) {
    root.innerHTML = `<main class="live-stack" data-testid="reality-empty">${pageHeading('开始使用', '确认当前现金')}<section class="live-empty"><h2>当前余额、保留金额、每日最低支出</h2><button class="live-primary" type="button" data-action="open-baseline">开始设置</button></section></main>`;
    bindActions(root);
    return;
  }
  const view = projection();
  const summary = buildNowSummary(view);
  const facts = buildNowDashboardFacts(state.cashReality, view, today());
  const due = buildExpectedOccurrences(state.cashReality, { asOf: today(), horizonDays: 0 }).filter((item) => item.status === 'due');
  const reserveLine = summary.reserveTouchDate ? `预计 ${summary.reserveTouchDate} 降到保留金额` : `至少可覆盖 ${summary.supportDays || 0} 天`;
  const lastSnapshot = state.cashReality.realitySnapshots.at(-1);
  const day90 = view.points.at(-1);
  const reserveTouchIndex = summary.reserveTouchDate ? view.points.findIndex((point) => point.date === summary.reserveTouchDate) : -1;
  const changeFromNow = (balanceCents) => {
    if (balanceCents == null || summary.balanceCents == null) return '';
    const difference = balanceCents - summary.balanceCents;
    return `<small>较现在${difference >= 0 ? '多' : '少'} ${centsMoney(Math.abs(difference))}</small>`;
  };
  const reserveDetail = reserveTouchIndex >= 0
    ? `<small>${dateZh(summary.reserveTouchDate)}</small>`
    : `<small>90 天后仍高于保留金额 ${centsMoney(day90?.closingBalanceCents - summary.reserveCents)}</small>`;
  const insightCards = [
    `<article><span>7 天后预计余额</span><strong>${centsMoney(facts.forecastBalancesCents.day7)}</strong>${changeFromNow(facts.forecastBalancesCents.day7)}</article>`,
    `<article><span>30 天后预计余额</span><strong>${centsMoney(facts.forecastBalancesCents.day30)}</strong>${changeFromNow(facts.forecastBalancesCents.day30)}</article>`,
    `<article><span>60 天后预计余额</span><strong>${centsMoney(facts.forecastBalancesCents.day60)}</strong>${changeFromNow(facts.forecastBalancesCents.day60)}</article>`,
    `<article><span>触及保留金额</span><strong>${reserveTouchIndex >= 0 ? reserveTouchIndex === 0 ? '已经触及' : `${reserveTouchIndex} 天后` : '90 天内未触及'}</strong>${reserveDetail}</article>`,
    `<article><span>每日最低支出</span><strong>${centsMoney(facts.minimumDailySpendCents)}</strong></article>`,
    facts.latestEvent
      ? `<article class="${facts.latestEvent.type === 'expense' ? 'expense' : 'income'}"><span>最近一笔变化</span><strong>${facts.latestEvent.type === 'expense' ? '-' : '+'}${money(facts.latestEvent.amount)}</strong><small>${escapeHtml(displayName(facts.latestEvent.name || '已确认收支'))} · ${dateZh(facts.latestEvent.occurredAt)}</small></article>`
      : '<article><span>最近一笔变化</span><strong>近30天暂无收支记录</strong></article>'
  ].join('');
  const detailRows = [
    `<div><dt>已确认项目</dt><dd>${state.cashReality.conditions.filter((item) => item.status === 'confirmed').length} 项</dd></div>`,
    facts.recorded30.incomeCount ? `<div><dt>近30天已记录收入</dt><dd>${centsMoney(facts.recorded30.incomeCents)}</dd></div>` : '',
    facts.recorded30.expenseCount ? `<div><dt>近30天已记录支出</dt><dd>${centsMoney(facts.recorded30.expenseCents)}</dd></div>` : '',
    !facts.recorded30.count ? '<div><dt>近30天收支记录</dt><dd>暂无记录</dd></div>' : '',
    `<div><dt>未来30天日常最低支出</dt><dd>${centsMoney(facts.future30.minimumSpendCents)}</dd></div>`,
    `<div><dt>30天后${facts.forecastBalancesCents.day30 >= summary.reserveCents ? '高于' : '低于'}保留金额</dt><dd>${centsMoney(Math.abs(facts.forecastBalancesCents.day30 - summary.reserveCents))}</dd></div>`,
    facts.future30.confirmedIncomeCents ? `<div><dt>未来30天预计收入</dt><dd>${centsMoney(facts.future30.confirmedIncomeCents)}</dd></div>` : '',
    facts.future30.extraExpenseCents ? `<div><dt>未来30天额外支出</dt><dd>${centsMoney(facts.future30.extraExpenseCents)}</dd></div>` : '',
    facts.nextKnownChange ? `<div class="next-known-change"><dt>下一笔已知收支</dt><dd>${dateZh(facts.nextKnownChange.expectedDate)} · ${facts.nextKnownChange.direction === 'income' ? '+' : '-'}${money(facts.nextKnownChange.expectedAmount)}</dd></div>` : '',
    due.length ? `<div><dt>待确认事项</dt><dd>${due.length} 项</dd></div>` : ''
  ].join('');
  root.innerHTML = `<main class="live-stack live-space-now" data-testid="now-observatory">${pageHeading('当前情况', '你的现金情况', '', '<button class="live-primary" type="button" data-action="open-capture">更新情况</button>')}<section class="live-metrics"><article><span>当前余额</span><strong>${centsMoney(summary.balanceCents)}</strong><small>你最近确认的金额</small></article><article><span>可使用金额</span><strong>${centsMoney(summary.usableCashCents)}</strong><small>当前余额减去保留金额</small></article><article><span>可以支撑</span><strong>${summary.supportDays ?? '待确认'}${summary.supportDays == null ? '' : ' 天'}</strong><small>${escapeHtml(reserveLine)}</small></article><article><span>保留金额</span><strong>${centsMoney(summary.reserveCents)}</strong><small>由你设定</small></article></section><section class="reality-composition" data-testid="now-composition"><article class="reality-landscape"><div class="landscape-copy"><span>已确认信息</span><h2>${summary.reserveTouchDate ? '未来 90 天内余额可能低于保留金额' : '未来 90 天内余额高于保留金额'}</h2><div class="now-outcome"><div><span>90天后预计余额</span><strong>${centsMoney(summary.rangeEndBalanceCents)}</strong></div><div><span>90天预计变化</span><strong>${summary.rangeEndBalanceCents >= summary.balanceCents ? "+" : "-"}${centsMoney(Math.abs(summary.rangeEndBalanceCents - summary.balanceCents))}</strong></div></div></div><div class="cash-altitude" aria-label="余额与保留金额"><div class="cash-altitude-line"><i style="width:${Math.max(4, Math.min(100, summary.reserveCents / Math.max(1, summary.balanceCents) * 100))}%"></i><b style="left:${Math.max(4, Math.min(96, summary.reserveCents / Math.max(1, summary.balanceCents) * 100))}%">保留金额 ${centsMoney(summary.reserveCents)}</b></div><strong>${centsMoney(summary.balanceCents)}</strong><small>当前余额</small></div></article><aside class="reality-inspector"><header><span>最近更新</span><strong>${lastSnapshot ? dateZh(lastSnapshot.asOf) : '刚刚'}</strong></header><dl>${detailRows}</dl></aside></section><div class="now-observation-area">${billRows.length ? `<div class="bill-switch live-actions"><button type="button" data-action="show-forecast" aria-pressed="${!nowBillView}">预计节点</button><button type="button" data-action="show-bill-observation" aria-pressed="${nowBillView}">账单观察</button></div>` : ''}<section class="now-insight-grid" data-testid="now-insight-grid">${nowBillView && billRows.length ? billObservationCards() : insightCards}</section></div>${due.length ? `<section class="live-panel due-ledger"><header><div><span>待确认</span><h2>已经到期的事项</h2></div></header><div class="live-list">${due.map((item) => `<article><div><strong>${escapeHtml(displayName(item.conditionName))}</strong><small>${item.expectedDate} · ${money(item.expectedAmount)}</small></div><div class="live-actions"><button type="button" data-action="confirm-occurrence" data-id="${escapeHtml(item.id)}">如期发生</button><button type="button" data-action="change-occurrence-amount" data-id="${escapeHtml(item.id)}">金额变化</button><button type="button" data-action="change-occurrence-date" data-id="${escapeHtml(item.id)}">日期变化</button><button type="button" data-action="skip-occurrence" data-id="${escapeHtml(item.id)}">没有发生</button></div></article>`).join('')}</div></section>` : ''}</main>`;
  bindActions(root);
}

function renderFuture() {
  const root = document.getElementById('page-future');
  if (!baselineReady()) {
    root.innerHTML = `<main class="live-stack">${pageHeading('未来', '还不能计算', '缺少的信息不会显示为零。')}<section class="live-empty"><h2>先在“现在”完成设置</h2><p>确认当前金额后，才能查看未来变化。</p></section></main>`;
    return;
  }
  const view = buildCashRealityProjection(state.cashReality, { asOf: today(), horizonDays: futureHorizon });
  const points = view.points || [];
  const end = points.at(-1);
  const scenarioPoints = scenarioResult?.scenario?.points || [];
  const geometry = chartGeometry(points, view.reserveCents, scenarioPoints);
  const meaningful = points.filter((item) => item.drivers.some((driver) => driver.sourceType !== 'daily_floor')).slice(0, 8);
  const endDrivers = end?.drivers || [];
  const eventSection = meaningful.length ? `<section class="future-events" data-testid="future-events"><header><div><span>未来收支</span><h2>已确认的未来收支</h2></div><small>已确认 ${view.expectedOccurrences.length} 项</small></header><div class="event-rail">${meaningful.map((point) => `<article><time>${dateZh(point.date)}</time><i></i><strong>${escapeHtml(displayName(point.drivers.find((driver) => driver.sourceType !== 'daily_floor')?.label || '已确认收支'))}</strong><small>${point.drivers.filter((driver) => driver.sourceType !== 'daily_floor').map((driver) => signedCents(driver.amountCents, driver.direction)).join(' · ')}</small></article>`).join('')}</div></section>` : '';
  root.innerHTML = `<main class="live-stack live-space-future">${pageHeading('未来', `未来 ${futureHorizon} 天的资金变化`, '', '<button class="live-primary" type="button" data-action="open-scenario">试算变化</button>')}<div class="future-toolbar"><div class="live-actions live-horizon" aria-label="查看天数"><button type="button" data-action="horizon" data-value="30" aria-pressed="${futureHorizon === 30}">30 天</button><button type="button" data-action="horizon" data-value="60" aria-pressed="${futureHorizon === 60}">60 天</button><button type="button" data-action="horizon" data-value="90" aria-pressed="${futureHorizon === 90}">90 天</button></div><div><span>${futureHorizon} 天后预计余额</span><strong>${centsMoney(end?.closingBalanceCents)}</strong></div></div><section class="future-stage"><article class="future-canvas" data-testid="future-canvas"><header><div><span>按已确认信息估算</span><h2>预计余额变化</h2></div><div class="chart-legend"><i></i>预计余额 <i class="reserve"></i>保留金额 ${scenarioPoints.length ? '<i class="scenario"></i>试算结果' : ''}</div></header><svg viewBox="0 0 1000 300" role="img" aria-label="未来预计余额变化"><path class="chart-grid" d="M0 48H1000M0 116H1000M0 184H1000M0 252H1000"></path><path class="reserve-line" d="M0 ${geometry.reserveY}H1000"></path><path class="balance-area" d="${geometry.path}L1000 278L0 278Z"></path><path class="balance-line" d="${geometry.path}"></path>${geometry.scenarioPath ? `<path class="scenario-line" d="${geometry.scenarioPath}"></path>` : ''}</svg><footer><span>今天<br><b>${centsMoney(points[0]?.openingBalanceCents)}</b></span><span>${Math.round(futureHorizon / 2)} 天</span><span>${futureHorizon} 天<br><b>${centsMoney(end?.closingBalanceCents)}</b></span></footer></article><aside class="future-inspector" data-testid="future-inspector"><span>结果说明</span><h3>${view.reserveTouch.status === 'reached' ? '期间会低于保留金额' : '期间保持高于保留金额'}</h3><p>${view.reserveTouch.date ? `预计 ${dateZh(view.reserveTouch.date)} 余额降到你设定的保留金额。` : `预计至少保持到 ${dateZh(end?.date)}。`}</p><dl><div><dt>当前余额</dt><dd>${centsMoney(points[0]?.openingBalanceCents)}</dd></div><div><dt>保留金额</dt><dd>${centsMoney(view.reserveCents)}</dd></div><div><dt>预计变化</dt><dd>${centsMoney((end?.closingBalanceCents || 0) - (points[0]?.openingBalanceCents || 0))}</dd></div></dl><div class="driver-list"><span>当天收支</span>${endDrivers.map((driver) => `<p><i class="${driver.direction}"></i><strong>${escapeHtml(displayName(driver.label))}</strong><b>${signedCents(driver.amountCents, driver.direction)}</b></p>`).join('') || '<p><strong>当天没有额外收支</strong></p>'}</div></aside></section>${scenarioResult ? `<section class="scenario-strip"><div><span>试算结果，仅供查看</span><strong>${escapeHtml(scenarioResult.operationSummaries.join('；'))}</strong><small>预计余额相差 ${centsMoney(scenarioResult.delta.rangeEndBalanceCents)}，可支撑天数相差 ${scenarioResult.delta.supportDays ?? '未知'} 天。</small></div><div class="live-actions"><button type="button" data-action="save-scenario">保存这次试算</button><button type="button" data-action="clear-scenario">关闭试算</button></div></section>` : ''}${eventSection}</main>`;
  bindActions(root);
}

function conditionLabel(item) {
  return ({ balance: '当前余额', reserve: '保留金额', daily_floor: '每日最低支出', recurring_income: '固定收入', recurring_expense: '固定支出', known_event: '一次性收支' })[item.type] || item.type;
}

function renderConditions() {
  const root = document.getElementById('page-cond');
  const conditions = state.cashReality.conditions;
  const groups = [['基础金额', ['balance', 'reserve', 'daily_floor']], ['固定收入', ['recurring_income']], ['固定支出', ['recurring_expense']], ['一次性收支', ['known_event']]];
  const balance = conditions.find((item) => item.type === 'balance' && item.status === 'confirmed');
  const reserve = conditions.find((item) => item.type === 'reserve' && item.status === 'confirmed');
  const daily = conditions.find((item) => item.type === 'daily_floor' && item.status === 'confirmed');
  const incomes = conditions.filter((item) => item.type === 'recurring_income' && item.status === 'confirmed');
  const outflows = conditions.filter((item) => ['recurring_expense', 'known_event'].includes(item.type) && item.status === 'confirmed');
  const populatedGroups = groups.map(([label, types], groupIndex) => ({ label, groupIndex, items: conditions.filter((item) => types.includes(item.type)) })).filter(({ items }) => items.length);
  root.innerHTML = `<main class="live-stack live-space-conditions">${pageHeading('估算依据', '影响计算的已确认信息', '', baselineReady() ? '<button class="live-primary" type="button" data-action="open-capture">更新信息</button>' : '')}<section class="conditions-topography" data-testid="conditions-topography"><header><span>估算使用的信息</span><h2>这些内容会影响未来余额</h2></header><div class="condition-map"><article class="condition-origin"><span>当前余额</span><strong>${balance ? money(balance.amount) : '待确认'}</strong><small>你最近确认的金额</small></article><div class="condition-flow" aria-hidden="true"><i></i><i></i><i></i></div><div class="condition-nodes"><article><span>保留金额</span><strong>${reserve ? money(reserve.amount) : '待确认'}</strong></article><article><span>每日最低支出</span><strong>${daily ? `${money(daily.amount)} / 天` : '待确认'}</strong></article><article><span>固定收入</span><strong>${incomes.length} 项</strong></article><article><span>固定支出和其他收支</span><strong>${outflows.length} 项</strong></article></div></div></section><section class="conditions-groups" data-testid="conditions-groups">${populatedGroups.map(({ label, groupIndex, items }) => `<section class="condition-group group-${groupIndex + 1}"><header><div><span>0${groupIndex + 1}</span><h2>${label}</h2></div><b>${items.length}</b></header><div class="condition-rows">${items.map((item) => `<article><div><span>${conditionLabel(item)}</span><strong>${escapeHtml(displayName(item.name || conditionLabel(item)))}</strong><small>${cadence(item)}${item.confirmedAt ? ` · ${new Date(item.confirmedAt).toLocaleDateString('zh-CN')}` : ''}</small></div><div><b>${money(item.amount)}</b><button type="button" data-action="precise-condition" data-id="${escapeHtml(item.id)}">修改金额</button></div></article>`).join('')}</div></section>`).join('')}</section></main>`;
  bindActions(root);
}

function renderRecords() {
  const root = document.getElementById('page-rec');
  if (billView === 'bills') {
    const facts = summarizeBillRows(billRows);
    const list = billRows.map((item) => `<article class="bill-row"><div><time>${item.date ? dateZh(item.date) : '日期待核对'}</time><strong>${escapeHtml(item.category)}</strong><small>${escapeHtml(item.source)} · ${item.reviewReason ? ({ possible_duplicate: '疑似重复', transfer: '资金转移', refund: '退款', failed: '交易未完成', unknown_direction: '收支不明', invalid_field: '字段无效' })[item.reviewReason] : item.status === 'included' ? '已计入观察' : item.status === 'excluded' ? '已排除' : '待核对'}</small></div><b>${item.amountCents == null ? '金额待核对' : `${item.direction === 'income' ? '+' : item.direction === 'expense' ? '-' : ''}${centsMoney(item.amountCents)}`}</b><div class="live-actions">${item.status === 'pending' && !item.reviewReason ? `<button type="button" data-action="bill-status" data-id="${item.id}" data-status="included">计入观察</button>` : ''}${item.status !== 'excluded' ? `<button type="button" data-action="bill-status" data-id="${item.id}" data-status="excluded">排除</button>` : ''}${item.status !== 'pending' ? `<button type="button" data-action="bill-status" data-id="${item.id}" data-status="pending">重新核对</button>` : ''}<button type="button" data-action="bill-remove" data-id="${item.id}">删除</button></div></article>`).join('');
    const clearCount = billRows.filter((row) => row.status === 'pending' && !row.reviewReason && row.category !== '未分类').length;
    root.innerHTML = `<main class="live-stack live-space-records live-bills">${pageHeading('记录', '本机账单观察', '', '<div class="live-actions"><button type="button" data-action="show-confirmed">已确认记录</button><button class="live-primary" type="button" data-action="bill-import">选择 CSV 文件</button><input hidden type="file" accept=".csv,text/csv" data-role="bill-file"></div>')}<section class="bill-notice"><strong>只在本次查看</strong><span>账单在浏览器本地整理，不上传；刷新后清除。它不会改变当前余额或未来估算。</span></section>${billError ? `<p class="bill-error" role="alert">${escapeHtml(billError)}</p>` : ''}${billRows.length ? `<section class="bill-summary"><article><span>导入范围</span><strong>${facts.startDate ? `${dateZh(facts.startDate)}至${dateZh(facts.endDate)}` : '待核对'}</strong></article><article><span>已核对支出</span><strong>${facts.includedCount ? centsMoney(facts.expenseCents) : '待核对'}</strong></article><article><span>已核对收入</span><strong>${facts.includedCount ? centsMoney(facts.incomeCents) : '待核对'}</strong></article><article><span>待核对</span><strong>${facts.pendingCount} 笔</strong></article></section><section class="bill-list"><header><h2>逐笔核对</h2><div class="live-actions">${clearCount ? `<button type="button" data-action="bill-review-clear">计入明确的 ${clearCount} 笔</button>` : ''}<button type="button" data-action="bill-clear">清空账单</button></div></header><div>${list}</div></section>` : '<section class="live-empty bill-empty"><h2>选择你本人导出的 CSV 账单</h2><p>支持含日期、收支、金额列的 CSV。文件中的姓名、商户和流水号不会保留。</p><button class="live-primary" type="button" data-action="bill-import">选择 CSV 文件</button></section>'}</main>`;
    bindActions(root);
    root.querySelector('[data-role="bill-file"]')?.addEventListener('change', importBillFile);
    return;
  }
  const records = [...state.cashReality.events].sort((a, b) => `${b.occurredAt}${b.createdAt}`.localeCompare(`${a.occurredAt}${a.createdAt}`));
  const snapshots = [...state.cashReality.realitySnapshots].reverse().slice(0, 5);
  root.innerHTML = `<main class="live-stack live-space-records">${pageHeading('记录', '你确认过的收支变化', '', '<div class="live-actions backup-actions"><button type="button" data-action="show-bills">本机账单</button><button type="button" data-action="export">导出备份</button><button type="button" data-action="import">恢复备份</button><input hidden type="file" accept="application/json" data-role="backup-file"></div>')}<section class="records-layout"><article class="records-timeline" data-testid="records-timeline"><header><div><span>已确认记录</span><h2>收支记录</h2></div><b>${records.length} 条</b></header><div class="timeline-stream">${records.length ? records.map((item) => `<div class="timeline-entry"><time>${dateZh(item.occurredAt)}</time><i></i><div><span>${item.type === 'income' ? '收入' : item.type === 'expense' ? '支出' : '余额确认'}</span><strong>${escapeHtml(displayName(item.name || conditionLabel(item)))}</strong><small>由你亲自确认</small></div><b>${item.type === 'income' ? '+' : item.type === 'expense' ? '-' : ''}${money(item.amount)}</b></div>`).join('') : '<div class="timeline-entry timeline-empty"><time>现在</time><i></i><div><strong>还没有新的收支记录</strong></div></div>'}</div></article><aside class="records-memory" data-testid="records-memory"><section><span>历史留档</span><h2>${state.cashReality.realitySnapshots.length} 份历史记录</h2><div class="memory-stack">${snapshots.map((item, index) => `<article><i></i><div><strong>${dateZh(item.asOf)}</strong><small>${index === 0 ? '最近记录' : '历史记录'} · ${item.conditionCount} 个已确认项目</small></div><b>${centsMoney(item.balanceCents)}</b></article>`).join('') || '<article><div><strong>等待第一份历史记录</strong></div></article>'}</div></section></aside></section></main>`;
  bindActions(root);
}

async function importBillFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 5_000_000) throw new Error('请选择不超过 5 MB 的 CSV 文件');
    const text = await file.text();
    const parsed = parseBillCsv(text, { source: '本机文件' });
    if (!parsed.rows.length) throw new Error('没有找到可核对的交易');
    billRows = parsed.rows;
    billError = '';
    nowBillView = false;
  } catch (error) {
    billError = error.message || '账单无法读取';
  }
  renderRecords();
  renderNow();
}

function bindActions(root) {
  root.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => action(button.dataset.action, button.dataset)));
  root.querySelector('[data-role="backup-file"]')?.addEventListener('change', restoreFile);
}

function action(name, data = {}) {
  if (name === 'show-bills') { billView = 'bills'; return renderRecords(); }
  if (name === 'show-confirmed') { billView = 'confirmed'; return renderRecords(); }
  if (name === 'bill-import') return document.querySelector('[data-role="bill-file"]')?.click();
  if (name === 'bill-clear') { billRows = []; billError = ''; nowBillView = false; renderRecords(); return renderNow(); }
  if (name === 'bill-review-clear') { billRows = includeClearBillRows(billRows); renderRecords(); return renderNow(); }
  if (name === 'bill-remove') { billRows = billRows.filter((row) => row.id !== data.id); renderRecords(); return renderNow(); }
  if (name === 'bill-status') { billRows = setBillRowStatus(billRows, data.id, data.status); renderRecords(); return renderNow(); }
  if (name === 'show-forecast') { nowBillView = false; return renderNow(); }
  if (name === 'show-bill-observation') { nowBillView = true; return renderNow(); }
  if (name === 'open-baseline') return openBaseline();
  if (name === 'open-capture') return openCapture();
  if (name === 'confirm-occurrence') return commitCandidates([{ type: 'existing_occurrence_confirmation', occurrenceId: data.id }], 'quick_occurrence');
  if (name === 'skip-occurrence') return commitCandidates([{ type: 'existing_occurrence_not_occurred', occurrenceId: data.id }], 'quick_occurrence');
  if (name === 'change-occurrence-amount') return openOccurrenceChange(data.id, 'amount');
  if (name === 'change-occurrence-date') return openOccurrenceChange(data.id, 'date');
  if (name === 'precise-condition') return openPrecise(data.id);
  if (name === 'horizon') { futureHorizon = Number(data.value); return renderFuture(); }
  if (name === 'open-scenario') return openScenario();
  if (name === 'clear-scenario') { scenarioResult = null; return renderFuture(); }
  if (name === 'save-scenario' && scenarioResult) {
    state = { ...state, cashReality: saveScenarioDraft(state.cashReality, scenarioResult.patch) };
    scenarioResult = null;
    savePreferences();
    renderAll();
    return;
  }
  if (name === 'export') return exportBackup();
  if (name === 'import') return document.querySelector('[data-role="backup-file"]')?.click();
}

function modal(content, label = '') {
  document.querySelector('.live-modal')?.remove();
  const previousFocus = document.activeElement;
  const layer = document.createElement('div');
  layer.className = 'live-modal';
  layer.innerHTML = `<section role="dialog" aria-modal="true">${content}</section>`;
  document.body.append(layer);
  const dialog = layer.querySelector('section');
  dialog.setAttribute('aria-label', label || dialog.querySelector('h2')?.textContent || '对话框');
  const close = () => {
    layer.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  };
  layer.querySelector('[data-close]')?.addEventListener('click', close);
  layer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  queueMicrotask(() => dialog.querySelector('input, textarea, select, button:not([data-close])')?.focus());
  return layer;
}

function openBaseline() {
  const layer = modal(`<header><div><span>首次设置</span><h2>确认三个金额</h2></div><button type="button" data-close aria-label="关闭">×</button></header><form class="live-form"><label>当前余额<input name="balance" inputmode="decimal" required></label><label>保留金额<input name="reserve" inputmode="decimal" required></label><label>每日最低支出（元/天）<input name="daily" inputmode="decimal" required></label><p class="live-message" role="status"></p><footer><button class="live-primary" type="submit">下一步核对</button></footer></form>`, '首次设置');
  layer.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const numbers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
    if (Object.values(numbers).some((value) => !Number.isFinite(value) || value < 0)) return showMessage(layer, '请填写有效的非负金额。');
    layer.querySelector('section').innerHTML = `<header><div><span>保存前核对</span><h2>请确认这三个金额</h2></div></header><div class="live-confirm"><p>当前余额 <strong>${money(numbers.balance)}</strong></p><p>保留金额 <strong>${money(numbers.reserve)}</strong></p><p>每日最低支出 <strong>${money(numbers.daily)} / 天</strong></p></div><footer><button type="button" data-back>返回修改</button><button class="live-primary" type="button" data-confirm>确认保存</button></footer>`;
    layer.querySelector('[data-back]').addEventListener('click', openBaseline);
    layer.querySelector('[data-confirm]').addEventListener('click', () => {
      const confirmedAt = nowIso();
      const date = today();
      const reality = normalizeCashReality({ conditions: [
        { id: 'balance', type: 'balance', amount: numbers.balance, status: 'confirmed', confirmedAt, source: 'user_confirmed', captureSource: 'precise_edit' },
        { id: 'reserve', type: 'reserve', amount: numbers.reserve, status: 'confirmed', confirmedAt, source: 'user_confirmed', captureSource: 'precise_edit' },
        { id: 'daily-floor', name: '每日最低支出', type: 'daily_floor', amount: numbers.daily, frequency: 'daily', startDate: date, status: 'confirmed', confirmedAt, source: 'user_confirmed', captureSource: 'precise_edit' }
      ] });
      saveReality(reality, 'baseline_confirmed');
      layer.remove();
    });
  });
}

function openCapture(originalText = '') {
  pending = null;
  const layer = modal(`<header><div><span>更新情况</span><h2>最近有什么变化</h2></div><button type="button" data-close aria-label="关闭">×</button></header><form class="live-form"><label>变化内容<textarea name="message" rows="5" placeholder="例如：现在余额 4360">${escapeHtml(originalText)}</textarea></label><p class="live-privacy">复杂内容会发送必要文字、日期和金额至中国境内模型服务；完整历史和备份不会发送。</p><p class="live-message" role="status"></p><footer><button type="button" data-precise>直接修改金额</button><button class="live-primary" type="submit">整理给我核对</button></footer></form>`, '更新情况');
  layer.querySelector('[data-precise]').addEventListener('click', () => openPrecise());
  layer.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get('message') || '').trim();
    if (!text) return showMessage(layer, '请先写下发生了什么。');
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    showMessage(layer, '正在整理，确认前不会保存。');
    const context = buildRealityCaptureContext(state.cashReality, { asOf: today(), timezone: 'Asia/Shanghai' });
    const result = await parser.parse(text, context);
    submit.disabled = false;
    if (!result.candidates?.length) {
      if (result.status === 'error') {
        layer.querySelector('.live-message').innerHTML = `${escapeHtml(result.message || '暂时不能自动整理。')} <button type="button" data-retry>重新整理</button> <button type="button" data-fallback>直接修改金额</button>`;
        layer.querySelector('[data-retry]').addEventListener('click', () => openCapture(text));
        layer.querySelector('[data-fallback]').addEventListener('click', () => openPrecise());
        return;
      }
      return showMessage(layer, result.question || result.clarifications?.[0]?.question || result.message || '还需要补充更明确的金额或日期。');
    }
    const validation = validateRealityCandidates(result.candidates, context);
    if (!validation.valid) return showMessage(layer, validation.errors[0]);
    pending = validation.candidates;
    showCandidatePreview(layer, text, pending);
  });
}

function candidateText(item) {
  const labels = { balance_confirmation: '当前余额', one_off_income: '一次收入', one_off_expense: '一次支出', known_future_income: '未来收入', known_future_expense: '未来支出', recurring_income: '固定收入', recurring_expense: '固定支出', existing_occurrence_confirmation: '按预计发生', existing_occurrence_not_occurred: '没有发生', condition_update: '修改金额', condition_pause: '暂停计算', condition_end: '停止计算' };
  return `${labels[item.type] || item.type}${item.name ? ` · ${item.name}` : ''}${item.amount != null ? ` · ${money(item.amount)}` : ''}${item.occurredAt ? ` · ${item.occurredAt}` : ''}`;
}

function showCandidatePreview(layer, original, candidates) {
  pending = candidates;
  layer.querySelector('section').innerHTML = `<header><div><span>等待你确认</span><h2>请核对以下内容</h2><p>你的原话：${escapeHtml(original)}</p></div></header><div class="live-confirm">${pending.map((item, index) => `<p><strong>${escapeHtml(candidateText(item))}</strong><span class="live-actions">${item.amount != null ? `<button type="button" data-action="edit-candidate" data-index="${index}">修改</button>` : ''}<button type="button" data-action="remove-candidate" data-index="${index}">移除</button></span></p>`).join('')}</div><p class="live-message" role="status"></p><footer><button type="button" data-cancel>取消</button><button class="live-primary" type="button" data-confirm>确认保存</button></footer>`;
  layer.querySelector('[data-cancel]').addEventListener('click', () => layer.remove());
  layer.querySelectorAll('[data-action="remove-candidate"]').forEach((button) => button.addEventListener('click', () => {
    pending.splice(Number(button.dataset.index), 1);
    if (pending.length) showCandidatePreview(layer, original, pending); else openCapture(original);
  }));
  layer.querySelectorAll('[data-action="edit-candidate"]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.index);
    const item = pending[index];
    layer.querySelector('section').innerHTML = `<header><div><span>修改金额</span><h2>${escapeHtml(candidateText(item).split(' · ')[0])}</h2></div></header><form class="live-form"><label>金额<input name="amount" inputmode="decimal" value="${escapeHtml(item.amount)}" required></label><p class="live-message" role="status"></p><footer><button type="button" data-cancel>返回</button><button class="live-primary" type="submit">保存修改</button></footer></form>`;
    layer.querySelector('[data-cancel]').addEventListener('click', () => showCandidatePreview(layer, original, pending));
    layer.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const amount = Number(new FormData(event.currentTarget).get('amount'));
      if (!Number.isFinite(amount) || amount < 0) return showMessage(layer, '金额格式无效。');
      pending[index] = { ...item, amount };
      showCandidatePreview(layer, original, pending);
    });
  }));
  layer.querySelector('[data-confirm]').addEventListener('click', () => {
    commitCandidates(pending, 'natural_language');
    layer.remove();
  });
}

function openPrecise(conditionId = '') {
  const editable = state.cashReality.conditions.filter((item) => ['balance', 'reserve', 'daily_floor', 'recurring_income', 'recurring_expense', 'known_event'].includes(item.type));
  const selected = editable.find((item) => item.id === conditionId) || editable[0];
  const layer = modal(`<header><div><span>修改金额</span><h2>选择要修改的金额</h2></div><button type="button" data-close aria-label="关闭">×</button></header><form class="live-form"><label>选择项目<select name="condition">${editable.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected?.id ? 'selected' : ''}>${escapeHtml(displayName(item.name || conditionLabel(item)))}</option>`).join('')}</select></label><label>新的金额<input name="amount" inputmode="decimal" value="${selected?.amount ?? ''}" required></label><p class="live-message" role="status"></p><footer><button class="live-primary" type="submit">下一步核对</button></footer></form>`, '修改金额');
  const conditionSelect = layer.querySelector('[name="condition"]');
  const amountInput = layer.querySelector('[name="amount"]');
  conditionSelect.addEventListener('change', () => {
    const item = editable.find((entry) => entry.id === conditionSelect.value);
    amountInput.value = item?.amount ?? '';
    amountInput.focus();
    amountInput.select();
  });
  layer.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = editable.find((entry) => entry.id === form.get('condition'));
    const amount = Number(form.get('amount'));
    if (!item || !Number.isFinite(amount) || amount < 0) return showMessage(layer, '金额格式无效。');
    layer.querySelector('section').innerHTML = `<header><div><span>保存前核对</span><h2>${escapeHtml(displayName(item.name || conditionLabel(item)))}</h2></div></header><div class="live-confirm"><p>新的金额 <strong>${money(amount)}</strong></p></div><footer><button type="button" data-cancel>取消</button><button class="live-primary" type="button" data-confirm>确认保存</button></footer>`;
    layer.querySelector('[data-cancel]').addEventListener('click', () => layer.remove());
    layer.querySelector('[data-confirm]').addEventListener('click', () => {
      if (item.type === 'balance') commitCandidates([{ type: 'balance_confirmation', amount, occurredAt: today() }], 'precise_edit');
      else {
        const reality = normalizeCashReality({ ...state.cashReality, conditions: state.cashReality.conditions.map((entry) => entry.id === item.id ? { ...entry, amount, confirmedAt: nowIso(), captureSource: 'precise_edit' } : entry) });
        saveReality(reality, 'precise_edit_confirmed');
      }
      layer.remove();
    });
  });
}

function openOccurrenceChange(id, mode) {
  const occurrence = buildExpectedOccurrences(state.cashReality, { asOf: today(), horizonDays: 0 }).find((item) => item.id === id);
  if (!occurrence) return;
  const isAmount = mode === 'amount';
  const layer = modal(`<header><div><span>事项核对</span><h2>${isAmount ? '金额变化' : '日期变化'}</h2><p>${escapeHtml(occurrence.conditionName)} · 原预计 ${money(occurrence.expectedAmount)} · ${occurrence.expectedDate}</p></div><button type="button" data-close aria-label="关闭">×</button></header><form class="live-form"><label>${isAmount ? '实际金额' : '实际日期'}<input name="value" ${isAmount ? 'inputmode="decimal"' : 'type="date"'} value="${isAmount ? occurrence.expectedAmount : occurrence.expectedDate}" required></label><footer><button class="live-primary" type="submit">预览确认内容</button></footer></form>`, '事项核对');
  layer.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('value');
    const candidate = isAmount ? { type: 'existing_occurrence_amount_change', occurrenceId: id, amount: Number(value) } : { type: 'existing_occurrence_date_change', occurrenceId: id, actualDate: String(value) };
    showCandidatePreview(layer, `${occurrence.conditionName}${isAmount ? '金额' : '日期'}变化`, [candidate]);
  });
}

function openScenario() {
  const layer = modal(`<header><div><span>试算变化</span><h2>看看另一种可能</h2><p>试算只供查看，不会修改已确认的记录。</p></div><button type="button" data-close aria-label="关闭">×</button></header><form class="live-form"><label>收支名称<input name="name" value="一次假设变化" required></label><label>类型<select name="cashflow"><option value="expense">支出</option><option value="income">收入</option></select></label><label>金额<input name="amount" inputmode="decimal" required></label><label>日期<input name="date" type="date" value="${today()}" required></label><footer><button class="live-primary" type="submit">查看试算结果</button></footer></form>`, '试算变化');
  layer.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const patch = createScenarioPatch({ name: form.name, createdAt: nowIso(), operations: [{ type: 'add_one_off', name: form.name, cashflow: form.cashflow, amount: Number(form.amount), occurredAt: form.date }] });
      scenarioResult = runScenarioPatch(state.cashReality, patch, { asOf: today(), horizonDays: futureHorizon });
      layer.remove();
      renderFuture();
    } catch (error) { showMessage(layer, error instanceof Error ? error.message : '模拟内容无效。'); }
  });
}

function commitCandidates(candidates, provenance) {
  try {
    const result = commitRealityCapture(state.cashReality, candidates, { asOf: today(), confirmedAt: nowIso(), provenance });
    saveReality(result.reality, 'reality_capture_confirmed');
  } catch (error) {
    alert(error instanceof Error ? error.message : '这次变化没有保存。');
  }
}

function showMessage(layer, message) {
  const target = layer.querySelector('.live-message');
  if (target) target.textContent = message;
}

function exportBackup() {
  const payload = buildProductStateEnvelope(state, { exportedAt: nowIso() });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `buffer-backup-${today()}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

async function restoreFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const value = JSON.parse(await file.text());
    const preview = prepareBackupPreview(value, { fileName: file.name, fileSize: file.size });
    if (!preview.ok) return alert(preview.message);
    const layer = modal(`<header><div><span>恢复前核对</span><h2>${escapeHtml(preview.summary.fileName)}</h2><p>包含 ${preview.summary.cashConditions} 个已确认项目和 ${preview.summary.cashEvents} 条收支记录。</p></div><button type="button" data-close aria-label="关闭">×</button></header><div class="live-confirm"><p>备份版本 <strong>${preview.summary.schemaVersion}</strong></p><p>无法使用的内容 <strong>${preview.skippedItems}</strong></p></div><footer><button type="button" data-close-again>取消</button><button class="live-primary" type="button" data-restore>确认恢复</button></footer>`, '恢复备份');
    layer.querySelector('[data-close-again]').addEventListener('click', () => layer.remove());
    layer.querySelector('[data-restore]').addEventListener('click', () => {
      state = { ...preview.payload, schemaVersion: 9, cashReality: normalizeCashReality(preview.payload.cashReality), visualSkinId: SITE_APPEARANCE };
      saveReality(state.cashReality, 'backup_restored');
      layer.remove();
    });
  } catch { alert('备份文件无法读取。'); }
  event.target.value = '';
}

renderAll();
