const { emptyState, normalizeState, applyCashChange, applyV8CashEvent, updateV8Condition, addV8Condition, saveScenarioDraft, selectSkin } = require('../core/state');
const { createBackup, parseBackupText } = require('../core/transfer');
const { applyMiniRealityCapture } = require('../core/v12-reality-capture');
const { buildPortableBackup } = require('../core/portable-backup');

const KEY = 'buffer-zone.mini.state.v2';
const LEGACY_KEY = 'buffer-zone.mini.state.v1';
const READ_MESSAGE = '本机数据暂时无法读取，原数据未改动。请重试，或从备份恢复。';
let warned = false;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unavailable = state => ({ ok: false, state, message: READ_MESSAGE, errors: { storage: READ_MESSAGE } });

function readFailure() {
  if (!warned && typeof wx.showToast === 'function') {
    warned = true;
    try { wx.showToast({ title: '本机数据读取失败，原数据未改动', icon: 'none', duration: 4000 }); } catch {}
  }
  return { ...emptyState(), storageError: true, storageMessage: READ_MESSAGE };
}

function load() {
  try {
    const current = wx.getStorageSync(KEY);
    if (current !== '' && current !== undefined && current !== null) {
      buildPortableBackup(current); // Reject corruption/future versions before normalization can discard facts.
      warned = false;
      return normalizeState(current);
    }
    const legacy = wx.getStorageSync(LEGACY_KEY);
    if (legacy !== '' && legacy !== undefined && legacy !== null && (!object(legacy) || !object(legacy.cash) || (legacy.version !== undefined && ![1,2,3].includes(legacy.version)))) throw Error('legacy_state_invalid');
    const migrated = legacy ? normalizeState(legacy) : emptyState();
    buildPortableBackup(migrated);
    wx.setStorageSync(KEY, migrated);
    warned = false;
    return migrated;
  } catch {
    return readFailure();
  }
}

function save(value) {
  if (value?.storageError) return unavailable(value);
  const current = load();
  if (current.storageError) return unavailable(current);
  return writeState(value);
}

function writeState(value) {
  try { buildPortableBackup(value); } catch { return { ok: false, message: '数据未通过检查，原数据未改动' }; }
  const state = normalizeState(value);
  try {
    wx.setStorageSync(KEY, state);
    return { ok: true, state };
  } catch {
    return { ok: false, state, message: '本机保存失败，请稍后再试' };
  }
}

function restoreState(value, options) {
  if (options?.confirmed !== true) return { ok: false, message: '请先确认恢复这份备份' };
  const result = writeState(value);
  if (result.ok) warned = false;
  return result;
}

function recordCash(draft) {
  const current = load(); if (current.storageError) return unavailable(current);
  const result = applyCashChange(current, draft);
  if (!result.ok) return result;
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, errors: { storage: persisted.message }, state: result.state };
}

function setSkin(skinId) {
  const current = load(); if (current.storageError) return unavailable(current);
  return save(selectSkin(current, skinId));
}

function recordV8Event(input) {
  const current = load(); if (current.storageError) return unavailable(current);
  const result = applyV8CashEvent(current, input);
  if (!result.ok) return result;
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, errors: { storage: persisted.message }, state: result.state };
}

function setV8Condition(id, patch) {
  const current = load(); if (current.storageError) return unavailable(current);
  const result = updateV8Condition(current, id, patch);
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, errors: { storage: persisted.message }, state: result.state };
}

function addV8CashCondition(input) {
  const current = load(); if (current.storageError) return unavailable(current);
  const result = addV8Condition(current, input);
  if (!result.ok) return result;
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, errors: { storage: persisted.message }, state: result.state };
}

function saveV8Scenario(patch) {
  const current = load(); if (current.storageError) return unavailable(current);
  const result = saveScenarioDraft(current, patch);
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, message: persisted.message, state: result.state };
}

function captureReality(candidates, options) {
  const current = load(); if (current.storageError) return unavailable(current);
  const result = applyMiniRealityCapture(current, candidates, options);
  if (!result.ok) return result;
  const persisted = save(result.state);
  return persisted.ok ? result : { ok: false, message: persisted.message, state: result.state };
}

function exportText() {
  const current = load();
  return current.storageError ? null : JSON.stringify(createBackup(current));
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

module.exports = { KEY, LEGACY_KEY, load, save, restoreState, recordCash, recordV8Event, setV8Condition, addV8CashCondition, saveV8Scenario, captureReality, setSkin, exportText, importText, clear };
