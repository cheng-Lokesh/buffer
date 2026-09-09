const store = require('../../utils/store');
const { getSkin } = require('../../core/skins');
const { buildCashRealityProjection, buildNowSummary, explainProjectionPoint, createScenarioPatch, runScenarioPatch } = require('../../core/v8-cash-reality');
const { formatMoney, applySkinChrome, drawTrajectory } = require('../../utils/view');
const { createSceneState } = require('../../core/viewport');

function today() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function moneyFromCents(value) {
  return Number.isFinite(Number(value)) ? formatMoney(Number(value) / 100) : '待确认';
}

function chartPoints(projection) {
  return projection && projection.valid ? projection.points.map((point) => ({ balance: point.closingBalanceCents / 100, reserve: point.reserveCents / 100 })) : [];
}

Page({
  data: {
    skin: getSkin(), skinClass: 'skin-ink-contours', rangeDays: 60,
    projection: null, summary: null, trajectory: [], pointOptions: [], selectedDate: '', selectedPoint: null,
    touchLabel: '待确认', endBalanceLabel: '待确认', openingLabel: '待确认', inflowLabel: '待确认', recurringLabel: '待确认', dailyLabel: '待确认', eventLabel: '待确认', closingLabel: '待确认',
    simulationDaily: '', simulationResult: null, simulationDaysLabel: '尚未模拟', simulationBalanceLabel: '尚未模拟', simulationError: '',
    ...createSceneState('future')
  },
  onShow() { this.refresh(); },
  refresh() {
    const state = store.load();
    const skin = applySkinChrome(state.skinId);
    const projection = buildCashRealityProjection(state.cashReality, { asOf: today(), horizonDays: this.data.rangeDays });
    const summary = buildNowSummary(projection);
    const selectedDate = projection.valid ? (this.data.selectedDate && projection.points.some((point) => point.date === this.data.selectedDate) ? this.data.selectedDate : projection.points[projection.points.length - 1].date) : '';
    const pointOptions = projection.valid ? projection.points.filter((point, index) => index === 0 || index === projection.points.length - 1 || index % 10 === 0).map((point) => ({ date: point.date, label: point.date.slice(5) })) : [];
    this.setData({
      skin, skinClass: `skin-${skin.id}`, projection, summary, selectedDate, pointOptions, trajectory: chartPoints(projection),
      touchLabel: summary.status === 'unknown' ? '待确认' : summary.reserveTouchDate || `超过 ${this.data.rangeDays} 天`,
      endBalanceLabel: summary.status === 'unknown' ? '待确认' : moneyFromCents(summary.rangeEndBalanceCents)
    }, () => { this.refreshPoint(); this.drawActiveChart(); });
  },
  refreshPoint() {
    const point = explainProjectionPoint(this.data.projection, this.data.selectedDate);
    const equation = point && point.equation;
    this.setData({
      selectedPoint: point,
      openingLabel: equation ? moneyFromCents(equation.openingBalanceCents) : '待确认',
      inflowLabel: equation ? moneyFromCents(equation.confirmedInflowsCents) : '待确认',
      recurringLabel: equation ? moneyFromCents(equation.recurringOutflowsCents) : '待确认',
      dailyLabel: equation ? moneyFromCents(equation.dailyFloorOutflowsCents) : '待确认',
      eventLabel: equation ? moneyFromCents(equation.oneOffEventsCents) : '待确认',
      closingLabel: equation ? moneyFromCents(equation.closingBalanceCents) : '待确认'
    });
  },
  drawActiveChart() {
    if (this.data.activeSceneId === 'trajectory' && this.data.trajectory.length > 1) drawTrajectory(this, 'future-chart', this.data.trajectory, this.data.skin.id);
  },
  selectScene(event) { this.setData(createSceneState('future', Number(event.currentTarget.dataset.index)), () => this.drawActiveChart()); },
  changeScene(event) { this.setData(createSceneState('future', Number(event.detail.current)), () => this.drawActiveChart()); },
  setRange(event) { this.setData({ rangeDays: Number(event.currentTarget.dataset.range), selectedDate: '' }, () => this.refresh()); },
  selectPoint(event) { this.setData({ selectedDate: event.currentTarget.dataset.date }, () => this.refreshPoint()); },
  setSimulationDaily(event) { this.setData({ simulationDaily: event.detail.value, simulationError: '' }); },
  runSimulation() {
    const amount = Number(this.data.simulationDaily);
    const state = store.load();
    const condition = state.cashReality.conditions.find((item) => item.type === 'daily_floor');
    if (!condition || !Number.isFinite(amount) || amount <= 0) return this.setData({ simulationError: '请填写大于 0 的每日支出' });
    try {
      const patch = createScenarioPatch({ baseSnapshotId: this.data.projection.engineVersion, changes: [{ conditionId: condition.id, field: 'amount', value: amount }] });
      const result = runScenarioPatch(state.cashReality, patch, { asOf: today(), horizonDays: this.data.rangeDays });
      this.setData({
        simulationResult: result,
        simulationDaysLabel: result.delta.supportDays == null ? '暂无法比较' : `${result.delta.supportDays >= 0 ? '+' : ''}${result.delta.supportDays} 天`,
        simulationBalanceLabel: result.delta.rangeEndBalanceCents == null ? '暂无法比较' : `${result.delta.rangeEndBalanceCents >= 0 ? '+' : '-'}${moneyFromCents(Math.abs(result.delta.rangeEndBalanceCents))}`,
        simulationError: ''
      });
    } catch (error) { this.setData({ simulationError: error.message || '模拟没有完成' }); }
  },
  discardSimulation() { this.setData({ simulationDaily: '', simulationResult: null, simulationDaysLabel: '尚未模拟', simulationBalanceLabel: '尚未模拟', simulationError: '' }); },
  saveSimulation() {
    if (!this.data.simulationResult) return this.setData({ simulationError: '请先运行一次模拟' });
    const result = store.saveV8Scenario(this.data.simulationResult.patch);
    if (!result.ok) return this.setData({ simulationError: result.message || '草稿没有保存' });
    wx.showToast({ title: '模拟草稿已保存', icon: 'success' });
  },
  goConditions() { wx.switchTab({ url: '/pages/conditions/index' }); }
});
