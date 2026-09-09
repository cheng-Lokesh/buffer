export const PRODUCT_SCHEMA_VERSION = 9;

const PORTABLE_KEYS = [
  'cash', 'cashflow', 'cashflowConfirmation', 'missions', 'jobs', 'projects', 'records', 'progressLogs',
  'weeklyReviews', 'phaseState', 'phaseArchives', 'longitudinalEvidence', 'dailyDecisionCompletion',
  'v5Experience', 'actionThreads', 'cashReality', 'visualSkinId', 'pilots', 'reports', 'clientId', 'legacyArchive'
];

export function buildProductStateEnvelope(value = {}, options = {}) {
  const envelope = { schemaVersion: PRODUCT_SCHEMA_VERSION };
  if (options.exportedAt) envelope.exportedAt = options.exportedAt;
  for (const key of PORTABLE_KEYS) {
    if (value[key] !== undefined) envelope[key] = value[key];
  }
  if (options.includeEntitlement) envelope.entitlement = value.entitlement;
  return envelope;
}
