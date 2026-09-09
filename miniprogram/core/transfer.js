const { normalizeState } = require('./state');

const BACKUP_KIND = 'buffer-zone-mini-backup';
const BACKUP_SCHEMA = 1;
const MAX_BACKUP_TEXT = 1024 * 1024;

function createBackup(state, exportedAt = new Date().toISOString()) {
  return { kind: BACKUP_KIND, schemaVersion: BACKUP_SCHEMA, exportedAt, state: normalizeState(state) };
}

function websiteToMini(value) {
  return normalizeState({
    cash: value.cash,
    cashReality: value.cashReality,
    records: value.records,
    confirmedAt: value.cashflowConfirmation && value.cashflowConfirmation.confirmedAt,
    skinId: value.visualSkinId || value.skinId
  });
}

function importBackup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: '备份内容不是对象' };
  if (value.kind === BACKUP_KIND) {
    if (Number(value.schemaVersion) !== BACKUP_SCHEMA || !value.state) return { ok: false, message: '小程序备份版本不支持' };
    return { ok: true, source: 'mini', state: normalizeState(value.state) };
  }
  const schemaVersion = Number(value.schemaVersion);
  if (Number.isInteger(schemaVersion) && schemaVersion >= 1 && schemaVersion <= 9 && value.cash && typeof value.cash === 'object') {
    return { ok: true, source: 'website', state: websiteToMini(value) };
  }
  return { ok: false, message: '无法识别这个备份版本' };
}

function parseBackupText(text) {
  const source = String(text || '');
  if (!source.trim()) return { ok: false, message: '剪贴板里没有备份内容' };
  if (source.length > MAX_BACKUP_TEXT) return { ok: false, message: '备份内容过大' };
  try {
    return importBackup(JSON.parse(source));
  } catch {
    return { ok: false, message: '备份不是有效的 JSON' };
  }
}

module.exports = { BACKUP_KIND, BACKUP_SCHEMA, MAX_BACKUP_TEXT, createBackup, importBackup, parseBackupText };
