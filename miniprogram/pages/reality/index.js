const store = require('../../utils/store');
const { buildRealityModel } = require('../../core/reality');
const { getSkin } = require('../../core/skins');
const { formatMoney, formatTime, applySkinChrome } = require('../../utils/view');
const { createSceneState } = require('../../core/viewport');
const { parseMiniRealityMessage, buildMiniDueOccurrences } = require('../../core/v12-reality-capture');

const ZONES = [
  { id: 'survival', label: '生死期', range: '<15天' },
  { id: 'danger', label: '危险期', range: '15-29天' },
  { id: 'warning', label: '警戒期', range: '30-60天' },
  { id: 'safe', label: '安全期', range: '>60天' }
];

Page({
  data: {
    skin: getSkin(), skinClass: 'skin-ink-contours', rangeDays: 30,
    model: buildRealityModel(), zones: ZONES,
    balanceLabel: '待确认', reserveLabel: '待确认', usableLabel: '待确认', dailyLabel: '待确认', confirmedLabel: '还没有确认记录',
    captureOpen: false, captureMode: 'home', captureBalance: '', captureText: '', captureMessage: '', candidateItems: [], dueItems: [],
    ...createSceneState('reality')
  },
  onShow() { this.refresh(); },
  refresh() {
    const state = store.load();
    const skin = applySkinChrome(state.skinId);
    const model = buildRealityModel({ ...state, rangeDays: this.data.rangeDays });
    const zones = ZONES.map((zone) => ({ ...zone, active: zone.id === model.zone }));
    this.setData({
      skin, skinClass: `skin-${skin.id}`, model, zones,
      balanceLabel: model.cash ? formatMoney(model.cash.balance) : '待确认',
      reserveLabel: model.cash ? formatMoney(model.cash.reserve) : '待确认',
      usableLabel: model.cash ? formatMoney(model.cash.usable) : '待确认',
      dailyLabel: model.cash ? formatMoney(model.cash.daily) : '待确认',
      confirmedLabel: formatTime(model.confirmedAt),
      dueItems: buildMiniDueOccurrences(state).map((item) => ({ ...item, amountLabel: `${item.direction === 'expense' ? '−' : '＋'}${formatMoney(item.amount)}` }))
    });
  },
  selectScene(event) {
    this.setData(createSceneState('reality', Number(event.currentTarget.dataset.index)));
  },
  changeScene(event) {
    this.setData(createSceneState('reality', Number(event.detail.current)));
  },
  goChange() { this.setData({ captureOpen: true, captureMode: 'home', captureMessage: '', candidateItems: [] }); },
  closeCapture() { this.setData({ captureOpen: false, captureMode: 'home', captureMessage: '', candidateItems: [] }); },
  noop() {},
  setCaptureMode(event) { this.setData({ captureMode: event.currentTarget.dataset.mode, captureMessage: '' }); },
  setCaptureBalance(event) { this.setData({ captureBalance: event.detail.value, captureMessage: '' }); },
  setCaptureText(event) { this.setData({ captureText: event.detail.value, captureMessage: '' }); },
  confirmBalance() {
    const amount = Number(this.data.captureBalance);
    if (!Number.isFinite(amount) || amount < 0) return this.setData({ captureMessage: '请输入实际可用现金总额' });
    const result = store.captureReality([{ type: 'balance_confirmation', amount, occurredAt: new Date().toISOString().slice(0, 10) }], { provenance: 'manual_balance' });
    if (!result.ok) return this.setData({ captureMessage: result.message || '本机保存失败' });
    this.setData({ captureMode: 'complete', captureMessage: '', balanceLabel: formatMoney(result.summary.balance) });
    this.refresh();
  },
  parseNatural() {
    const result = parseMiniRealityMessage(this.data.captureText, { asOf: new Date().toISOString().slice(0, 10) });
    if (result.status !== 'candidates') return this.setData({ captureMessage: result.message, candidateItems: [] });
    const labels = { balance_confirmation: '当前余额', one_off_income: '已发生收入', one_off_expense: '已发生支出', recurring_income: '固定收入', recurring_expense: '固定支出' };
    const candidateItems = result.candidates.map((item, index) => ({ ...item, index, label: labels[item.type] || '现实变化', amountLabel: formatMoney(item.amount), direction: item.type === 'one_off_expense' ? '−' : item.type === 'one_off_income' ? '＋' : '' }));
    this.setData({ captureMode: 'confirm', captureMessage: '', candidateItems });
  },
  removeCandidate(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ candidateItems: this.data.candidateItems.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, index: itemIndex })) });
  },
  confirmCandidates() {
    const candidates = this.data.candidateItems.map(({ index, label, amountLabel, direction, ...item }) => item);
    const result = store.captureReality(candidates, { provenance: 'natural_language' });
    if (!result.ok) return this.setData({ captureMessage: result.message || '这次变化没有写入' });
    this.setData({ captureMode: 'complete', captureMessage: '', balanceLabel: formatMoney(result.summary.balance) });
    this.refresh();
  },
  confirmDue(event) {
    const occurrenceId = event.currentTarget.dataset.id;
    const result = store.captureReality([{ type: 'existing_occurrence_confirmation', occurrenceId }], { provenance: 'quick_occurrence' });
    if (!result.ok) return this.setData({ captureMessage: result.message || '这项预计事项无法确认' });
    this.setData({ captureMode: 'complete', captureMessage: '' });
    this.refresh();
  },
  voiceUnavailable() { this.setData({ captureMessage: '小程序语音转写暂不可用，请直接输入文字' }); },
  goPreciseConditions() { this.closeCapture(); wx.switchTab({ url: '/pages/conditions/index' }); }
});
