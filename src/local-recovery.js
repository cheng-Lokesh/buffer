import { PRODUCT_SCHEMA_VERSION } from './state-envelope.js';

export const RECOVERY_VAULT_VERSION = 1;
export const MAX_RECOVERY_SNAPSHOTS = 5;
export const MAX_RECOVERY_PAYLOAD_BYTES = 2_000_000;

const REASONS = new Set(['successful_save', 'before_restore', 'manual']);
const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const validDateTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const clone = (value) => JSON.parse(JSON.stringify(value));

function serializedPayload(value) {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized.length > MAX_RECOVERY_PAYLOAD_BYTES) return null;
    return serialized;
  } catch {
    return null;
  }
}

function payloadIsSafe(payload, serialized = serializedPayload(payload)) {
  if (!isRecord(payload) || !serialized) return false;
  const schema = Number(payload.schemaVersion);
  if (!Number.isInteger(schema) || schema < 1 || schema > PRODUCT_SCHEMA_VERSION) return false;
  if (payload.longitudinalEvidence?.provenance === 'acceptance_fixture') return false;
  for (const key of ['jobs', 'projects', 'records', 'progressLogs', 'weeklyReviews', 'phaseArchives', 'missions', 'pilots', 'reports']) {
    if (payload[key] != null && !Array.isArray(payload[key])) return false;
  }
  return true;
}

function fingerprintPayload(payload, serialized = serializedPayload(payload)) {
  if (!serialized) return '';
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${serialized.length}`;
}

function summarizePayload(payload) {
  return {
    jobs: payload.jobs?.length || 0,
    projects: payload.projects?.length || 0,
    records: payload.records?.length || 0,
    progressLogs: payload.progressLogs?.length || 0,
    weeklyReviews: payload.weeklyReviews?.length || 0,
    actionThreads: payload.actionThreads?.threads?.length || 0
  };
}

function normalizeSnapshot(value) {
  if (!isRecord(value) || !hasText(value.id) || !validDateTime(value.createdAt) || !REASONS.has(value.reason)) return null;
  const serialized = serializedPayload(value.payload);
  if (!payloadIsSafe(value.payload, serialized)) return null;
  const fingerprint = fingerprintPayload(value.payload, serialized);
  if (!fingerprint || value.fingerprint !== fingerprint) return null;
  return {
    id: value.id.trim(),
    createdAt: value.createdAt,
    reason: value.reason,
    fingerprint,
    summary: summarizePayload(value.payload),
    payload: clone(value.payload)
  };
}

export function normalizeRecoveryVault(value) {
  const snapshots = [];
  const seenIds = new Set();
  const source = isRecord(value) && Array.isArray(value.snapshots) ? value.snapshots : [];
  for (const candidate of source) {
    const snapshot = normalizeSnapshot(candidate);
    if (!snapshot || seenIds.has(snapshot.id)) continue;
    seenIds.add(snapshot.id);
    snapshots.push(snapshot);
  }
  snapshots.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { version: RECOVERY_VAULT_VERSION, snapshots: snapshots.slice(-MAX_RECOVERY_SNAPSHOTS) };
}

export function createRecoverySnapshot(value, payload, options = {}) {
  const vault = normalizeRecoveryVault(value);
  const serialized = serializedPayload(payload);
  if (!hasText(options.id) || !validDateTime(options.createdAt) || !REASONS.has(options.reason) || !payloadIsSafe(payload, serialized)) return vault;
  const fingerprint = fingerprintPayload(payload, serialized);
  if (vault.snapshots.some((snapshot) => snapshot.fingerprint === fingerprint)) return vault;
  const snapshot = normalizeSnapshot({
    id: options.id,
    createdAt: options.createdAt,
    reason: options.reason,
    fingerprint,
    payload: clone(payload)
  });
  if (!snapshot) return vault;
  return normalizeRecoveryVault({ version: RECOVERY_VAULT_VERSION, snapshots: [...vault.snapshots, snapshot] });
}

export function getLatestRecoverySnapshot(value) {
  const snapshots = normalizeRecoveryVault(value).snapshots;
  return snapshots.at(-1) || null;
}

export function prepareRecoverySnapshot(value, snapshotId) {
  const snapshot = normalizeRecoveryVault(value).snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return { ok: false, message: '恢复点无效或已损坏。' };
  return {
    ok: true,
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    reason: snapshot.reason,
    summary: { ...snapshot.summary },
    payload: clone(snapshot.payload)
  };
}
