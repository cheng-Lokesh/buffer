import { persistJson } from './local-persistence.js?rev=20260812';
import { createRecoverySnapshot, getLatestRecoverySnapshot, normalizeRecoveryVault } from './local-recovery.js';

function persistRecovery(storage, options) {
  const currentVault = normalizeRecoveryVault(options.recoveryVault);
  const nextVault = createRecoverySnapshot(currentVault, options.payload, {
    id: options.id,
    createdAt: options.createdAt,
    reason: options.reason
  });
  const before = getLatestRecoverySnapshot(currentVault);
  const after = getLatestRecoverySnapshot(nextVault);
  if (after?.id === before?.id) return { ok: true, created: false, recoveryVault: currentVault };
  const persisted = persistJson(storage, options.recoveryKey, nextVault);
  if (!persisted.ok) return { ok: false, created: false, message: `安全快照保存失败：${persisted.message}`, recoveryVault: currentVault };
  return { ok: true, created: true, recoveryVault: nextVault };
}

export function persistProductState(storage, options = {}) {
  const persisted = persistJson(storage, options.stateKey, options.payload);
  if (!persisted.ok) {
    return {
      ok: false,
      message: persisted.message,
      recovery: { ok: false, skipped: true },
      recoveryVault: normalizeRecoveryVault(options.recoveryVault)
    };
  }
  const recovery = persistRecovery(storage, { ...options, reason: 'successful_save' });
  return {
    ok: true,
    recovery: { ok: recovery.ok, created: recovery.created, message: recovery.message || '' },
    recoveryVault: recovery.recoveryVault
  };
}

export function persistRecoveryCheckpoint(storage, options = {}) {
  const recovery = persistRecovery(storage, options);
  return {
    ok: recovery.ok,
    created: recovery.created,
    message: recovery.message || '',
    recoveryVault: recovery.recoveryVault
  };
}
