const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('mini program exposes the same four V8 spaces as the website', () => {
  const config = JSON.parse(read('miniprogram/app.json'));
  assert.deepEqual(config.pages, [
    'pages/reality/index',
    'pages/future/index',
    'pages/conditions/index',
    'pages/history/index'
  ]);
  assert.deepEqual(config.tabBar.list.map((item) => item.text), ['现在', '未来', '条件', '记录']);
  assert.deepEqual(config.tabBar.list.map((item) => item.pagePath), config.pages);
});

test('mini state v3 preserves old cash and changes while adding isolated V8 reality', () => {
  const { STATE_VERSION, normalizeState } = require('../miniprogram/core/state');
  assert.equal(STATE_VERSION, 3);
  const state = normalizeState({
    version: 2,
    cash: { balance: 1000, reserve: 200, daily: 20 },
    changes: [{ id: 'old', occurredAt: '2026-08-20T08:00:00.000Z', after: { balance: 1000, reserve: 200, daily: 20 } }],
    skinId: 'felt-islands'
  });
  assert.deepEqual(state.cash, { balance: 1000, reserve: 200, daily: 20 });
  assert.equal(state.changes.length, 1);
  assert.equal(state.cashReality.conditions.length, 3);
  assert.deepEqual(state.cashReality.events, []);
  assert.deepEqual(state.cashReality.scenarioDrafts, []);
});

test('mini store records typed V8 events without discarding legacy history', () => {
  const stateCore = require('../miniprogram/core/state');
  const initial = stateCore.normalizeState({ cash: { balance: 1000, reserve: 200, daily: 20 }, changes: [] });
  const expense = stateCore.applyV8CashEvent(initial, { type: 'expense', occurredAt: '2026-08-20', amount: 50 }, 'event-1', '2026-08-20T09:00:00.000Z');

  assert.equal(expense.ok, true);
  assert.equal(expense.state.cash.balance, 950);
  assert.equal(expense.state.cashReality.events.length, 1);
  assert.equal(expense.state.changes.length, 0);
  const confirmed = stateCore.applyV8CashEvent(expense.state, { type: 'balance_confirmation', occurredAt: '2026-08-20', amount: 900 }, 'event-2', '2026-08-20T10:00:00.000Z');
  assert.equal(confirmed.state.cash.balance, 900);
});

test('future page exposes trajectory, point explanation and isolated simulation', () => {
  for (const extension of ['js', 'json', 'wxml', 'wxss']) assert.equal(fs.existsSync(path.join(root, 'miniprogram/pages/future', `index.${extension}`)), true);
  const wxml = read('miniprogram/pages/future/index.wxml');
  for (const marker of ['现金未来轨迹', '预计触及保留金', '点位解释', '期初余额', '期末余额', '模拟一个变化', '不会修改现实', '放弃模拟', '保存模拟草稿']) assert.match(wxml, new RegExp(marker));
  assert.doesNotMatch(wxml, /应用为现实|可能收入/);
});

test('conditions and records keep common editing to one layer and preserve skin plus backup tools', () => {
  for (const page of ['conditions', 'history']) for (const extension of ['js', 'json', 'wxml', 'wxss']) assert.equal(fs.existsSync(path.join(root, 'miniprogram/pages', page, `index.${extension}`)), true);
  const conditions = read('miniprogram/pages/conditions/index.wxml');
  for (const marker of ['现金起点', '保留边界', '最低日常支出', '固定收支', '已知未来事件']) assert.match(conditions, new RegExp(marker));
  const records = read('miniprogram/pages/history/index.wxml');
  for (const marker of ['本人确认', '六套皮肤', '导出备份', '从剪贴板导入']) assert.match(records, new RegExp(marker));
});

test('all four pages keep one-screen swipe scenes and six-skin roots', () => {
  for (const page of ['reality', 'future', 'conditions', 'history']) {
    const wxml = read(`miniprogram/pages/${page}/index.wxml`);
    assert.match(wxml, /class="screen \{\{skinClass\}\}"/);
    assert.match(wxml, /scene-tabs/);
    assert.match(wxml, /scene-deck/);
    assert.match(wxml, /swiper-item/);
  }
  const css = read('miniprogram/app.wxss');
  for (const skin of ['ink-contours', 'wallet-weather', 'pixel-garden', 'felt-islands', 'riso-waves', 'sticker-field']) assert.match(css, new RegExp(`skin-${skin}`));
});
