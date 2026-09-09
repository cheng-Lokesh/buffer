const store = require('../../utils/store');
const { getSkin } = require('../../core/skins');
const { buildRealityModel } = require('../../core/reality');
const { formatMoney, formatChanges, applySkinChrome } = require('../../utils/view');
const { createSceneState, paginateItems } = require('../../core/viewport');

Page({
  data: {
    skin: getSkin(), skinClass: 'skin-ink-contours', isEditing: false,
    draft: { balance: '', reserve: '', daily: '', note: '' }, errors: {},
    changes: [], latestChange: null, recordPage: paginateItems([], 0, 3), hasCash: false, runwayLabel: '待确认', zoneLabel: '暂无法判断',
    ...createSceneState('changes')
  },
  onShow() { this.refresh(); },
  refresh() {
    const state = store.load();
    const skin = applySkinChrome(state.skinId);
    const model = buildRealityModel(state);
    const changes = formatChanges(state.changes);
    this.setData({
      skin, skinClass: `skin-${skin.id}`,
      changes, latestChange: changes[0] || null, recordPage: paginateItems(changes, this.data.recordPage.page, 3), hasCash: model.status === 'current',
      runwayLabel: model.status === 'current' ? `${model.runwayDays} 天` : '待确认',
      zoneLabel: model.zoneLabel
    });
  },
  beginEdit() {
    const state = store.load();
    this.setData({
      isEditing: true, errors: {},
      draft: { balance: String(state.cash.balance), reserve: String(state.cash.reserve), daily: String(state.cash.daily), note: '' },
      ...createSceneState('changes', 1)
    });
  },
  cancelEdit() { this.setData({ isEditing: false, errors: {}, ...createSceneState('changes', 0) }); },
  selectScene(event) { this.setData(createSceneState('changes', Number(event.currentTarget.dataset.index))); },
  changeScene(event) { this.setData(createSceneState('changes', Number(event.detail.current))); },
  previousRecords() { this.setData({ recordPage: paginateItems(this.data.changes, this.data.recordPage.page - 1, 3) }); },
  nextRecords() { this.setData({ recordPage: paginateItems(this.data.changes, this.data.recordPage.page + 1, 3) }); },
  setField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`draft.${field}`]: event.detail.value, [`errors.${field}`]: '' });
  },
  saveChange() {
    const result = store.recordCash(this.data.draft);
    if (!result.ok) {
      this.setData({ errors: result.errors || { storage: '本机保存失败，请稍后再试' } });
      return;
    }
    this.setData({ isEditing: false, errors: {}, draft: { balance: '', reserve: '', daily: '', note: '' }, ...createSceneState('changes', 0) });
    this.refresh();
    wx.showToast({ title: '变化已保存', icon: 'success' });
  }
});
