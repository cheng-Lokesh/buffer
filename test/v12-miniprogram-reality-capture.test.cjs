const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const capture = require('../miniprogram/core/v12-reality-capture');
const stateCore = require('../miniprogram/core/state');

const state = () => stateCore.normalizeState({ cash: { balance: 5000, reserve: 1200, daily: 100 }, changes: [] });

test('mini balance capture only changes the balance and preserves other base facts', () => {
  const result = capture.applyMiniRealityCapture(state(), [{ type: 'balance_confirmation', amount: 4360, occurredAt: '2026-08-25' }], {
    confirmedAt: '2026-08-25T09:00:00.000Z', provenance: 'manual_balance'
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.cash.balance, 4360);
  assert.equal(result.state.cash.reserve, 1200);
  assert.equal(result.state.cash.daily, 100);
  assert.equal(result.state.cashReality.events[0].captureSource, 'manual_balance');
});

test('mini local parser keeps candidate facts transient and applies final balance as anchor', () => {
  const parsed = capture.parseMiniRealityMessage('今天房租1500，押金退了1300，现在4680', { asOf: '2026-08-25' });
  assert.equal(parsed.status, 'candidates');
  assert.deepEqual(parsed.candidates.map((item) => item.type), ['one_off_expense', 'one_off_income', 'balance_confirmation']);
  const before = state();
  assert.equal(before.cash.balance, 5000);
  const committed = capture.applyMiniRealityCapture(before, parsed.candidates, {
    confirmedAt: '2026-08-25T09:00:00.000Z', provenance: 'natural_language'
  });
  assert.equal(committed.state.cash.balance, 4680);
  assert.deepEqual(committed.state.cashReality.events.map((item) => item.type).sort(), ['balance_confirmation', 'expense', 'income']);
});

test('mini parser refuses hypothetical and uncertain statements', () => {
  assert.equal(capture.parseMiniRealityMessage('如果下个月工资12000呢', { asOf: '2026-08-25' }).status, 'scenario');
  assert.equal(capture.parseMiniRealityMessage('可能收到3000', { asOf: '2026-08-25' }).status, 'clarification');
});

test('mini capture validates the entire batch before returning a new state', () => {
  const before = state();
  const result = capture.applyMiniRealityCapture(before, [
    { type: 'one_off_income', amount: 3000, occurredAt: '2026-08-25' },
    { type: 'balance_confirmation', amount: -1, occurredAt: '2026-08-25' }
  ], { confirmedAt: '2026-08-25T09:00:00.000Z', provenance: 'natural_language' });
  assert.equal(result.ok, false);
  assert.deepEqual(before, state());
});

test('mini changes page exposes V12 hierarchy and states voice support honestly', () => {
  const wxml = fs.readFileSync(path.join(root, 'miniprogram/pages/reality/index.wxml'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'miniprogram/pages/reality/index.js'), 'utf8');
  const home = wxml.slice(wxml.indexOf('class="capture-home"'), wxml.indexOf('<view wx:elif="{{captureMode === \'balance\'}}"'));
  const due = home.indexOf('待确认');
  const balance = home.indexOf('确认现在有多少钱');
  const sentence = home.indexOf('说一句发生了什么');
  const precise = home.indexOf('精确修改');
  assert.ok(due >= 0 && balance > due && sentence > balance && precise > sentence);
  assert.match(wxml, /语音转写暂不可用/);
  assert.match(wxml, /确认这些变化/);
  assert.match(wxml, /现实已更新/);
  assert.match(js, /parseMiniRealityMessage/);
  assert.match(js, /captureReality/);
  assert.doesNotMatch(wxml, /聊天|助手|恭喜|记账完整度/);
});
