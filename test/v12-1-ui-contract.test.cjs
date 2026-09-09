const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const panel = read('src/v12-reality-capture-panel.jsx');
const styles = read('src/v12-reality-capture.css');
const main = read('src/main.jsx');
const miniSettings = read('miniprogram/pages/settings/index.wxml');
const vite = read('vite.config.js');
const worker = read('server/worker.js');

test('Reality Capture uses the hybrid server parser instead of a fixed deterministic adapter', () => {
  assert.match(panel, /createV12_1RealityParser/);
  assert.doesNotMatch(panel, /createDeterministicRealityParserAdapter\(\)/);
  assert.match(panel, /正在整理这句话里的现实变化/);
});

test('partial success renders confirmable facts and one compact clarification without chat UI', () => {
  assert.match(panel, /status === 'partial'/);
  assert.match(panel, /clarifications/);
  assert.match(styles, /v12-partial-note|v12-inline-clarification/);
  assert.doesNotMatch(panel, /assistant avatar|message bubble|chat history|有什么能帮你|AI 正在思考/);
});

test('mixed Reality and Scenario stays visible at confirmation without adding a chat flow', () => {
  assert.match(panel, /scenarioItems\?\.length/);
  assert.match(panel, /假设部分.*没有进入现实|没有进入现实.*假设部分/);
});

test('provider error preserves text and exposes retry, precise edit and balance checkpoint', () => {
  assert.match(panel, /重新解析/);
  assert.match(panel, /精确修改/);
  assert.match(panel, /确认余额/);
  assert.match(panel, /originalText/);
});

test('privacy copy accurately discloses external parsing and minimal data transfer', () => {
  assert.match(panel, /必要文字.*模型服务|模型服务.*必要文字/);
  assert.match(panel, /完整历史.*不会发送|不会发送.*完整历史/);
  assert.match(main, /自然语言解析.*模型服务/s);
  assert.match(main, /当前原句.*当前日期.*必要.*摘要/s);
  assert.match(main, /完整历史.*备份.*身份资料.*无关/s);
  assert.match(miniSettings, /官网.*模型服务/s);
  assert.match(miniSettings, /小程序.*本地/s);
});

test('all six current skins have an explicit V12.1 capture treatment', () => {
  for (const id of ['ink-contours', 'wallet-weather', 'pixel-garden', 'felt-islands', 'riso-waves', 'sticker-field']) {
    assert.match(styles, new RegExp(`\\[data-skin="${id}"\\]`), id);
  }
  assert.doesNotMatch(styles, /cozy-islands|signal-poster/);
});

test('local preview and production worker expose the same server-side parser route', () => {
  assert.match(vite, /api\/reality\/parse/);
  assert.match(vite, /DEEPSEEK_API_KEY/);
  assert.match(worker, /api\/reality\/parse/);
  assert.match(worker, /handleRealityParserRequest/);
  assert.doesNotMatch(panel, /DEEPSEEK_API_KEY|api\.deepseek\.com/);
});
