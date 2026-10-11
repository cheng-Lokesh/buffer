export function canMigrateBackupToAccount(sync) {
  return Boolean(sync && ['synced','remote_deleted'].includes(sync.phase) &&
    Number.isSafeInteger(sync.pendingCount) && sync.pendingCount === 0 &&
    sync.state === null && sync.conflict === null);
}
