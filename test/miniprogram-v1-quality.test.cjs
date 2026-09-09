const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'miniprogram');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('mini program package is importable, local-first and below the main-package budget', () => {
  const project = JSON.parse(read('miniprogram/project.config.json'));
  assert.equal(project.compileType, 'miniprogram');
  assert.equal(project.miniprogramRoot, './');
  assert.equal(project.setting.es6, true);

  const files = fs.readdirSync(mini, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name));
  const size = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  assert.ok(size < 2 * 1024 * 1024, `main package is ${size} bytes`);

  const runtimeSource = files.filter((file) => /\.(?:js|json|wxml|wxss)$/.test(file)).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const forbidden of ['wx.request(', 'wx.login(', 'wx.requestPayment(', 'apiBase', 'AUTH_TOKEN', 'WECHAT_MINI_SECRET']) {
    assert.equal(runtimeSource.includes(forbidden), false, `local-first package must not contain ${forbidden}`);
  }
});

test('every declared page has valid JSON, a skin root and a usable back-free tab structure', () => {
  const app = JSON.parse(read('miniprogram/app.json'));
  assert.equal(app.pages.length, 4);
  for (const page of app.pages) {
    const json = JSON.parse(read(`miniprogram/${page}.json`));
    assert.ok(json.navigationBarTitleText);
    const wxml = read(`miniprogram/${page}.wxml`);
    assert.match(wxml, /class="screen \{\{skinClass\}\}" data-skin="\{\{skin\.id\}\}"/);
    assert.equal((wxml.match(/<view\b/g) || []).length, (wxml.match(/<\/view>/g) || []).length, `${page} view tags must balance`);
  }
  assert.match(read('miniprogram/app.wxss'), /env\(safe-area-inset-bottom\)/);
  assert.match(read('miniprogram/app.wxss'), /prefers-reduced-motion/);
  assert.match(read('miniprogram/app.wxss'), /\.segment-item\s*\{[^}]*min-height:\s*88rpx/s);
});

test('storage migrates legacy truth, persists current state and surfaces write failures', () => {
  const values = new Map();
  global.wx = {
    getStorageSync: (key) => values.get(key),
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: (key) => values.delete(key)
  };
  const storePath = require.resolve('../miniprogram/utils/store');
  delete require.cache[storePath];
  const store = require(storePath);

  values.set(store.LEGACY_KEY, { cash: { balance: 2000, daily: 80 }, jobs: [{ role: 'discard' }] });
  assert.deepEqual(store.load().cash, { balance: 2000, reserve: 0, daily: 80 });
  assert.equal(values.has(store.KEY), true);
  assert.equal(store.recordCash({ balance: 1880, reserve: 300, daily: 75, note: '更新' }).ok, true);
  assert.equal(store.load().changes.length, 1);

  global.wx.setStorageSync = () => { throw new Error('quota'); };
  assert.equal(store.save(store.load()).ok, false);
  delete global.wx;
});

test('backup parser rejects empty, malformed, oversized and future formats', () => {
  const { MAX_BACKUP_TEXT, parseBackupText } = require('../miniprogram/core/transfer');
  assert.equal(parseBackupText('').ok, false);
  assert.equal(parseBackupText('{broken').ok, false);
  assert.equal(parseBackupText('x'.repeat(MAX_BACKUP_TEXT + 1)).ok, false);
  assert.equal(parseBackupText(JSON.stringify({ kind: 'buffer-zone-mini-backup', schemaVersion: 2, state: {} })).ok, false);
});

test('scene navigation keeps every tab bounded and paginates long records', () => {
  const { SCENES, normalizePage, createSceneState, paginateItems } = require('../miniprogram/core/viewport');
  assert.deepEqual(Object.keys(SCENES), ['reality', 'future', 'conditions', 'history']);
  assert.equal(createSceneState('reality', 9).activeSceneId, 'evidence');
  assert.equal(createSceneState('future', -1).activeSceneId, 'trajectory');
  assert.equal(createSceneState('missing', 1).activeSceneId, 'structure');
  assert.equal(normalizePage('bad', 3), 0);
  assert.equal(normalizePage(2, 0), 0);
  assert.deepEqual(paginateItems(['a', 'b', 'c', 'd', 'e'], 1, 2), {
    items: ['c', 'd'], page: 1, pageCount: 3, total: 5, hasPrevious: true, hasNext: true
  });
  assert.deepEqual(paginateItems(null, 0, 0), {
    items: [], page: 0, pageCount: 1, total: 0, hasPrevious: false, hasNext: false
  });
});

test('six skins remain visually distinct on all four pages', () => {
  const appWxss = read('miniprogram/app.wxss');
  const pageSources = ['reality', 'future', 'conditions', 'history'].map((page) => read(`miniprogram/pages/${page}/index.wxml`));
  for (const skin of ['ink-contours', 'wallet-weather', 'pixel-garden', 'felt-islands', 'riso-waves', 'sticker-field']) {
    assert.match(appWxss, new RegExp(`\\.skin-${skin}`));
  }
  for (const source of pageSources) assert.match(source, /skinClass/);
  assert.match(pageSources[0], /skin-art/);
  assert.match(pageSources[1], /future-art/);
  assert.match(pageSources[2], /condition-art/);
  assert.match(pageSources[3], /emblem-\{\{skin\.historyKind\}\}/);
  assert.match(pageSources[3], /option-\{\{item\.id\}\}/);
});

test('current documentation and verification no longer describe the mini program as frozen commerce software', () => {
  const readme = read('miniprogram/README.md');
  const verifier = read('scripts/verify-miniprogram-release.cjs');
  assert.match(readme, /当前正式手机端/);
  assert.match(readme, /现在、未来、条件、记录/);
  for (const retired of ['当前冻结', '支付会话', '高级版申请', 'WECHAT_MINI_SECRET']) {
    assert.equal(`${readme}\n${verifier}`.includes(retired), false, `documentation and verifier must remove ${retired}`);
  }
});
