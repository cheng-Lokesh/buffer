const store = require('../../utils/account-store');
const {withAccountView}=require('../../utils/account-view');
const { getSkin } = require('../../core/skins');
const { buildCashRealityProjection, buildNowSummary, explainProjectionPoint, createScenarioPatch, runScenarioPatch, describeScenarioOperation } = require('../../core/v8-cash-reality');
const { scenarioConditionOptions, buildScenarioOperation } = require('../../core/scenario-composer');
const { formatMoney, applySkinChrome, drawTrajectory } = require('../../utils/view');
const { createSceneState } = require('../../core/viewport');
const { parseLookupCents, findBalanceDay, lookupDateOptions, shanghaiDate } = require('../../core/forecast-lookup');

function today() {
  return shanghaiDate();
}

function moneyFromCents(value) {
  return Number.isSafeInteger(value) ? formatMoney(value / 100) : '待确认';
}

function chartPoints(projection) {
  return projection && projection.valid ? projection.points.map((point) => ({ balance: point.closingBalanceCents / 100, reserve: point.reserveCents / 100 })) : [];
}

function simulationView(result){
  return {simulationResult:result,
    simulationDaysLabel:result.delta.supportDays==null?'暂无法比较':`${result.delta.supportDays>=0?'+':''}${result.delta.supportDays} 天`,
    simulationBalanceLabel:result.delta.rangeEndBalanceCents==null?'暂无法比较':`${result.delta.rangeEndBalanceCents>=0?'+':'-'}${moneyFromCents(Math.abs(result.delta.rangeEndBalanceCents))}`,
    simulationError:''};
}

Page(withAccountView({
  data: {
    skin: getSkin(), skinClass: 'skin-ink-contours', rangeDays: 60,
    projection: null, summary: null, trajectory: [], pointOptions: [], selectedDate: '', selectedPoint: null,
    lookupMode: 'date', lookupAmount: '', lookupResult: '', lookupMonths: [], lookupMonthLabels: [], lookupMonthIndex: 0, lookupDates: [], lookupDayLabels: [], lookupDayIndex: 0,
    touchLabel: '待确认', endBalanceLabel: '待确认', openingLabel: '待确认', inflowLabel: '待确认', recurringLabel: '待确认', dailyLabel: '待确认', eventLabel: '待确认', closingLabel: '待确认',
    simulationTypes: ['增加一次收入', '增加一次支出', '新增周期收入', '新增周期支出', '调整已有金额', '暂停一项条件'],
    simulationTypeValues: ['income_once', 'expense_once', 'income_recurring', 'expense_recurring', 'change_amount', 'pause_condition'],
    simulationType: 'income_once', simulationTypeIndex: 0,
    simulationFrequencyLabels: ['每天', '每周', '每月'], simulationFrequencyValues: ['daily', 'weekly', 'monthly'], simulationFrequency: 'monthly', simulationFrequencyIndex: 2,
    simulationName: '', simulationAmount: '', simulationDate: today(),
    simulationConditions: [], simulationConditionIds: [], simulationConditionLabels: [], simulationConditionIndex: 0,
    simulationOperations: [], simulationResult: null, simulationDaysLabel: '尚未模拟', simulationBalanceLabel: '尚未模拟', simulationError: '',
    ...createSceneState('future')
  },
  onShow() { this.refresh(); },
  refresh() {
    const state = store.load();
    const skin = applySkinChrome(state.skinId);
    const projection = buildCashRealityProjection(state.cashReality, { asOf: today(), horizonDays: this.data.rangeDays });
    const summary = buildNowSummary(projection);
    const simulationConditions = scenarioConditionOptions(state.cashReality.conditions, this.data.simulationType);
    const simulationConditionIndex = Math.min(this.data.simulationConditionIndex || 0, Math.max(0, simulationConditions.length - 1));
    const selectedDate = projection.valid ? (this.data.selectedDate && projection.points.some((point) => point.date === this.data.selectedDate) ? this.data.selectedDate : projection.points[projection.points.length - 1].date) : '';
    const pointOptions = projection.valid ? projection.points.filter((point, index) => index === 0 || index === projection.points.length - 1 || index % 10 === 0).map((point) => ({ date: point.date, label: point.date.slice(5) })) : [];
    let simulation={};
    if(this.data.simulationResult){
      try{simulation=simulationView(runScenarioPatch(state.cashReality,this.data.simulationResult.patch,{asOf:today(),horizonDays:this.data.rangeDays}));}
      catch{simulation={simulationResult:null,simulationDaysLabel:'尚未模拟',simulationBalanceLabel:'尚未模拟',simulationError:'现金情况已更新，请重新确认模拟条件'};}
    }
    this.setData({
      ...simulation,skin, skinClass: `skin-${skin.id}`, projection, summary, selectedDate, pointOptions, trajectory: chartPoints(projection),
      simulationConditions, simulationConditionIds: simulationConditions.map(item => item.id), simulationConditionLabels: simulationConditions.map(item => item.label), simulationConditionIndex,
      touchLabel: summary.status === 'unknown' ? '待确认' : summary.reserveTouchDate || `超过 ${this.data.rangeDays} 天`,
      endBalanceLabel: summary.status === 'unknown' ? '待确认' : moneyFromCents(summary.rangeEndBalanceCents)
    }, () => { this.refreshPoint(); this.refreshLookup(); this.drawActiveChart(); });
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
  selectPoint(event) { this.selectLookupDate(event.currentTarget.dataset.date); },
  refreshLookup() {
    const points = this.data.projection && this.data.projection.valid ? this.data.projection.points : [];
    const choices = lookupDateOptions(points, this.data.selectedDate);
    const index = points.findIndex(point => point.date === this.data.selectedDate);
    const point = points[index];
    const cents = point ? (index === 0 ? point.openingBalanceCents : point.closingBalanceCents) : null;
    this.setData({
      lookupMonths: choices.months, lookupMonthLabels: choices.months.map(month => `${month.slice(0, 4)}年${Number(month.slice(5))}月`), lookupMonthIndex: choices.monthIndex,
      lookupDates: choices.dates, lookupDayLabels: choices.dates.map(date => `${Number(date.slice(8))}日`), lookupDayIndex: choices.dayIndex,
      lookupResult: point ? `${point.date} · ${index === 0 ? '当前余额' : '预计余额'} ${moneyFromCents(cents)}` : '先确认基础条件'
    });
  },
  openLookup(event) {
    this.setData({ ...createSceneState('future', 1), lookupMode: event.currentTarget.dataset.mode === 'balance' ? 'balance' : 'date' });
    this.refreshLookup();
  },
  selectLookupDate(date) {
    if (!this.data.projection || !this.data.projection.valid || !this.data.projection.points.some(point => point.date === date)) return;
    this.setData({ selectedDate: date }, () => { this.refreshPoint(); this.refreshLookup(); });
  },
  changeLookupMonth(event) {
    const month = this.data.lookupMonths[Number(event.detail.value)];
    if (!month) return;
    const choices = lookupDateOptions(this.data.projection.points, `${month}-${this.data.selectedDate.slice(8)}`);
    this.selectLookupDate(choices.dates[choices.dayIndex]);
  },
  changeLookupDay(event) { this.selectLookupDate(this.data.lookupDates[Number(event.detail.value)]); },
  setLookupAmount(event) { this.setData({ lookupAmount: event.detail.value }); },
  lookupBalance() {
    if (!this.data.projection || !this.data.projection.valid) return this.setData({ lookupResult: '先确认基础条件' });
    const target = parseLookupCents(this.data.lookupAmount);
    if (target == null) return this.setData({ lookupResult: '请输入金额，最多保留两位小数' });
    const points = this.data.projection.points;
    const index = findBalanceDay(points, target, (point, day) => day === 0 ? point.openingBalanceCents : point.closingBalanceCents);
    if (index < 0) return this.setData({ lookupResult: `${points.length - 1} 天内未达到 ${moneyFromCents(target)}` });
    this.selectLookupDate(points[index].date);
    this.setData({ lookupResult: `首次达到 · ${this.data.lookupResult}` });
  },
  setSimulationName(event) { this.setData({ simulationName: event.detail.value, simulationError: '' }); },
  setSimulationAmount(event) { this.setData({ simulationAmount: event.detail.value, simulationError: '' }); },
  setSimulationType(event) {
    const index = Number(event.detail.value);
    const simulationType = this.data.simulationTypeValues[index] || 'income_once';
    const simulationConditions = scenarioConditionOptions(store.load().cashReality.conditions, simulationType);
    this.setData({ simulationTypeIndex: index, simulationType, simulationConditions, simulationConditionIds: simulationConditions.map(item => item.id), simulationConditionLabels: simulationConditions.map(item => item.label), simulationConditionIndex: 0, simulationError: '' });
  },
  setSimulationFrequency(event) {
    const index = Number(event.detail.value);
    this.setData({ simulationFrequencyIndex: index, simulationFrequency: this.data.simulationFrequencyValues[index] || 'monthly', simulationError: '' });
  },
  setSimulationCondition(event) { this.setData({ simulationConditionIndex: Number(event.detail.value) || 0, simulationError: '' }); },
  setSimulationDate(event) { this.setData({ simulationDate: event.detail.value, simulationError: '' }); },
  addSimulationOperation() {
    const draft = { type: this.data.simulationType, name: this.data.simulationName, amount: this.data.simulationAmount, date: this.data.simulationDate, frequency: this.data.simulationFrequency, conditionId: this.data.simulationConditionIds[this.data.simulationConditionIndex] };
    try {
      const operation = buildScenarioOperation(draft, this.data.simulationConditions);
      const label = describeScenarioOperation(operation, store.load().cashReality);
      this.setData({ simulationOperations: [...this.data.simulationOperations, { ...operation, label }], simulationName: '', simulationAmount: '', simulationError: '', simulationResult: null, simulationDaysLabel: '尚未模拟', simulationBalanceLabel: '尚未模拟' });
    } catch (error) { this.setData({ simulationError: error.message || '请检查这项变化' }); }
  },
  removeSimulationOperation(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ simulationOperations: this.data.simulationOperations.filter((_, itemIndex) => itemIndex !== index), simulationResult: null, simulationDaysLabel: '尚未模拟', simulationBalanceLabel: '尚未模拟' });
  },
  runSimulation() {
    const state = store.load();
    if (!this.data.projection || !this.data.projection.valid) return this.setData({ simulationError: '先确认现金起点、保留金额和日常支出' });
    if (!this.data.simulationOperations.length) return this.setData({ simulationError: '先添加至少一项变化' });
    try {
      const operations = this.data.simulationOperations.map(({ label, ...operation }) => operation);
      const patch = createScenarioPatch({ baseSnapshotId: this.data.projection.engineVersion, operations });
      const result = runScenarioPatch(state.cashReality, patch, { asOf: today(), horizonDays: this.data.rangeDays });
      this.setData(simulationView(result));
    } catch (error) { this.setData({ simulationError: error.message || '模拟没有完成' }); }
  },
  discardSimulation() { this.setData({ simulationName: '', simulationAmount: '', simulationOperations: [], simulationResult: null, simulationDaysLabel: '尚未模拟', simulationBalanceLabel: '尚未模拟', simulationError: '' }); },
  async saveSimulation() {
    if (!this.data.simulationResult) return this.setData({ simulationError: '请先运行一次模拟' });
    const result = await store.saveV8Scenario(this.data.simulationResult.patch);
    if (!result.ok) return this.setData({ simulationError: result.message || '草稿没有保存' });
    wx.showToast({ title: '模拟草稿已保存', icon: 'success' });
  },
  goConditions() { wx.switchTab({ url: '/pages/conditions/index' }); }
},undefined,['saveSimulation']));
