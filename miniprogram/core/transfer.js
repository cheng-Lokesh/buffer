const { normalizeState } = require('./state');
const { preparePortableBackup, portableToMini } = require('./portable-backup');

const BACKUP_KIND = 'buffer-zone-mini-backup';
const BACKUP_SCHEMA = 1;
const MAX_BACKUP_TEXT = 10 * 1024 * 1024;

function createBackup(state, exportedAt = new Date().toISOString()) {
  return { kind: BACKUP_KIND, schemaVersion: BACKUP_SCHEMA, exportedAt, state: normalizeState(state) };
}

function importBackup(value) {
  const preview = preparePortableBackup(value);
  if (!preview.ok) return preview;
  return {ok:true,source:preview.source,state:normalizeState(portableToMini(preview.payload)),summary:preview.summary};
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
