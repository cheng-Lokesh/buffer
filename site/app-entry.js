import { createV12_1RealityParser } from '../src/v12-1-browser-adapter.js';
import { buildRealityCaptureContext, commitRealityCapture, validateRealityCandidates } from '../src/v12-reality-capture.js';
import { buildCashRealityProjection, buildNowSummary, buildExpectedOccurrences, captureTemporalMemory, normalizeCashReality, createScenarioPatch, runScenarioPatch, saveScenarioDraft } from '../src/v8-cash-reality.js';
import { adaptLegacyCashToV8Reality } from '../src/v8-legacy-adapter.js';
import { buildProductStateEnvelope } from '../src/state-envelope.js';
import { persistProductState } from '../src/product-persistence.js';
import { prepareBackupPreview } from '../src/backup-restore.js';
import { buildNowDashboardFacts } from '../src/v12-1-now-dashboard-facts.js';
import { buildNowForecastChart } from '../src/v12-1-now-forecast-chart.js';
import { createBalanceAxis, formatChartAmount } from '../src/v12-1-chart-axis.js';
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
let nowChartObserver = null;
let futureChartObserver = null;
let nowSelectedDay = null;
let futureSelectedDay = null;
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
  nowSelectedDay = null;
  futureSelectedDay = null;
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

function chartDayAtClientX(event, body, lastDay, left, rightGap) {
  const bounds = body.getBoundingClientRect();
  const chartWidth = body.clientWidth;
  const fraction = (event.clientX - bounds.left - left) / Math.max(1, chartWidth - left - rightGap);
  return Math.max(0, Math.min(lastDay, Math.round(fraction * lastDay)));
}

function chartKeyboardDay(event, currentDay, lastDay) {
  if (event.key === 'Home') return 0;
  if (event.key === 'End') return lastDay;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') return Math.max(0, currentDay - 1);
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') return Math.min(lastDay, currentDay + 1);
  return null;
}

function chartLookupActions(space) {
  return `<button class="chart-lookup-toggle" type="button" data-testid="${space}-chart-lookup-toggle" data-lookup-mode="date" aria-controls="${space}-chart-lookup" aria-expanded="false">查某天余额</button><button class="chart-lookup-toggle" type="button" data-testid="${space}-chart-balance-toggle" data-lookup-mode="balance" aria-controls="${space}-chart-lookup" aria-expanded="false">查余额日期</button>`;
}

function chartLookupMarkup(space, points) {
  if (!points?.length) return '';
  const months = [...new Set(points.map((point) => point.date.slice(0, 7)))];
  return `<div class="chart-lookup" id="${space}-chart-lookup" data-testid="${space}-chart-lookup" hidden>
    <div class="chart-lookup-heading"><strong data-role="lookup-title">哪一天还剩多少？</strong><button type="button" data-role="lookup-close" aria-label="关闭查询">×</button></div>
    <div data-role="lookup-date"><div class="chart-lookup-shortcuts">${[0, 7, 30].filter((day) => day < points.length).map((day) => `<button type="button" data-lookup-day="${day}">${day ? `${day}天后` : '今天'}</button>`).join('')}</div><div class="chart-date-selects"><label>月份<select data-role="lookup-month" aria-label="月份">${months.map((month) => `<option value="${month}">${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月</option>`).join('')}</select></label><label>日期<select data-role="lookup-day" aria-label="日期"></select></label></div></div>
    <form data-role="lookup-balance" hidden><label>余额降到（元）<input data-role="lookup-amount" type="number" inputmode="decimal" step="0.01" placeholder="输入金额"></label><button type="submit">查看日期</button><span class="chart-lookup-hint">找第一次降到这个金额或更低的日期</span></form>
    <p role="status" aria-live="polite"></p>
  </div>`;
}

function bindChartLookup(root, space, points, balanceCentsAt, selectDay) {
  const toggles = [...root.querySelectorAll(`[data-lookup-mode][aria-controls="${space}-chart-lookup"]`)];
  const panel = root.querySelector(`[data-testid="${space}-chart-lookup"]`);
  if (!toggles.length || !panel) return;
  let mode = 'date';
  const status = panel.querySelector('[role="status"]');
  const setMode = (value) => {
    mode = value;
    panel.dataset.mode = mode;
    panel.querySelector('[data-role="lookup-date"]').hidden = mode !== 'date';
    panel.querySelector('[data-role="lookup-balance"]').hidden = mode !== 'balance';
    panel.querySelector('[data-role="lookup-title"]').textContent = mode === 'date' ? '哪一天还剩多少？' : '余额什么时候降到？';
    toggles.forEach((button) => button.setAttribute('aria-expanded', String(!panel.hidden && button.dataset.lookupMode === mode)));
  };
  const close = () => { panel.hidden = true; setMode(mode); toggles.find((button) => button.dataset.lookupMode === mode)?.focus(); };
  toggles.forEach((toggle) => toggle.addEventListener('click', () => {
    const nextMode = toggle.dataset.lookupMode;
    if (!panel.hidden && mode === nextMode) { close(); return; }
    panel.hidden = false;
    setMode(nextMode);
    status.textContent = mode === 'date' ? resultText(currentDay()) : '';
    panel.querySelector(mode === 'date' ? '[data-role="lookup-day"]' : '[data-role="lookup-amount"]').focus();
  }));
  panel.querySelector('[data-role="lookup-close"]').addEventListener('click', close);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  const monthSelect = panel.querySelector('[data-role="lookup-month"]');
  const daySelect = panel.querySelector('[data-role="lookup-day"]');
  const currentDay = () => Math.min(points.length - 1, Number(root.querySelector(`[data-testid="${space === 'now' ? 'now-forecast-chart' : 'future-chart-body'}"]`)?.getAttribute('aria-valuenow')) || 0);
  const resultText = (day) => `${dateFullZh(points[day].date)} · ${day ? '预计余额' : '当前余额'} ${centsMoney(balanceCentsAt(points[day], day))}`;
  const choose = (day, focusRole, message = resultText(day)) => {
    const raw = panel.querySelector('[data-role="lookup-amount"]').value;
    selectDay(day);
    const nextPanel = root.querySelector(`[data-testid="${space}-chart-lookup"]`);
    const nextToggle = root.querySelector(`[data-lookup-mode="${mode}"][aria-controls="${space}-chart-lookup"]`);
    nextToggle.click();
    nextPanel.querySelector('[data-role="lookup-amount"]').value = raw;
    nextPanel.querySelector('[role="status"]').textContent = message;
    nextPanel.querySelector(`[data-role="${focusRole}"]`).focus();
  };
  const fillDays = (month, preferred) => {
    const dates = points.filter((point) => point.date.startsWith(`${month}-`));
    daySelect.innerHTML = dates.map((point) => `<option value="${point.date}">${Number(point.date.slice(8, 10))}日</option>`).join('');
    daySelect.value = dates.reduce((nearest, point) => !nearest || Math.abs(Number(point.date.slice(8)) - Number(preferred)) < Math.abs(Number(nearest.date.slice(8)) - Number(preferred)) ? point : nearest, null)?.date || '';
  };
  monthSelect.value = points[currentDay()].date.slice(0, 7);
  fillDays(monthSelect.value, points[currentDay()].date.slice(8));
  monthSelect.addEventListener('change', () => {
    fillDays(monthSelect.value, daySelect.value.slice(8));
    const day = points.findIndex((point) => point.date === daySelect.value);
    if (day >= 0) choose(day, 'lookup-month');
  });
  daySelect.addEventListener('change', (event) => {
    const day = points.findIndex((point) => point.date === event.target.value);
    if (day >= 0) choose(day, 'lookup-day');
    else status.textContent = '请选择当前图表范围内的日期';
  });
  panel.querySelectorAll('[data-lookup-day]').forEach((button) => button.addEventListener('click', () => choose(Number(button.dataset.lookupDay), 'lookup-day')));
  panel.querySelector('[data-role="lookup-balance"]').addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = panel.querySelector('[data-role="lookup-amount"]').value.trim();
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isSafeInteger(Math.round(Number(raw) * 100))) {
      status.textContent = '请输入金额，最多保留两位小数';
      return;
    }
    const targetCents = Math.round(Number(raw) * 100);
    const day = points.findIndex((point, index) => balanceCentsAt(point, index) <= targetCents);
    if (day < 0) {
      status.textContent = `${points.length - 1} 天内未达到 ${centsMoney(targetCents)}`;
      return;
    }
    choose(day, 'lookup-amount', `首次达到 · ${resultText(day)}`);
  });
}

function dateFullZh(value) {
  if (!value) return '日期待确认';
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(parsed);
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

function futureChartBalance(point, index) {
  return (index === 0 ? point.openingBalanceCents : point.closingBalanceCents) / 100;
}

function placeChartReadout(readout, x, y, width, height) {
  if (!readout) return;
  const readoutWidth = readout.offsetWidth;
  const readoutHeight = readout.offsetHeight;
  readout.style.left = `${Math.max(readoutWidth / 2 + 4, Math.min(width - readoutWidth / 2 - 4, x))}px`;
  const preferredTop = y - readoutHeight - 12 >= 4 ? y - readoutHeight - 12 : y + 12;
  readout.style.top = `${Math.max(4, Math.min(height - readoutHeight - 4, preferredTop))}px`;
}

function paintFutureReferenceChart(root, points, reserveCents, scenarioPoints = [], touchDate = '', selectedDay = null) {
  const body = root.querySelector('[data-testid="future-chart-body"]');
  const svg = body?.querySelector('svg.chart');
  if (!svg || !points.length) return;
  const width = body.clientWidth;
  const height = Math.max(body.clientHeight, 220);
  const left = 58;
  const right = width - 18;
  const top = 28;
  const bottom = height - 54;
  const amounts = [
    ...points.map(futureChartBalance),
    ...scenarioPoints.map(futureChartBalance)
  ];
  const { min: axisMin, max: axisMax, ticks: axisTicks } = createBalanceAxis([reserveCents / 100, ...amounts]);
  const xAt = (index) => left + index / Math.max(1, points.length - 1) * (right - left);
  const yAt = (amount) => bottom - (amount - axisMin) / (axisMax - axisMin) * (bottom - top);
  const path = (items) => items.map((point, index) => `${index ? 'L' : 'M'}${xAt(index).toFixed(1)},${yAt(futureChartBalance(point, index)).toFixed(1)}`).join(' ');
  const grid = axisTicks.map((amount) => `<line x1="${left}" y1="${yAt(amount)}" x2="${right}" y2="${yAt(amount)}" stroke="rgba(140,170,230,.13)"/><text x="${left - 9}" y="${yAt(amount) + 4}" text-anchor="end" fill="#8299bf">${formatChartAmount(amount).replace('¥', '')}</text>`).join('');
  const tickCount = width < 470 ? 2 : 3;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => Math.round(index / tickCount * (points.length - 1)))
    .map((index) => `<text class="axis-date" x="${xAt(index)}" y="${height - 28}" text-anchor="${index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}">${dateZh(points[index].date)}</text><text class="axis-balance" x="${xAt(index)}" y="${height - 12}" text-anchor="${index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}">${formatChartAmount(futureChartBalance(points[index], index))}</text>`).join('');
  const current = points[0];
  const end = points.at(-1);
  const touchIndex = touchDate ? points.findIndex((point) => point.date === touchDate) : -1;
  const touchMarker = touchIndex >= 0 ? `<line x1="${xAt(touchIndex)}" y1="${yAt(futureChartBalance(points[touchIndex], touchIndex))}" x2="${xAt(touchIndex)}" y2="${bottom}" stroke="rgba(200,220,255,.4)" stroke-dasharray="3 4"/><circle cx="${xAt(touchIndex)}" cy="${yAt(futureChartBalance(points[touchIndex], touchIndex))}" r="5" fill="#fff" stroke="#3b82f6" stroke-width="2.4"/>` : '';
  const selected = selectedDay == null ? null : points[selectedDay];
  const selectedMarker = selected ? `<line x1="${xAt(selectedDay)}" y1="${yAt(futureChartBalance(selected, selectedDay))}" x2="${xAt(selectedDay)}" y2="${bottom}" stroke="rgba(200,220,255,.55)" stroke-dasharray="3 4"/><circle cx="${xAt(selectedDay)}" cy="${yAt(futureChartBalance(selected, selectedDay))}" r="7" fill="#fff" stroke="#3b82f6" stroke-width="2.4"/>` : '';
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = `<defs><linearGradient id="futureReferenceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a90ff" stop-opacity=".42"/><stop offset="1" stop-color="#3a70e0" stop-opacity="0"/></linearGradient><filter id="futureReferenceGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><text x="${left}" y="18" fill="#8299bf">余额（人民币）</text>${grid}<path d="${path(points)}L${right},${bottom}L${left},${bottom}Z" fill="url(#futureReferenceArea)"/><line x1="${left}" y1="${yAt(reserveCents / 100)}" x2="${right}" y2="${yAt(reserveCents / 100)}" stroke="#fb5e7e" stroke-width="1.6" stroke-dasharray="7 5"/><path d="${path(points)}" fill="none" stroke="#8fc7ff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="9 5" filter="url(#futureReferenceGlow)"/>${scenarioPoints.length ? `<path d="${path(scenarioPoints)}" fill="none" stroke="#70ddad" stroke-width="2.4" stroke-dasharray="6 5"/>` : ''}<circle cx="${left}" cy="${yAt(futureChartBalance(current, 0))}" r="4" fill="#cfe8ff"/><circle cx="${right}" cy="${yAt(futureChartBalance(end, points.length - 1))}" r="4" fill="#cfe8ff"/>${touchMarker}${selectedMarker}${ticks}`;
  if (selected) placeChartReadout(body.querySelector('[data-testid="future-chart-readout"]'), xAt(selectedDay), yAt(futureChartBalance(selected, selectedDay)), width, height);
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

function nowMetricIcon(name) {
  const paths = {
    balance: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M7 6V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1"/>',
    duration: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    boundary: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M8 14.5h3M8 17.5h5"/>',
    reserve: '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/><path d="m9.5 12 2 2 3.5-4"/>'
  };
  return `<div class="kpi-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#bcd6ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg></div>`;
}

function nowForecastMarkup(chart, summary, node) {
  if (!chart) return '<p class="now-forecast-empty">完整预测数据后，现金走势会显示在这里。</p>';
  const touchCopy = summary.reserveTouchDate ? `预计 ${dateFullZh(summary.reserveTouchDate)} 触及保留金额` : '未来 90 天内未触及保留金额';
  return `<div class="chart-body interactive-chart" data-testid="now-forecast-chart" role="slider" tabindex="0" aria-label="未来 90 天预计余额，点击曲线或按方向键查看日期。${touchCopy}" aria-valuemin="0" aria-valuemax="90" aria-valuenow="${node.day}" aria-valuetext="第 ${node.day} 天，${dateFullZh(node.date)}，预计余额 ${centsMoney(node.balanceCents)}">
    <svg class="chart" aria-hidden="true"></svg>
    <img class="qimg q-moon" src="assets/q_moon.png" alt="" aria-hidden="true">
    <div class="quote q-c1" aria-hidden="true">每一步的克制，<br>都是为未来保留更多自由。</div>
    <div class="quote q-c2" aria-hidden="true">山再远，也有路可走。</div>
    <div class="tip chart-point-readout"><div class="t1">${dateFullZh(node.date)}</div><div class="t2">${node.isTouch ? '预计触及保留金额' : `第 ${node.day} 天预计余额`}</div><div class="t3">${centsMoney(node.balanceCents)}</div></div>
  </div>`;
}

function paintNowReferenceChart(root, chart, summary, node) {
  const chartBody = root.querySelector('[data-testid="now-forecast-chart"]');
  const svg = chartBody?.querySelector('svg.chart');
  const tip = chartBody?.querySelector('.tip');
  if (!svg || !tip || !node) return;
  const width = chartBody.clientWidth;
  const height = Math.max(chartBody.clientHeight, 180);
  const left = 54;
  const right = width - 16;
  const top = 30;
  const bottom = height - 54;
  const values = chart.points.map((point) => point.balanceCents / 100);
  const { min: axisMin, max: axisMax, ticks: axisTicks } = createBalanceAxis([summary.reserveCents / 100, ...values]);
  const xAt = (day) => left + day / 90 * (right - left);
  const yAt = (value) => bottom - (value - axisMin) / (axisMax - axisMin) * (bottom - top);
  const path = chart.points.map((point, index) => `${index ? 'L' : 'M'}${xAt(point.day).toFixed(1)},${yAt(point.balanceCents / 100).toFixed(1)}`).join(' ');
  const grid = axisTicks.map((amount) => `<line x1="${left}" y1="${yAt(amount)}" x2="${right}" y2="${yAt(amount)}" stroke="rgba(140,170,230,.12)" /><text x="${left - 9}" y="${yAt(amount) + 4}" text-anchor="end" fill="#8299bf">${formatChartAmount(amount).replace('¥', '')}</text>`).join('');
  const tickCount = width < 470 ? 2 : 3;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => Math.round(index / tickCount * 90))
    .map((day) => `<text class="axis-date" x="${xAt(day)}" y="${height - 28}" text-anchor="${day === 0 ? 'start' : day === 90 ? 'end' : 'middle'}">${dateZh(chart.points[day].date)}</text><text class="axis-balance" x="${xAt(day)}" y="${height - 12}" text-anchor="${day === 0 ? 'start' : day === 90 ? 'end' : 'middle'}">${formatChartAmount(chart.points[day].balanceCents / 100)}</text>`).join('');
  const selectedX = xAt(node.day);
  const selectedY = yAt(node.balanceCents / 100);
  const todayY = yAt(chart.points[0].balanceCents / 100);
  const reserveY = yAt(summary.reserveCents / 100);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = `<defs><linearGradient id="nowReferenceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a90ff" stop-opacity=".55"/><stop offset=".65" stop-color="#3a70e0" stop-opacity=".18"/><stop offset="1" stop-color="#3a70e0" stop-opacity="0"/></linearGradient><linearGradient id="nowReferenceStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fd0ff"/><stop offset="1" stop-color="#3b82f6"/></linearGradient><filter id="nowReferenceGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><text x="${left}" y="18" fill="#8299bf">余额（人民币）</text>${grid}<path d="${path}L${right},${bottom}L${left},${bottom}Z" fill="url(#nowReferenceArea)"/><line x1="${left}" y1="${reserveY}" x2="${right}" y2="${reserveY}" stroke="#fb5e7e" stroke-width="1.6" stroke-dasharray="7 5"/><path d="${path}" fill="none" stroke="url(#nowReferenceStroke)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="9 5" filter="url(#nowReferenceGlow)"/><circle cx="${left}" cy="${todayY}" r="4" fill="#cfe8ff" filter="url(#nowReferenceGlow)"/><line x1="${selectedX}" y1="${selectedY}" x2="${selectedX}" y2="${bottom}" stroke="rgba(200,220,255,.4)" stroke-dasharray="3 4"/><circle cx="${selectedX}" cy="${selectedY}" r="9" fill="none" stroke="rgba(140,190,255,.55)" stroke-width="1.4"/><circle cx="${selectedX}" cy="${selectedY}" r="4.6" fill="#fff" stroke="#3b82f6" stroke-width="2.4" filter="url(#nowReferenceGlow)"/>${ticks}`;
  placeChartReadout(tip, selectedX, selectedY, width, height);
}

function nowCheckpointMarkup(chart, currentBalanceCents, facts, summary) {
  if (!chart) return '';
  const checkpoints = [30, 60, 90].flatMap((day) => chart.points[day] ? [chart.points[day]] : []);
  const cards = checkpoints.map((point, index) => {
    const delta = point.balanceCents - currentBalanceCents;
    const comparison = delta === 0 ? '与现在相同' : `较现在${delta > 0 ? '多' : '少'} ${centsMoney(Math.abs(delta))}`;
    return `<button class="scn-item${index === 0 ? ' active' : ''}" type="button" data-action="open-future" data-value="${point.day}" aria-label="查看${point.day}天后的预计余额详情"><span class="si" aria-hidden="true">${nowMetricIcon(index === 0 ? 'duration' : index === 1 ? 'boundary' : 'reserve')}</span><span class="shead"><span class="sname">${point.day} 天后</span></span><strong class="checkpoint-value">${centsMoney(point.balanceCents)}</strong><span class="sdesc">${comparison}</span><span class="sfoot"><span class="checkpoint-rule" aria-hidden="true"></span><span class="chev" aria-hidden="true">›</span></span></button>`;
  }).join('');
  return `<section class="scn glass" data-testid="now-checkpoints" aria-label="未来关键时间点"><div class="quote q-scn" aria-hidden="true">不同的选择，<br>会打开不同的风景。</div><div class="scn-head"><h2 class="scn-title">未来时点</h2><span class="scn-sub">按已确认信息估算</span></div><div class="scn-list">${cards}<button class="scn-item custom" type="button" data-action="open-scenario"><span class="plus" aria-hidden="true">＋</span><span class="shead"><span class="sname">试算变化</span></span><span class="sdesc">在未来中查看不同情况</span><span class="sfoot"><span class="checkpoint-rule" aria-hidden="true"></span><span class="chev" aria-hidden="true">›</span></span></button><button class="scn-item custom" type="button" data-action="go-space" data-page-target="rec"><span class="plus" aria-hidden="true">↗</span><span class="shead"><span class="sname">已确认记录</span></span><span class="sdesc">查看实际收支</span><span class="sfoot"><span class="checkpoint-rule" aria-hidden="true"></span><span class="chev" aria-hidden="true">›</span></span></button></div></section>`;
}

function renderNow() {
  const root = document.getElementById('page-now');
  nowChartObserver?.disconnect();
  nowChartObserver = null;
  root.removeAttribute('aria-busy');
  if (!baselineReady()) {
    root.innerHTML = `<main class="live-stack" data-testid="reality-empty">${pageHeading('开始使用', '确认当前现金')}<section class="live-empty"><h2>当前余额、保留金额、每日最低支出</h2><button class="live-primary" type="button" data-action="open-baseline">开始设置</button></section></main>`;
    bindActions(root);
    return;
  }
  const view = projection();
  const summary = buildNowSummary(view);
  const facts = buildNowDashboardFacts(state.cashReality, view, today());
  const chart = buildNowForecastChart(view);
  const due = buildExpectedOccurrences(state.cashReality, { asOf: today(), horizonDays: 0 }).filter((item) => item.status === 'due');
  const lastSnapshot = state.cashReality.realitySnapshots.at(-1);
  const balanceCondition = state.cashReality.conditions.find((item) => item.type === 'balance' && item.status === 'confirmed');
  const confirmationDate = lastSnapshot?.asOf || balanceCondition?.confirmedAt?.slice(0, 10) || '';
  const runway = summary.supportDays == null ? '待确认' : `${summary.supportIsLowerBound ? '至少 ' : ''}${summary.supportDays}<span>天</span>`;
  const nodeDay = nowSelectedDay ?? chart?.reserveTouch?.day ?? 60;
  const nodePoint = chart?.points[nodeDay] || null;
  const node = nodePoint ? { ...nodePoint, isTouch: nodeDay === chart.reserveTouch?.day } : null;
  const nodeFlow = view.points.slice(1, nodeDay + 1).reduce((total, point) => {
    total.income += (point.confirmedInflowsCents || 0) + Math.max(0, point.oneOffEventsCents || 0);
    total.fixed += point.recurringOutflowsCents || 0;
    total.daily += point.dailyFloorOutflowsCents || 0;
    total.oneOff += Math.max(0, -(point.oneOffEventsCents || 0));
    return total;
  }, { income: 0, fixed: 0, daily: 0, oneOff: 0 });
  const inspectorFactors = [
    ['已确认收入', nodeFlow.income, 'income', 'duration'],
    ['固定支出', nodeFlow.fixed, 'expense', 'balance'],
    ['最低日常支出', nodeFlow.daily, 'expense', 'boundary'],
    ['一次性支出', nodeFlow.oneOff, 'expense', 'reserve']
  ].map(([label, value, kind, icon]) => `<div class="factor"><span class="fi" aria-hidden="true">${nowMetricIcon(icon)}</span><span class="fname">${label}</span><strong class="fval ${kind}">${value ? `${kind === 'income' ? '+' : '−'}${centsMoney(value)}` : '—'}</strong><span class="farrow${value ? '' : ' flat'}" aria-hidden="true">${value ? kind === 'income' ? '↑' : '↓' : '—'}</span></div>`).join('');
  const forecastContent = nowBillView && billRows.length
    ? `<div class="now-bill-summary">${billObservationCards()}</div>`
    : nowForecastMarkup(chart, summary, node);
  const boundaryValue = summary.reserveTouchDate
    ? dateZh(summary.reserveTouchDate)
    : summary.supportIsLowerBound
      ? '90 天内未触及'
      : '待确认';
  const checkpointMarkup = !nowBillView || !billRows.length ? nowCheckpointMarkup(chart, summary.balanceCents, facts, summary) : '';
  const dueMarkup = due.length ? `<section class="live-panel due-ledger"><header><div><span>待确认</span><h2>已经到期的事项</h2></div></header><div class="live-list">${due.map((item) => `<article><div><strong>${escapeHtml(displayName(item.conditionName))}</strong><small>${item.expectedDate} · ${money(item.expectedAmount)}</small></div><div class="live-actions"><button type="button" data-action="confirm-occurrence" data-id="${escapeHtml(item.id)}">如期发生</button><button type="button" data-action="change-occurrence-amount" data-id="${escapeHtml(item.id)}">金额变化</button><button type="button" data-action="change-occurrence-date" data-id="${escapeHtml(item.id)}">日期变化</button><button type="button" data-action="skip-occurrence" data-id="${escapeHtml(item.id)}">没有发生</button></div></article>`).join('')}</div></section>` : '';
  root.innerHTML = `
    <main class="live-stack live-space-now now-reference-live" data-testid="now-observatory">
      <section class="title-row"><h1 class="page-title">你的现金航向</h1><span class="page-sub">按已确认信息，观察现金未来的变化</span><div class="now-title-actions"><button class="now-update-action" type="button" data-action="open-capture">更新情况</button><span class="date-pill glass"><span><span class="d1">今天</span><strong class="d2">${dateFullZh(today())}</strong></span></span></div></section>
      <section class="kpis" data-testid="now-overview-metrics" aria-label="当前现金摘要">
        <article class="kpi glass">${nowMetricIcon('balance')}<div><span class="kpi-label">当前余额</span><strong class="kpi-value">${centsMoney(summary.balanceCents)}</strong><span class="kpi-sub">${confirmationDate ? `最近确认 ${dateZh(confirmationDate)}` : '本人确认'}</span></div></article>
        <article class="kpi glass">${nowMetricIcon('duration')}<div><span class="kpi-label">可支撑时间</span><strong class="kpi-value">${runway}</strong><span class="kpi-sub">按已确认信息估算</span></div></article>
        <article class="kpi glass">${nowMetricIcon('boundary')}<div><span class="kpi-label">触及保留金额</span><strong class="kpi-value">${boundaryValue}</strong><span class="kpi-sub">${summary.reserveTouchDate ? `第 ${summary.supportDays} 天` : '未来 90 天'}</span></div></article>
        <article class="kpi glass">${nowMetricIcon('reserve')}<div><span class="kpi-label">保留金额</span><strong class="kpi-value">${centsMoney(summary.reserveCents)}</strong><span class="kpi-sub">本人设定</span></div></article>
      </section>
      <section class="middle" data-testid="now-cash-course">
        <section class="chart-card glass" data-testid="now-projection-milestones"><div class="chart-head"><h2 class="chart-title"><span aria-hidden="true">★</span>未来画布</h2>${chart && (!nowBillView || !billRows.length) ? chartLookupActions('now') : ''}<div class="chart-tabs">${billRows.length ? `<button class="tab${nowBillView ? '' : ' active'}" type="button" data-action="show-forecast" aria-pressed="${!nowBillView}">现金预估</button><button class="tab${nowBillView ? ' active' : ''}" type="button" data-action="show-bill-observation" aria-pressed="${nowBillView}">账单观察</button>` : [30, 60, 90].map((day) => `<button class="tab${day === 90 ? ' active' : ''}" type="button" data-action="open-future" data-value="${day}" aria-label="查看未来 ${day} 天详情">${day} 天</button>`).join('')}<span class="cur-select">人民币 (¥)</span></div></div>${chart && (!nowBillView || !billRows.length) ? chartLookupMarkup('now', chart.points) : ''}${forecastContent}${nowBillView && billRows.length ? '' : `<div class="chart-legend"><span class="lg"><i class="dot"></i>当前确认</span><span class="lg"><i class="dash"></i>预计余额</span><span class="lg"><i class="red"></i>保留金额（${centsMoney(summary.reserveCents)}）</span><span class="lg"><i class="dot"></i>关键节点</span></div>`}</section>
        <aside class="node-card glass" data-testid="now-cash-inspector"><div class="node-head"><h2 class="node-title">节点详情</h2><button class="node-more" type="button" data-action="open-future" data-value="90">查看未来详情 <span aria-hidden="true">›</span></button></div><div class="node-date-row"><strong class="node-date">${node ? dateFullZh(node.date) : '待确认'}</strong><span class="node-day">第 ${nodeDay} 天</span></div><span class="node-desc">${node?.isTouch ? '预计触及你设定的保留金额' : '未来的一个观察时点'}</span><span class="node-bal-label">预计余额</span><div class="node-bal-row"><strong class="node-bal">${node ? centsMoney(node.balanceCents) : '待确认'}</strong><span class="node-badge">${node?.isTouch ? '触及保留金额' : '按当前情况'}</span></div><div class="factor-title">主要影响因素（较今天）</div>${inspectorFactors}<div class="node-note"><span aria-hidden="true">✦</span><p>按本人已确认的信息估算；预计变化不会修改当前记录。</p></div></aside>
      </section>
      ${dueMarkup}${checkpointMarkup}
    </main>`;
  bindActions(root);
  if (chart && (!nowBillView || !billRows.length)) bindChartLookup(root, 'now', chart.points, (point) => point.balanceCents, (day) => {
    nowSelectedDay = day;
    renderNow();
    root.querySelector('[data-testid="now-forecast-chart"]')?.focus();
  });
  if (chart && node && (!nowBillView || !billRows.length)) {
    const chartBody = root.querySelector('[data-testid="now-forecast-chart"]');
    if (chartBody) {
      const repaint = () => paintNowReferenceChart(root, chart, summary, node);
      repaint();
      nowChartObserver = new ResizeObserver(repaint);
      nowChartObserver.observe(chartBody);
      chartBody.addEventListener('click', (event) => {
        nowSelectedDay = chartDayAtClientX(event, chartBody, 90, 54, 16);
        renderNow();
      });
      chartBody.addEventListener('keydown', (event) => {
        const day = chartKeyboardDay(event, nodeDay, 90);
        if (day == null) return;
        event.preventDefault();
        nowSelectedDay = day;
        renderNow();
        root.querySelector('[data-testid="now-forecast-chart"]')?.focus();
      });
    }
  }
}

function renderFuture() {
  const root = document.getElementById('page-future');
  futureChartObserver?.disconnect();
  futureChartObserver = null;
  if (!baselineReady()) {
    root.innerHTML = `<main class="live-stack">${pageHeading('未来', '还不能计算', '缺少的信息不会显示为零。')}<section class="live-empty"><h2>先在“现在”完成设置</h2><p>确认当前金额后，才能查看未来变化。</p></section></main>`;
    return;
  }
  if (scenarioResult) {
    try { scenarioResult = runScenarioPatch(state.cashReality, scenarioResult.patch, { asOf: today(), horizonDays: futureHorizon }); }
    catch { scenarioResult = null; }
  }
  const view = buildCashRealityProjection(state.cashReality, { asOf: today(), horizonDays: futureHorizon });
  const points = view.points || [];
  const end = points.at(-1);
  const selectedDay = Math.min(futureSelectedDay ?? Math.round(futureHorizon / 2), futureHorizon);
  const selectedPoint = points[selectedDay];
  const selectedBalance = selectedPoint ? futureChartBalance(selectedPoint, selectedDay) * 100 : null;
  const scenarioPoints = (scenarioResult?.scenario?.points || []).slice(0, futureHorizon + 1);
  const meaningful = points.filter((item) => item.drivers.some((driver) => driver.sourceType !== 'daily_floor')).slice(0, 8);
  const midpoint = points[Math.floor(futureHorizon / 2)];
  const timeline = [
    { date: points[0]?.date, kind: '已确认', label: '当前余额', amount: centsMoney(points[0]?.openingBalanceCents), tone: '' },
    ...meaningful.map((point) => ({ date: point.date, kind: '预计', label: displayName(point.drivers.find((driver) => driver.sourceType !== 'daily_floor')?.label || '已确认收支'), amount: point.drivers.filter((driver) => driver.sourceType !== 'daily_floor').map((driver) => signedCents(driver.amountCents, driver.direction)).join(' · '), tone: point.drivers.some((driver) => driver.direction === 'inflow') ? 'green' : 'rose' })),
    ...(midpoint ? [{ date: midpoint.date, kind: '预计', label: `${Math.floor(futureHorizon / 2)} 天后余额`, amount: centsMoney(midpoint.closingBalanceCents), tone: '' }] : []),
    ...(view.reserveTouch.date ? [{ date: view.reserveTouch.date, kind: '边界', label: '预计触及保留金额', amount: centsMoney(view.reserveCents), tone: 'rose' }] : []),
    { date: end?.date, kind: '范围末', label: `${futureHorizon} 天后预计余额`, amount: centsMoney(end?.closingBalanceCents), tone: 'gray' }
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const horizonCards = [30, 60, 90].map((days) => {
    const horizon = days === futureHorizon ? view : buildCashRealityProjection(state.cashReality, { asOf: today(), horizonDays: days });
    return `<article class="fut-card${days === futureHorizon ? ' active' : ''}"><span class="fc-name"><i class="fc-dot" aria-hidden="true"></i>未来 ${days} 天</span><span class="fc-rows"><span class="fc-r">预计余额<b>${centsMoney(horizon.points?.at(-1)?.closingBalanceCents)}</b></span><span class="fc-r">保留金额<b>${centsMoney(horizon.reserveCents)}</b></span><span class="fc-r">边界日期<b>${horizon.reserveTouch.date ? dateZh(horizon.reserveTouch.date) : '期间未触及'}</b></span></span></article>`;
  }).join('');
  const scenarioSaved = scenarioResult && state.cashReality.scenarioDrafts.some((draft) => draft.id === scenarioResult.patch.id);
  const scenarioMarkup = scenarioResult ? `<section class="reference-scenario" data-testid="future-scenario-result"><strong>试算结果${scenarioSaved ? ' · 已保存' : ''}</strong><p>${escapeHtml(scenarioResult.operationSummaries.join('；'))}</p><small>范围末预计相差 ${centsMoney(scenarioResult.delta.rangeEndBalanceCents)}</small><div class="live-actions">${scenarioSaved ? '' : '<button type="button" data-action="save-scenario">保存试算</button>'}<button type="button" data-action="clear-scenario">关闭试算</button></div></section>` : '';
  const savedScenarioMarkup = state.cashReality.scenarioDrafts.length ? `<section class="reference-saved-scenarios" aria-label="保存的试算"><h3>保存的试算</h3>${state.cashReality.scenarioDrafts.map((draft) => `<button type="button" data-action="open-saved-scenario" data-id="${escapeHtml(draft.id)}" aria-pressed="${scenarioResult?.patch.id === draft.id}">${escapeHtml(draft.name || '未命名试算')}<span>查看</span></button>`).join('')}</section>` : '';
  root.innerHTML = `<main class="live-stack live-space-future reference-secondary reference-future">
    <section class="title-row"><h1 class="page-title">你的未来轨迹</h1><span class="page-sub">按已确认信息估算</span><button class="now-update-action" type="button" data-action="open-scenario">试算变化</button></section>
    <section class="kpis" aria-label="未来摘要"><article class="kpi glass">${nowMetricIcon('balance')}<div><span class="kpi-label">当前余额</span><strong class="kpi-value">${centsMoney(points[0]?.openingBalanceCents)}</strong><span class="kpi-sub">本人已确认</span></div></article><article class="kpi glass">${nowMetricIcon('duration')}<div><span class="kpi-label">${futureHorizon} 天后预计余额</span><strong class="kpi-value">${centsMoney(end?.closingBalanceCents)}</strong><span class="kpi-sub">按当前条件</span></div></article><article class="kpi glass">${nowMetricIcon('boundary')}<div><span class="kpi-label">保留金额边界</span><strong class="kpi-value">${view.reserveTouch.date ? dateZh(view.reserveTouch.date) : '期间未触及'}</strong><span class="kpi-sub">保留金额 ${centsMoney(view.reserveCents)}</span></div></article></section>
    <section class="fut-mid"><article class="chart-card glass" data-testid="future-canvas"><div class="chart-head"><h2 class="chart-title"><span aria-hidden="true">★</span>未来画布</h2>${chartLookupActions('future')}<div class="chart-tabs">${[30, 60, 90].map((days) => `<button class="tab${days === futureHorizon ? ' active' : ''}" type="button" data-action="horizon" data-value="${days}" aria-pressed="${days === futureHorizon}">${days} 天</button>`).join('')}</div></div>${chartLookupMarkup('future', points)}<div class="chart-body interactive-chart" data-testid="future-chart-body" role="slider" tabindex="0" aria-label="未来预计余额，点击曲线或按方向键查看日期" aria-valuemin="0" aria-valuemax="${futureHorizon}" aria-valuenow="${selectedDay}" aria-valuetext="第 ${selectedDay} 天，${dateFullZh(selectedPoint.date)}，${selectedDay === 0 ? '当前余额' : '预计余额'} ${centsMoney(selectedBalance)}"><svg class="chart" aria-hidden="true"></svg><div class="quote q-fut" aria-hidden="true">每条路，<br>都有它自己的风景。</div><div class="tip chart-point-readout" data-testid="future-chart-readout"><div class="t1">${dateFullZh(selectedPoint.date)}</div><div class="t2">${selectedDay === 0 ? '当前余额' : '预计余额'}</div><div class="t3">${centsMoney(selectedBalance)}</div></div></div><div class="chart-legend"><span class="lg"><i class="line"></i>预计余额</span><span class="lg"><i class="red"></i>保留金额</span>${scenarioPoints.length ? '<span class="lg"><i class="green2"></i>试算结果</span>' : ''}</div></article>
    <aside class="tl-card glass" data-testid="future-inspector"><h2 class="tl-title">关键节点</h2>${selectedPoint ? `<div class="future-selected-point" data-testid="future-selected-point"><span>第 ${selectedDay} 天 · ${dateFullZh(selectedPoint.date)}</span><strong>${selectedDay === 0 ? '当前余额' : '预计余额'} ${centsMoney(selectedBalance)}</strong></div>` : ''}<span class="tl-sub">按时间顺序</span><div class="tl-list">${timeline.map((item) => `<div class="tl-item ${item.tone}"><div class="tl-date">${dateZh(item.date)}<span class="tl-tag">${item.kind}</span></div><div class="tl-desc">${escapeHtml(item.label)} · ${escapeHtml(item.amount)}</div></div>`).join('')}</div>${scenarioMarkup}${savedScenarioMarkup}</aside></section>
    <section class="fut-cards" aria-label="不同时间范围的预计结果">${horizonCards}</section>
  </main>`;
  bindActions(root);
  bindChartLookup(root, 'future', points, (point, index) => index === 0 ? point.openingBalanceCents : point.closingBalanceCents, (day) => {
    futureSelectedDay = day;
    renderFuture();
    root.querySelector('[data-testid="future-chart-body"]')?.focus();
  });
  const chartBody = root.querySelector('[data-testid="future-chart-body"]');
  if (chartBody) {
    const repaint = () => paintFutureReferenceChart(root, points, view.reserveCents, scenarioPoints, view.reserveTouch.date, selectedDay);
    repaint();
    futureChartObserver = new ResizeObserver(repaint);
    futureChartObserver.observe(chartBody);
    chartBody.addEventListener('click', (event) => {
      futureSelectedDay = chartDayAtClientX(event, chartBody, futureHorizon, 58, 18);
      renderFuture();
    });
    chartBody.addEventListener('keydown', (event) => {
      const day = chartKeyboardDay(event, selectedDay ?? 0, futureHorizon);
      if (day == null) return;
      event.preventDefault();
      futureSelectedDay = day;
      renderFuture();
      root.querySelector('[data-testid="future-chart-body"]')?.focus();
    });
  }
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
  const populatedGroups = groups.map(([label, types], groupIndex) => ({ label, groupIndex, items: conditions.filter((item) => item.status === 'confirmed' && types.includes(item.type)) }));
  const summary = baselineReady() ? buildNowSummary(projection()) : null;
  root.innerHTML = `<main class="live-stack live-space-conditions reference-secondary reference-conditions${populatedGroups.filter(({ items }) => items.length).length < 2 ? ' is-sparse' : ''}">
    <section class="title-row"><h1 class="page-title">你的关键条件</h1><span class="page-sub">只展示本人已确认的信息</span><button class="now-update-action" type="button" data-action="open-capture">更新情况</button></section>
    <section class="cond-mid">
      <div class="cond-left" data-testid="conditions-groups">${populatedGroups.map(({ label, groupIndex, items }) => `<section class="set-card glass condition-group group-${groupIndex + 1}${items.length ? '' : ' is-empty'}"><header class="set-head"><span class="si" aria-hidden="true">${nowMetricIcon(groupIndex === 0 ? 'balance' : groupIndex === 1 ? 'duration' : groupIndex === 2 ? 'reserve' : 'boundary')}</span><h2 class="set-name">${label}</h2><span class="set-tag">${items.length} 项</span></header><div class="set-list">${items.length ? items.map((item) => `<div class="li-row"><span class="li-name">${escapeHtml(displayName(item.name || conditionLabel(item)))}</span><span class="li-date">${cadence(item)}</span><b class="${item.type === 'recurring_income' ? 'plus' : ['recurring_expense', 'daily_floor'].includes(item.type) ? 'minus' : ''}">${money(item.amount)}</b><button type="button" data-action="precise-condition" data-id="${escapeHtml(item.id)}" aria-label="修改${escapeHtml(displayName(item.name || conditionLabel(item)))}">修改</button></div>`).join('') : '<p class="set-empty">暂无已确认项目</p>'}</div></section>`).join('')}</div>
      <aside class="cond-right glass" data-testid="conditions-topography"><h2 class="cr-title">这些条件下</h2><span class="cr-sub">按当前信息估算</span><strong class="cr-big">${summary?.supportDays == null ? '待确认' : `${summary.supportIsLowerBound ? '至少 ' : ''}${summary.supportDays}<small> 天</small>`}</strong><span class="cr-label">可支撑时间</span><div class="cr-row"><span>当前余额</span><b>${balance ? money(balance.amount) : '待确认'}</b></div><div class="cr-row"><span>保留金额</span><b>${reserve ? money(reserve.amount) : '待确认'}</b></div><div class="cr-row"><span>最低日支出</span><b>${daily ? `${money(daily.amount)} / 天` : '待确认'}</b></div><div class="cr-row"><span>边界日期</span><b>${summary ? (summary.reserveTouchDate ? dateZh(summary.reserveTouchDate) : '未来 90 天未触及') : '待确认'}</b></div><div class="quote rel condition-quote" aria-hidden="true">数字会如实告诉你，<br>现在站在哪里。</div></aside>
    </section>
  </main>`;
  bindActions(root);
}

function renderRecords() {
  const root = document.getElementById('page-rec');
  if (billView === 'bills') {
    const facts = summarizeBillRows(billRows);
    const list = billRows.map((item) => `<article class="bill-row"><div><time>${item.date ? dateZh(item.date) : '日期待核对'}</time><strong>${escapeHtml(item.category)}</strong><small>${escapeHtml(item.source)} · ${item.reviewReason ? ({ possible_duplicate: '疑似重复', transfer: '资金转移', refund: '退款', failed: '交易未完成', unknown_direction: '收支不明', invalid_field: '字段无效' })[item.reviewReason] : item.status === 'included' ? '已计入观察' : item.status === 'excluded' ? '已排除' : '待核对'}</small></div><b>${item.amountCents == null ? '金额待核对' : `${item.direction === 'income' ? '+' : item.direction === 'expense' ? '-' : ''}${centsMoney(item.amountCents)}`}</b><div class="live-actions">${item.status === 'pending' && !item.reviewReason ? `<button type="button" data-action="bill-status" data-id="${item.id}" data-status="included">计入观察</button>` : ''}${item.status !== 'excluded' ? `<button type="button" data-action="bill-status" data-id="${item.id}" data-status="excluded">排除</button>` : ''}${item.status !== 'pending' ? `<button type="button" data-action="bill-status" data-id="${item.id}" data-status="pending">重新核对</button>` : ''}<button type="button" data-action="bill-remove" data-id="${item.id}">删除</button></div></article>`).join('');
    const clearCount = billRows.filter((row) => row.status === 'pending' && !row.reviewReason && row.category !== '未分类').length;
    const reviewedAmount = (direction, amountCents) => billRows.some((row) => row.status === 'included' && row.direction === direction)
      ? centsMoney(amountCents)
      : billRows.some((row) => row.status === 'pending' && row.direction === direction) ? '待核对' : '暂无';
    root.innerHTML = `<main class="live-stack live-space-records live-bills reference-secondary reference-bills"><section class="title-row"><h1 class="page-title">本机账单</h1><span class="page-sub">导入内容只用于本次观察</span><div class="reference-record-actions"><button type="button" data-action="show-confirmed">已确认记录</button>${billRows.length ? `<button class="now-update-action" type="button" data-action="bill-import">选择 CSV 文件</button>` : ''}<input hidden type="file" accept=".csv,text/csv" data-role="bill-file"></div></section><section class="bill-notice"><strong>只在本次查看</strong><span>账单在浏览器本地整理，不上传；刷新后清除。它不会改变当前余额或未来估算。</span></section>${billError ? `<p class="bill-error" role="alert">${escapeHtml(billError)}</p>` : ''}${billRows.length ? `<section class="bill-summary"><article><span>导入范围</span><strong>${facts.startDate ? `${dateZh(facts.startDate)}至${dateZh(facts.endDate)}` : '待核对'}</strong></article><article><span>已核对支出</span><strong>${reviewedAmount('expense', facts.expenseCents)}</strong></article><article><span>已核对收入</span><strong>${reviewedAmount('income', facts.incomeCents)}</strong></article><article><span>待核对</span><strong>${facts.pendingCount} 笔</strong></article></section><section class="bill-list"><header><h2>逐笔核对</h2><div class="live-actions">${clearCount ? `<button type="button" data-action="bill-review-clear">计入明确的 ${clearCount} 笔</button>` : ''}<button type="button" data-action="bill-clear">清空账单</button></div></header><div>${list}</div></section>` : '<section class="live-empty bill-empty"><h2>选择你本人导出的 CSV 账单</h2><p>支持含日期、收支、金额列的 CSV。文件中的姓名、商户和流水号不会保留。</p><button class="live-primary" type="button" data-action="bill-import">选择 CSV 文件</button></section>'}</main>`;
    bindActions(root);
    root.querySelector('[data-role="bill-file"]')?.addEventListener('change', importBillFile);
    return;
  }
  const records = [...state.cashReality.events].sort((a, b) => `${b.occurredAt}${b.createdAt}`.localeCompare(`${a.occurredAt}${a.createdAt}`));
  const snapshots = [...state.cashReality.realitySnapshots].reverse().slice(0, 5);
  const timelineRows = [
    ...records.map((item) => ({ date: item.occurredAt, sortTime: item.createdAt || '', type: item.type, name: displayName(item.name || conditionLabel(item)), amount: money(item.amount) })),
    ...state.cashReality.realitySnapshots.map((item) => ({ date: item.asOf, sortTime: item.capturedAt || '', type: 'balance', name: '确认当前余额', amount: centsMoney(item.balanceCents) }))
  ].sort((a, b) => `${b.date}${b.sortTime}`.localeCompare(`${a.date}${a.sortTime}`));
  const month = today().slice(0, 7);
  const monthRecords = timelineRows.filter((item) => String(item.date || '').slice(0, 7) === month);
  const monthIncome = monthRecords.filter((item) => item.type === 'income').length;
  const monthExpense = monthRecords.filter((item) => item.type === 'expense').length;
  const monthConfirmations = monthRecords.length - monthIncome - monthExpense;
  root.innerHTML = `<main class="live-stack live-space-records reference-secondary reference-records${timelineRows.length < 3 ? ' is-sparse' : ''}">
    <section class="title-row"><h1 class="page-title">你的记录</h1><span class="page-sub">本人确认的真实变化</span><div class="reference-record-actions"><button type="button" data-action="show-bills">本机账单</button><button type="button" data-action="backup-actions">备份</button><input hidden type="file" accept="application/json" data-role="backup-file"></div></section>
    <section class="rec-mid"><article class="rec-card glass" data-testid="records-timeline"><header class="rec-head"><h2 class="rec-title">时间线</h2><span class="rec-count">共 ${timelineRows.length} 条</span></header><div class="rec-scroll"><div class="tl-list rec-tl">${timelineRows.length ? timelineRows.map((item) => `<div class="tl-item ${item.type === 'income' ? 'green' : item.type === 'expense' ? 'rose' : ''}"><div class="tl-date">${dateZh(item.date)}<span class="tl-tag">${item.type === 'income' ? '收入' : item.type === 'expense' ? '支出' : '余额确认'}</span><strong class="rec-amt ${item.type === 'income' ? 'plus' : item.type === 'expense' ? 'minus' : ''}">${item.type === 'income' ? '+' : item.type === 'expense' ? '−' : ''}${item.amount}</strong></div><div class="tl-desc">${escapeHtml(item.name)}</div></div>`).join('') : '<div class="tl-item gray"><div class="tl-date">现在</div><div class="tl-desc">还没有本人确认的变化</div></div>'}</div></div></article>
    <aside class="rec-side"><section class="rec-stat glass"><h2 class="rs-title">本月记录</h2><div class="rs-row"><i class="rs-dot income" aria-hidden="true"></i>收入<b>${monthIncome} 条</b></div><div class="rs-row"><i class="rs-dot expense" aria-hidden="true"></i>支出<b>${monthExpense} 条</b></div><div class="rs-row"><i class="rs-dot" aria-hidden="true"></i>余额确认<b>${monthConfirmations} 条</b></div></section><section class="rec-stat rec-history glass" data-testid="records-memory"><h2 class="rs-title">历史留档</h2><div class="rs-row"><span>历史记录</span><b>${state.cashReality.realitySnapshots.length} 份</b></div>${snapshots.length ? `<div class="rs-row"><span>最近确认</span><b>${dateZh(snapshots[0].asOf)}</b></div><div class="rs-row"><span>当时余额</span><b>${centsMoney(snapshots[0].balanceCents)}</b></div>` : '<div class="rs-row"><span>尚无历史记录</span></div>'}</section><section class="rec-quote glass"><span class="quote rel" aria-hidden="true">每一次变化，<br>都值得被记住。</span></section></aside></section>
  </main>`;
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
  if (name === 'go-space') {
    if (data.pageTarget === 'rec') { billView = 'confirmed'; renderRecords(); }
    document.querySelector(`.nav-item[data-page="${data.pageTarget}"]`)?.click();
    return;
  }
  if (name === 'open-future') {
    futureHorizon = [30, 60, 90].includes(Number(data.value)) ? Number(data.value) : 90;
    document.querySelector('.nav-item[data-page="future"]')?.click();
    renderFuture();
    return;
  }
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
  if (name === 'open-saved-scenario') {
    const draft = state.cashReality.scenarioDrafts.find((item) => item.id === data.id);
    if (!draft) return;
    try { scenarioResult = runScenarioPatch(state.cashReality, draft, { asOf: today(), horizonDays: futureHorizon }); }
    catch { return alert('这份试算暂时无法查看，已确认的信息没有改变。'); }
    return renderFuture();
  }
  if (name === 'save-scenario' && scenarioResult) {
    state = { ...state, cashReality: saveScenarioDraft(state.cashReality, scenarioResult.patch) };
    savePreferences();
    renderFuture();
    return;
  }
  if (name === 'backup-actions') return openBackupActions();
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
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    else document.querySelector('.nav-item.active')?.focus();
  };
  layer.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) close();
  });
  layer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]')].filter((item) => item.getClientRects().length);
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
  queueMicrotask(() => dialog.querySelector('input, textarea, select, button:not([data-close])')?.focus());
  return layer;
}

function openBaseline(initialValues = {}) {
  const layer = modal(`<header><div><span>首次设置</span><h2>确认三个金额</h2></div><button type="button" data-close aria-label="关闭">×</button></header><form class="live-form"><label>当前余额<input name="balance" inputmode="decimal" value="${escapeHtml(initialValues.balance ?? '')}" required></label><label>保留金额<input name="reserve" inputmode="decimal" value="${escapeHtml(initialValues.reserve ?? '')}" required></label><label>每日最低支出（元/天）<input name="daily" inputmode="decimal" value="${escapeHtml(initialValues.daily ?? '')}" required></label><p class="live-message" role="status"></p><footer><button class="live-primary" type="submit">下一步核对</button></footer></form>`, '首次设置');
  layer.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const numbers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
    if (Object.values(values).some((value) => !String(value).trim()) || Object.values(numbers).some((value) => !Number.isFinite(value) || value < 0)) return showMessage(layer, '请填写有效的非负金额。');
    layer.querySelector('section').innerHTML = `<header><div><span>保存前核对</span><h2>请确认这三个金额</h2></div></header><div class="live-confirm"><p>当前余额 <strong>${money(numbers.balance)}</strong></p><p>保留金额 <strong>${money(numbers.reserve)}</strong></p><p>每日最低支出 <strong>${money(numbers.daily)} / 天</strong></p></div><footer><button type="button" data-back>返回修改</button><button class="live-primary" type="button" data-confirm>确认保存</button></footer>`;
    layer.querySelector('[data-back]').addEventListener('click', () => openBaseline(values));
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
  const editable = state.cashReality.conditions.filter((item) => item.status === 'confirmed' && ['balance', 'reserve', 'daily_floor', 'recurring_income', 'recurring_expense', 'known_event'].includes(item.type));
  if (!editable.length) return openBaseline();
  const selected = editable.find((item) => item.id === conditionId) || editable[0];
  const layer = modal('', '修改金额');
  const renderEdit = (selectedId, draftAmount) => {
    const current = editable.find((item) => item.id === selectedId) || editable[0];
    layer.querySelector('section').innerHTML = `<header><div><span>修改金额</span><h2>选择要修改的金额</h2></div><button type="button" data-close aria-label="关闭">×</button></header><form class="live-form"><label>选择项目<select name="condition">${editable.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === current.id ? 'selected' : ''}>${escapeHtml(displayName(item.name || conditionLabel(item)))}</option>`).join('')}</select></label><label>新的金额（元）<input name="amount" inputmode="decimal" value="${escapeHtml(draftAmount)}" required></label><p class="live-message" role="status"></p><footer><button class="live-primary" type="submit">下一步核对</button></footer></form>`;
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
      const rawAmount = String(form.get('amount') ?? '').trim();
      const amount = Number(rawAmount);
      if (!item || !rawAmount || !Number.isFinite(amount) || amount < 0) return showMessage(layer, '请填写有效的非负金额。');
      if (amount === Number(item.amount)) return showMessage(layer, '金额没有变化，无需重复保存。');
      layer.querySelector('section').innerHTML = `<header><div><span>保存前核对</span><h2>${escapeHtml(displayName(item.name || conditionLabel(item)))}</h2></div><button type="button" data-close aria-label="关闭">×</button></header><div class="live-confirm"><p>原金额 <strong>${money(item.amount)}</strong></p><p>新金额 <strong>${money(amount)}</strong></p></div><footer><button type="button" data-back>返回修改</button><button class="live-primary" type="button" data-confirm>确认保存</button></footer>`;
      layer.querySelector('[data-back]').addEventListener('click', () => { renderEdit(item.id, rawAmount); layer.querySelector('[name="amount"]').focus(); });
      layer.querySelector('[data-confirm]').addEventListener('click', () => {
        if (item.type === 'balance') commitCandidates([{ type: 'balance_confirmation', amount, occurredAt: today() }], 'precise_edit');
        else {
          const reality = normalizeCashReality({ ...state.cashReality, conditions: state.cashReality.conditions.map((entry) => entry.id === item.id ? { ...entry, amount, confirmedAt: nowIso(), captureSource: 'precise_edit' } : entry) });
          saveReality(reality, 'precise_edit_confirmed');
        }
        layer.remove();
      });
      layer.querySelector('[data-back]').focus();
    });
  };
  renderEdit(selected.id, selected.amount ?? '');
  layer.querySelector('[name="amount"]').focus();
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
      document.querySelector('.nav-item[data-page="future"]')?.click();
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

function openBackupActions() {
  const layer = modal(`<header><div><span>本机数据</span><h2>备份与恢复</h2><p>换设备前，先导出备份。恢复时会在核对后替换当前浏览器的数据。</p></div><button type="button" data-close aria-label="关闭">×</button></header><div class="live-actions"><button type="button" data-backup-export>导出备份</button><button type="button" data-backup-import>恢复备份</button></div>`, '备份与恢复');
  layer.querySelector('[data-backup-export]').addEventListener('click', () => { exportBackup(); layer.remove(); });
  layer.querySelector('[data-backup-import]').addEventListener('click', () => {
    layer.remove();
    document.querySelector('#page-rec [data-role="backup-file"]')?.click();
  });
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

document.querySelector('.nav-item[data-page="rec"]')?.addEventListener('click', () => {
  billView = 'confirmed';
  renderRecords();
});

renderAll();
