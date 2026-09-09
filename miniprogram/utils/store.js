const { emptyState, normalizeState, applyCashChange, applyV8CashEvent, updateV8Condition, addV8Condition, saveScenarioDraft, selectSkin } = require('../core/state');
const { createBackup, parseBackupText } = require('../core/transfer');
const { applyMiniRealityCapture } = require('../core/v12-reality-capture');

const KEY = 'buffer-zone.mini.state.v2';
const LEGACY_KEY = 'buffer-zone.mini.state.v1';

function load() {
  try {
    const current = wx.getStorageSync(KEY);
    if (current) return normalizeState(current);
    const legacy = wx.getStorageSync(LEGACY_KEY);
    const migrated = legacy ? normalizeState(legacy) : emptyState();
    wx.setStorageSync(KEY, migrated);
    return migrated;
  } catch {
    return emptyState();
  }
}

function save(value) {
  const state = normalizeState(value);
  try {
    wx.setStorageSync(KEY, state);
    return { ok: true, state };
  } catch {
    return { ok: false, state, message: '本机保存失败，请稍后再试' };
  }
}

function recordCash(draft) {
  const result = applyCashChange(load(), draft);
  if (!result.ok) return result;
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, errors: { storage: persisted.message }, state: result.state };
}

function setSkin(skinId) {
  return save(selectSkin(load(), skinId));
}

function recordV8Event(input) {
  const result = applyV8CashEvent(load(), input);
  if (!result.ok) return result;
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, errors: { storage: persisted.message }, state: result.state };
}

function setV8Condition(id, patch) {
  const result = updateV8Condition(load(), id, patch);
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, errors: { storage: persisted.message }, state: result.state };
}

function addV8CashCondition(input) {
  const result = addV8Condition(load(), input);
  if (!result.ok) return result;
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, errors: { storage: persisted.message }, state: result.state };
}

function saveV8Scenario(patch) {
  const result = saveScenarioDraft(load(), patch);
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, message: persisted.message, state: result.state };
}

function captureReality(candidates, options) {
  const result = applyMiniRealityCapture(load(), candidates, options);
  if (!result.ok) return result;
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, message: persisted.message, state: result.state };
}

function exportText() {
  return JSON.stringify(createBackup(load()));
}

function importText(text) {
  const parsed = parseBackupText(text);
  if (!parsed.ok) return parsed;
  const persisted = save(parsed.state);
  return persisted.ok ? parsed : { ok: false, message: persisted.message };
}

function clear() {
  try {
    wx.removeStorageSync(KEY);
    wx.removeStorageSync(LEGACY_KEY);
    return { ok: true, state: emptyState() };
  } catch {
    return { ok: false, message: '本机数据未能清空' };
  }
}

module.exports = { KEY, LEGACY_KEY, load, save, recordCash, recordV8Event, setV8Condition, addV8CashCondition, saveV8Scenario, captureReality, setSkin, exportText, importText, clear };
