const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('mini program exposes only the four current product tabs', () => {
  const config = JSON.parse(read('miniprogram/app.json'));
  const expectedPages = [
    'pages/reality/index',
    'pages/future/index',
    'pages/conditions/index',
    'pages/history/index'
  ];
  assert.deepEqual(config.pages, expectedPages);
  assert.deepEqual(config.tabBar.list.map((item) => item.text), ['现在', '未来', '条件', '记录']);
  assert.deepEqual(config.tabBar.list.map((item) => item.pagePath), expectedPages);
});

test('every current tab has a complete native page and no retired product language remains', () => {
  const required = ['reality', 'future', 'conditions', 'history'];
  for (const page of required) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.equal(fs.existsSync(path.join(miniRoot, 'pages', page, `index.${extension}`)), true, `${page} needs index.${extension}`);
    }
  }

  const currentFiles = fs.readdirSync(miniRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|json|wxml|wxss)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name));
  const source = currentFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const term of ['岗位', '求职', '投递', '高级版', '支付', '会员', '今晚三件事']) {
    assert.equal(source.includes(term), false, `retired term must be removed: ${term}`);
  }
});

test('six skins have unique page language instead of color-only aliases', () => {
  const { SKINS, getSkin } = require('../miniprogram/core/skins');
  assert.equal(SKINS.length, 6);
  assert.deepEqual(SKINS.map((skin) => skin.id), [
    'ink-contours', 'wallet-weather', 'pixel-garden', 'felt-islands', 'riso-waves', 'sticker-field'
  ]);
  assert.equal(new Set(SKINS.map((skin) => skin.realityKind)).size, 6);
  assert.equal(new Set(SKINS.map((skin) => skin.historyKind)).size, 6);
  assert.equal(new Set(SKINS.map((skin) => skin.changeNoun)).size, 6);
  assert.equal(getSkin('missing').id, 'ink-contours');
});

test('current-state model is truthful for unknown, current and boundary states', () => {
  const { buildRealityModel } = require('../miniprogram/core/reality');
  const unknown = buildRealityModel({ cash: { balance: '', reserve: '', daily: '' } });
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.runwayDays, null);
  assert.equal(unknown.zone, null);
  assert.deepEqual(unknown.trajectory, []);

  const survival = buildRealityModel({ cash: { balance: '1200', reserve: '200', daily: '100' }, confirmedAt: '2026-08-14T08:00:00.000Z', rangeDays: 7 });
  assert.equal(survival.runwayDays, 10);
  assert.equal(survival.zone, 'survival');
  assert.equal(survival.trajectory.length, 8);
  assert.equal(survival.trajectory.at(-1).balance, 500);

  assert.equal(buildRealityModel({ cash: { balance: 3500, reserve: 500, daily: 100 } }).zone, 'warning');
  assert.equal(buildRealityModel({ cash: { balance: 6500, reserve: 400, daily: 100 } }).zone, 'safe');
});

test('cash updates store absolute truth and append an auditable change record', () => {
  const { applyCashChange } = require('../miniprogram/core/state');
  const initial = { version: 2, cash: { balance: 1000, reserve: 100, daily: 50 }, changes: [], skinId: 'ink-contours' };
  const result = applyCashChange(initial, {
    balance: '900.50', reserve: '100', daily: '45.5', note: '确认了新的最低支出'
  }, '2026-08-14T09:00:00.000Z', 'change-1');
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.cash, { balance: 900.5, reserve: 100, daily: 45.5 });
  assert.equal(result.state.changes[0].id, 'change-1');
  assert.equal(result.state.changes[0].before.balance, 1000);
  assert.equal(result.state.changes[0].after.balance, 900.5);
  assert.equal(result.state.changes[0].note, '确认了新的最低支出');

  assert.equal(applyCashChange(initial, { balance: '-1', reserve: '0', daily: '10' }).ok, false);
  assert.equal(applyCashChange(initial, { balance: '1', reserve: '0', daily: '0' }).ok, false);
  const missingReserve = applyCashChange(initial, { balance: '1', reserve: '', daily: '10' });
  assert.equal(missingReserve.ok, false);
  assert.match(missingReserve.errors.reserve, /保留金/);
});

test('state normalization rejects damaged evidence and keeps safe defaults', () => {
  const {
    emptyState, normalizeCash, normalizeChange, normalizeState, selectSkin, validateDraft
  } = require('../miniprogram/core/state');

  assert.deepEqual(emptyState().cash, { balance: '', reserve: '', daily: '' });
  assert.deepEqual(normalizeCash({ balance: 'oops', reserve: -1, daily: undefined }), { balance: '', reserve: 0, daily: '' });
  assert.equal(normalizeChange(null), null);
  assert.equal(normalizeChange([]), null);
  assert.equal(normalizeChange({ occurredAt: 'not-a-date', cashDelta: 1 }), null);
  assert.equal(normalizeChange({ date: '2026-08-14', after: { balance: '', daily: 10 } }), null);
  assert.equal(normalizeChange({ date: '2026-08-14', cashDelta: 'bad' }), null);

  const current = normalizeChange({
    createdAt: '2026-08-14T11:00:00.000Z',
    before: { balance: 100, reserve: 10, daily: 5 },
    after: { balance: 90, reserve: 10, daily: 5 },
    note: '  已确认  '
  }, 2);
  assert.equal(current.id, 'change-3');
  assert.equal(current.note, '已确认');
  assert.equal(current.before.balance, 100);

  const legacy = normalizeChange({ id: 'old', date: '2026-08-13', cashDelta: '-3.456' });
  assert.equal(legacy.legacyDelta, -3.46);
  assert.equal(legacy.note, '历史现金变化');

  assert.deepEqual(normalizeState([]).changes, []);
  assert.equal(normalizeState({ changes: [current] }).confirmedAt, current.occurredAt);
  assert.equal(normalizeState({ confirmedAt: '2026-08-14T12:00:00.000Z' }).confirmedAt, '2026-08-14T12:00:00.000Z');
  assert.equal(selectSkin(emptyState(), 'sticker-field').skinId, 'sticker-field');
  assert.equal(selectSkin(emptyState(), 'missing').skinId, 'ink-contours');
  assert.equal(validateDraft({ balance: 1, reserve: 0, daily: 1 }).ok, true);
});

test('legacy mini state migrates only cash facts and never revives retired domains', () => {
  const { normalizeState } = require('../miniprogram/core/state');
  const next = normalizeState({
    cash: { balance: 800, daily: 40 },
    records: [{ id: 1, date: '2026-08-13', cashDelta: -20, note: '真实变化' }],
    jobs: [{ id: 9, role: '旧岗位' }],
    projects: [{ id: 10, name: '旧项目' }],
    entitlement: { status: 'active' }
  });
  assert.deepEqual(next.cash, { balance: 800, reserve: 0, daily: 40 });
  assert.equal(next.changes.length, 1);
  assert.equal('jobs' in next, false);
  assert.equal('projects' in next, false);
  assert.equal('entitlement' in next, false);
});

test('portable backup round-trips mini state and safely imports website schema 9 cash reality', () => {
  const { createBackup, importBackup } = require('../miniprogram/core/transfer');
  const state = {
    version: 2,
    cash: { balance: 8888, reserve: 1200, daily: 173 },
    confirmedAt: '2026-08-14T08:00:00.000Z',
    changes: [],
    skinId: 'felt-islands'
  };
  const backup = createBackup(state, '2026-08-14T10:00:00.000Z');
  assert.equal(backup.kind, 'buffer-zone-mini-backup');
  assert.equal(backup.schemaVersion, 1);
  assert.deepEqual(importBackup(backup).state.cash, state.cash);
  assert.equal(importBackup(backup).state.skinId, 'felt-islands');

  const website = importBackup({
    schemaVersion: 9,
    cash: { balance: 6280, reserve: 1200, daily: 173, monthly: 5200 },
    records: [{ id: 1, date: '2026-08-13', cashDelta: -36, note: '来自官网' }],
    cashReality: { conditions: [{ id: 'balance', type: 'balance', amount: 6280, status: 'confirmed', source: 'user_confirmed' }], events: [], scenarioDrafts: [] },
    visualSkinId: 'pixel-garden'
  });
  assert.equal(website.ok, true);
  assert.deepEqual(website.state.cash, { balance: 6280, reserve: 1200, daily: 173 });
  assert.equal(website.state.changes.length, 1);
  assert.equal(website.state.cashReality.conditions.length, 1);
  assert.equal(website.state.skinId, 'pixel-garden');
  assert.equal(importBackup({ schemaVersion: 999 }).ok, false);
});

test('history model filters real changes and downgrades sparse visual evidence honestly', () => {
  const { buildHistoryModel } = require('../miniprogram/core/history');
  const make = (day, balance) => ({
    id: `c-${day}`,
    occurredAt: `2026-08-${String(day).padStart(2, '0')}T08:00:00.000Z`,
    after: { balance, reserve: 100, daily: 50 },
    note: `第 ${day} 天`
  });
  const base = { now: '2026-08-14T12:00:00.000Z' };
  assert.equal(buildHistoryModel({ ...base, changes: [], rangeDays: 30 }).mode, 'empty');
  assert.equal(buildHistoryModel({ ...base, changes: [make(14, 900)], rangeDays: 30 }).mode, 'snapshot');
  assert.equal(buildHistoryModel({ ...base, changes: [make(13, 950), make(14, 900)], rangeDays: 30 }).mode, 'points');
  const line = buildHistoryModel({ ...base, changes: Array.from({ length: 8 }, (_, index) => make(index + 7, 1200 - index * 40)), rangeDays: 7 });
  assert.equal(line.mode, 'line');
  assert.equal(line.points.length, 8);
  assert.equal(line.delta, -280);
  assert.equal(buildHistoryModel({ ...base, changes: [make(1, 2000)], rangeDays: 7 }).points.length, 0);
});

test('native page contracts prioritize observation and expose honest chart fallbacks', () => {
  const reality = read('miniprogram/pages/reality/index.wxml');
  const future = read('miniprogram/pages/future/index.wxml');
  const conditions = read('miniprogram/pages/conditions/index.wxml');
  const history = read('miniprogram/pages/history/index.wxml');

  for (const marker of ['data-skin', '现金构成', '最近确认']) assert.match(reality, new RegExp(marker));
  for (const marker of ['现金未来轨迹', '预计触及保留金', '点位解释', '模拟一个变化']) assert.match(future, new RegExp(marker));
  for (const marker of ['现金起点', '固定收支', '已知未来事件']) assert.match(conditions, new RegExp(marker));
  assert.match(history, /本人确认/);
  assert.match(history, /六套皮肤/);
  assert.match(history, /导出备份/);
  assert.match(history, /从剪贴板导入/);
});
