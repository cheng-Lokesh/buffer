const store = require('../../utils/store');
const { getSkin } = require('../../core/skins');
const { formatMoney, formatTime, applySkinChrome } = require('../../utils/view');
const { createSceneState, paginateItems } = require('../../core/viewport');

function today() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function conditionView(item) {
  const typeLabels = { recurring_income: '固定收入', recurring_expense: '固定支出', known_event: item.eventKind === 'income' ? '未来收入' : '未来支出' };
  const frequencyLabels = { daily: '每天', weekly: '每周', monthly: '每月', once: '一次' };
  return { ...item, typeLabel: typeLabels[item.type] || item.type, amountLabel: formatMoney(item.amount), timingLabel: item.nextOccurrence || item.startDate || '日期待确认', frequencyLabel: frequencyLabels[item.frequency] || '' };
}

Page({
  data: {
    skin: getSkin(), skinClass: 'skin-ink-contours', hasCash: false, confirmedLabel: '还没有确认记录',
    basicsDraft: { balance: '', reserve: '', daily: '', note: '' }, basicsErrors: {},
    frequencyNames: ['每天', '每周', '每月'], frequencyIndex: 2,
    recurringDraft: { kind: 'expense', amount: '', frequency: 'monthly', nextOccurrence: today(), includedInDailyFloor: false }, recurringErrors: {}, recurringItems: [], recurringPage: paginateItems([], 0, 3),
    eventDraft: { kind: 'expense', amount: '', nextOccurrence: today() }, eventErrors: {}, eventItems: [], eventPage: paginateItems([], 0, 3),
    ...createSceneState('conditions')
  },
  onShow() { this.refresh(); },
  refresh() {
    const state = store.load();
    const skin = applySkinChrome(state.skinId);
    const recurring = state.cashReality.conditions.filter((item) => ['recurring_income', 'recurring_expense'].includes(item.type)).map(conditionView);
    const events = state.cashReality.conditions.filter((item) => item.type === 'known_event').map(conditionView);
    this.setData({
      skin, skinClass: `skin-${skin.id}`, hasCash: state.cash.balance !== '' && state.cash.daily !== '', confirmedLabel: formatTime(state.confirmedAt),
      basicsDraft: { balance: String(state.cash.balance), reserve: String(state.cash.reserve), daily: String(state.cash.daily), note: '' },
      recurringItems: recurring, eventItems: events,
      recurringPage: paginateItems(recurring, this.data.recurringPage.page, 3), eventPage: paginateItems(events, this.data.eventPage.page, 3)
    });
  },
  selectScene(event) { this.setData(createSceneState('conditions', Number(event.currentTarget.dataset.index))); },
  changeScene(event) { this.setData(createSceneState('conditions', Number(event.detail.current))); },
  setBasic(event) { const field = event.currentTarget.dataset.field; this.setData({ [`basicsDraft.${field}`]: event.detail.value, [`basicsErrors.${field}`]: '' }); },
  saveBasics() {
    const result = store.recordCash(this.data.basicsDraft);
    if (!result.ok) return this.setData({ basicsErrors: result.errors || { storage: '本机保存失败' } });
    this.setData({ basicsErrors: {} }); this.refresh(); wx.showToast({ title: '基础条件已确认', icon: 'success' });
  },
  setRecurringKind(event) { this.setData({ 'recurringDraft.kind': event.detail.value }); },
  setRecurringAmount(event) { this.setData({ 'recurringDraft.amount': event.detail.value, 'recurringErrors.amount': '' }); },
  setRecurringFrequency(event) {
    const index = Number(event.detail.value);
    this.setData({ frequencyIndex: index, 'recurringDraft.frequency': ['daily', 'weekly', 'monthly'][index] || 'monthly' });
  },
  setRecurringDate(event) { this.setData({ 'recurringDraft.nextOccurrence': event.detail.value }); },
  toggleIncluded(event) { this.setData({ 'recurringDraft.includedInDailyFloor': event.detail.value }); },
  saveRecurring() {
    const draft = this.data.recurringDraft;
    const result = store.addV8CashCondition({ type: draft.kind === 'income' ? 'recurring_income' : 'recurring_expense', amount: draft.amount, frequency: draft.frequency, nextOccurrence: draft.nextOccurrence, includedInDailyFloor: draft.includedInDailyFloor });
    if (!result.ok) return this.setData({ recurringErrors: result.errors || { storage: '本机保存失败' } });
    this.setData({ frequencyIndex: 2, recurringDraft: { kind: 'expense', amount: '', frequency: 'monthly', nextOccurrence: today(), includedInDailyFloor: false }, recurringErrors: {} }); this.refresh(); wx.showToast({ title: '固定条件已加入', icon: 'success' });
  },
  setEventKind(event) { this.setData({ 'eventDraft.kind': event.detail.value }); },
  setEventAmount(event) { this.setData({ 'eventDraft.amount': event.detail.value, 'eventErrors.amount': '' }); },
  setEventDate(event) { this.setData({ 'eventDraft.nextOccurrence': event.detail.value }); },
  saveEvent() {
    const draft = this.data.eventDraft;
    const result = store.addV8CashCondition({ type: 'known_event', eventKind: draft.kind, amount: draft.amount, frequency: 'once', nextOccurrence: draft.nextOccurrence });
    if (!result.ok) return this.setData({ eventErrors: result.errors || { storage: '本机保存失败' } });
    this.setData({ eventDraft: { kind: 'expense', amount: '', nextOccurrence: today() }, eventErrors: {} }); this.refresh(); wx.showToast({ title: '未来事件已加入', icon: 'success' });
  },
  previousRecurring() { this.setData({ recurringPage: paginateItems(this.data.recurringItems, this.data.recurringPage.page - 1, 3) }); },
  nextRecurring() { this.setData({ recurringPage: paginateItems(this.data.recurringItems, this.data.recurringPage.page + 1, 3) }); },
  previousEvents() { this.setData({ eventPage: paginateItems(this.data.eventItems, this.data.eventPage.page - 1, 3) }); },
  nextEvents() { this.setData({ eventPage: paginateItems(this.data.eventItems, this.data.eventPage.page + 1, 3) }); }
});
