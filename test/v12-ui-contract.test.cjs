const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const experience = read('src/v8-experience.jsx');
const main = read('src/main.jsx');
const panel = read('src/v12-reality-capture-panel.jsx');
const styles = read('src/v12-reality-capture.css');

test('Now opens one unified Reality Capture surface', () => {
  assert.match(experience, /现实有变化/);
  assert.match(experience, /onOpenRealityCapture/);
  assert.match(experience, /RealityCapturePanel/);
  assert.match(main, /commitRealityCapture/);
});

test('capture hierarchy is due, balance, one sentence, then precise edit', () => {
  const due = panel.indexOf('待确认');
  const balance = panel.indexOf('确认现在有多少钱');
  const sentence = panel.indexOf('说一句发生了什么');
  const precise = panel.indexOf('精确修改');
  assert.ok(due >= 0 && balance > due && sentence > balance && precise > sentence);
  assert.doesNotMatch(panel, />Condition<|>Reconciliation<|>balance_confirmation<|>recurring_income</);
});

test('balance asks for only total usable cash and never requires a difference explanation', () => {
  assert.match(panel, /当前用于计算未来的实际可用现金总额/);
  assert.match(panel, /上次确认/);
  assert.doesNotMatch(panel, /差额原因|钱去了哪里|未分类支出|待整理账目|记账完整度/);
});

test('natural language surface is a parser, not a chat assistant', () => {
  assert.match(panel, /今天交了1500房租，现在还有4200/);
  assert.match(panel, /我理解为/);
  assert.match(panel, /确认这些变化/);
  assert.doesNotMatch(panel, /有什么可以帮你|assistant|聊天记录|对话历史|建议减少|财务健康分/);
});

test('voice remains one input method with an honest text fallback', () => {
  assert.match(panel, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(panel, /语音不可用|改用文字|麦克风权限/);
  assert.match(panel, /aria-label=["']使用语音输入/);
});

test('completion is neutral, and provider failure preserves manual paths', () => {
  assert.match(panel, /现实已更新/);
  assert.match(panel, /未来已重新计算/);
  assert.match(panel, /暂时不能自动整理这句话/);
  assert.match(panel, /原句已保留/);
  assert.match(panel, /重新解析/);
  assert.match(panel, /精确修改/);
  assert.match(panel, /确认余额/);
  assert.doesNotMatch(panel, /恭喜|做得很好|继续保持|完成了一步/);
});

test('mobile uses a safe-area bottom sheet with accessible controls', () => {
  assert.match(styles, /@media\s*\(max-width:\s*760px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /position:\s*fixed/);
  assert.match(panel, /role=["']dialog/);
  assert.match(panel, /aria-live/);
  assert.match(panel, /Escape/);
});
