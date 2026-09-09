const store = require('../../utils/store');
const { SKINS, getSkin } = require('../../core/skins');
const { parseBackupText } = require('../../core/transfer');
const { formatMoney, formatTime, formatChanges, applySkinChrome } = require('../../utils/view');
const { createSceneState, paginateItems } = require('../../core/viewport');

function today() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function eventView(event) {
  const labels = { expense: '支出', income: '收入', balance_confirmation: '余额确认' };
  return { id: event.id, timeLabel: event.occurredAt, typeLabel: labels[event.type] || '现金变化', amountLabel: formatMoney(event.amount), sourceLabel: '本人确认' };
}

Page({
  data: {
    skin: getSkin(), skinClass: 'skin-ink-contours', skins: SKINS,
    draft: { type: 'expense', occurredAt: today(), amount: '' }, errors: {}, records: [], recordPage: paginateItems([], 0, 3),
    dataStatus: '还没有确认现金情况', confirmedLabel: '还没有确认记录', recordCount: 0,
    ...createSceneState('history')
  },
  onShow() { this.refresh(); },
  refresh() {
    const state = store.load();
    const skin = applySkinChrome(state.skinId);
    const typed = state.cashReality.events.map(eventView).reverse();
    const legacy = formatChanges(state.changes).map((item) => ({ id: item.id, timeLabel: item.timeLabel, typeLabel: '现金情况确认', amountLabel: item.balanceLabel, sourceLabel: '本人确认' }));
    const records = [...typed, ...legacy];
    this.setData({
      skin, skinClass: `skin-${skin.id}`, records, recordPage: paginateItems(records, this.data.recordPage.page, 3),
      skins: SKINS.map((item) => ({ ...item, selected: item.id === skin.id })),
      dataStatus: state.cash.balance !== '' && state.cash.daily !== '' ? '现金情况已保存在当前微信' : '还没有确认现金情况',
      confirmedLabel: formatTime(state.confirmedAt), recordCount: records.length
    });
  },
  selectScene(event) { this.setData(createSceneState('history', Number(event.currentTarget.dataset.index))); },
  changeScene(event) { this.setData(createSceneState('history', Number(event.detail.current))); },
  setType(event) { this.setData({ 'draft.type': event.detail.value, 'errors.type': '' }); },
  setDate(event) { this.setData({ 'draft.occurredAt': event.detail.value, 'errors.occurredAt': '' }); },
  setAmount(event) { this.setData({ 'draft.amount': event.detail.value, 'errors.amount': '' }); },
  saveRecord() {
    const result = store.recordV8Event(this.data.draft);
    if (!result.ok) return this.setData({ errors: result.errors || { storage: '本机保存失败' } });
    this.setData({ draft: { type: 'expense', occurredAt: today(), amount: '' }, errors: {} });
    this.refresh(); wx.showToast({ title: '变化已记录', icon: 'success' });
  },
  previousRecords() { this.setData({ recordPage: paginateItems(this.data.records, this.data.recordPage.page - 1, 3) }); },
  nextRecords() { this.setData({ recordPage: paginateItems(this.data.records, this.data.recordPage.page + 1, 3) }); },
  selectSkin(event) {
    const result = store.setSkin(event.currentTarget.dataset.skin);
    if (!result.ok) return wx.showToast({ title: '皮肤未能保存', icon: 'none' });
    this.refresh();
  },
  exportBackup() {
    const text = store.exportText();
    wx.setClipboardData({ data: text, success: () => wx.showModal({ title: '备份已复制', content: '请把这段内容保存在只有你能访问的位置。需要恢复时，再复制回来。', showCancel: false }), fail: () => wx.showToast({ title: '复制失败，请稍后再试', icon: 'none' }) });
  },
  importBackup() {
    wx.getClipboardData({
      success: ({ data }) => {
        const parsed = parseBackupText(data);
        if (!parsed.ok) return wx.showModal({ title: '没有恢复', content: parsed.message, showCancel: false });
        const sourceLabel = parsed.source === 'website' ? '电脑官网备份' : '小程序备份';
        const eventCount = parsed.state.cashReality.events.length;
        wx.showModal({
          title: '确认恢复这份备份',
          content: `${sourceLabel}\n变化与确认记录：${parsed.state.changes.length + eventCount} 条\n皮肤：${getSkin(parsed.state.skinId).name}\n恢复后会替换当前小程序数据。`,
          confirmText: '确认恢复',
          success: ({ confirm }) => {
            if (!confirm) return;
            const result = store.save(parsed.state);
            if (!result.ok) return wx.showToast({ title: '恢复失败', icon: 'none' });
            this.refresh(); wx.showToast({ title: '已恢复', icon: 'success' });
          }
        });
      },
      fail: () => wx.showToast({ title: '无法读取剪贴板', icon: 'none' })
    });
  },
  clearData() {
    wx.showModal({ title: '清空当前微信里的数据', content: '这个操作不能撤销。建议先导出备份，再决定是否清空。', confirmText: '确认清空', confirmColor: '#b34236', success: ({ confirm }) => { if (!confirm) return; const result = store.clear(); if (!result.ok) return wx.showToast({ title: '没有清空', icon: 'none' }); this.refresh(); wx.showToast({ title: '已清空', icon: 'success' }); } });
  }
});
