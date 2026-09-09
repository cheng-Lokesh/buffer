// Historical compatibility only. This module is deliberately not a product surface.
// It keeps superseded payloads intact when an old backup is opened, without restoring
// their retired modules into the V12.1 interface.
const RETIRED_KEYS = Object.freeze([
  'missions', 'jobs', 'projects', 'progressLogs', 'weeklyReviews', 'phaseState',
  'phaseArchives', 'longitudinalEvidence', 'dailyDecisionCompletion', 'v5Experience',
  'actionThreads', 'pilots', 'reports', 'entitlement', 'clientId'
]);

export function archiveLegacyProductData(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = Object.fromEntries(RETIRED_KEYS
    .filter((key) => value[key] !== undefined)
    .map((key) => [key, value[key]]));
  return Object.keys(payload).length ? { version: 1, payload } : null;
}

export function restoreLegacyProductData(current = {}, archive = null) {
  if (!archive || archive.version !== 1 || !archive.payload || typeof archive.payload !== 'object' || Array.isArray(archive.payload)) {
    return { ...current };
  }
  return { ...current, ...archive.payload };
}
