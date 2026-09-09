const store = require('../../utils/store');
const { SKINS, getSkin } = require('../../core/skins');
const { buildRealityModel } = require('../../core/reality');
const { parseBackupText } = require('../../core/transfer');
const { formatTime, applySkinChrome } = require('../../utils/view');
const { createSceneState } = require('../../core/viewport');

Page({
  data: {
    skin: getSkin(), skinClass: 'skin-ink-contours', skins: SKINS,
    dataStatus: '还没有确认现金情况', confirmedLabel: '还没有确认记录', changeCount: 0,
    ...createSceneState('settings')
  },
  selectScene(event) { this.setData(createSceneState('settings', Number(event.currentTarget.dataset.index))); },
  changeScene(event) { this.setData(createSceneState('settings', Number(event.detail.current))); },
  onShow() { this.refresh(); },
  refresh() {
    const state = store.load();
    const skin = applySkinChrome(state.skinId);
    const model = buildRealityModel(state);
    this.setData({
      skin, skinClass: `skin-${skin.id}`,
      skins: SKINS.map((item) => ({ ...item, selected: item.id === skin.id })),
      dataStatus: model.status === 'current' ? '现金情况已保存在当前微信' : '还没有确认现金情况',
      confirmedLabel: formatTime(state.confirmedAt), changeCount: state.changes.length
    });
  },
  selectSkin(event) {
    const result = store.setSkin(event.currentTarget.dataset.skin);
    if (!result.ok) return wx.showToast({ title: '皮肤未能保存', icon: 'none' });
    this.refresh();
  },
  exportBackup() {
    const text = store.exportText();
    wx.setClipboardData({
      data: text,
      success: () => wx.showModal({ title: '备份已复制', content: '请把这段内容保存在只有你能访问的位置。需要恢复时，再复制回来。', showCancel: false }),
      fail: () => wx.showToast({ title: '复制失败，请稍后再试', icon: 'none' })
    });
  },
  importBackup() {
    wx.getClipboardData({
      success: ({ data }) => {
        const parsed = parseBackupText(data);
        if (!parsed.ok) return wx.showModal({ title: '没有恢复', content: parsed.message, showCancel: false });
        const sourceLabel = parsed.source === 'website' ? '电脑官网备份' : '小程序备份';
        const cashReady = parsed.state.cash.balance !== '' && parsed.state.cash.daily !== '';
        wx.showModal({
          title: '确认恢复这份备份',
          content: `${sourceLabel}\n现金情况：${cashReady ? '已包含' : '未包含'}\n变化记录：${parsed.state.changes.length} 条\n恢复后会替换当前小程序数据。`,
          confirmText: '确认恢复',
          success: ({ confirm }) => {
            if (!confirm) return;
            const result = store.save(parsed.state);
            if (!result.ok) return wx.showToast({ title: '恢复失败', icon: 'none' });
            this.refresh();
            wx.showToast({ title: '已恢复', icon: 'success' });
          }
        });
      },
      fail: () => wx.showToast({ title: '无法读取剪贴板', icon: 'none' })
    });
  },
  clearData() {
    wx.showModal({
      title: '清空当前微信里的数据',
      content: '这个操作不能撤销。建议先导出备份，再决定是否清空。',
      confirmText: '确认清空', confirmColor: '#b34236',
      success: ({ confirm }) => {
        if (!confirm) return;
        const result = store.clear();
        if (!result.ok) return wx.showToast({ title: '没有清空', icon: 'none' });
        this.refresh();
        wx.showToast({ title: '已清空', icon: 'success' });
      }
    });
  }
});
