const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');

test('current site retains V12 capabilities around the V12.1 parser', async () => {
  const app = await readFile(resolve(root, 'site/app-entry.js'), 'utf8');

  assert.match(app, /adaptLegacyCashToV8Reality/);
  assert.match(app, /createScenarioPatch/);
  assert.match(app, /runScenarioPatch/);
  assert.match(app, /saveScenarioDraft/);
  assert.match(app, /data-action="remove-candidate"/);
  assert.match(app, /data-action="edit-candidate"/);
  assert.match(app, /直接修改金额/);
  assert.match(app, /重新整理/);
  assert.match(app, /必要文字、日期和金额至中国境内模型服务/);
  assert.match(app, /30 天/);
  assert.match(app, /60 天/);
  assert.match(app, /90 天/);
  assert.match(app, /金额变化/);
  assert.match(app, /日期变化/);
});

test('the current site has one appearance and no skin switching styles', async () => {
  const html = await readFile(resolve(root, 'site/index.src.html'), 'utf8');
  const app = await readFile(resolve(root, 'site/app-entry.js'), 'utf8');
  assert.match(html, /data-skin="ink-contours"/);
  for (const id of ['wallet-weather', 'pixel-garden', 'felt-islands', 'riso-waves', 'sticker-field']) {
    assert.doesNotMatch(html, new RegExp(`data-skin="${id}"`));
  }
  assert.doesNotMatch(html, /\.live-skin\b|\.live-record-skin\b/);
  assert.doesNotMatch(app, /renderSkinControl|VISUAL_SKINS|选择界面风格/);
});
