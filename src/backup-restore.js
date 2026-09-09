import { normalizeProgressLog } from './progress-records.js';
import { isExplicitDate, normalizePhaseArchives, normalizeWeeklyReviews } from './weekly-calibration.js';
import { normalizeLongitudinalEvidence } from './longitudinal-evidence.js';
import { normalizeV5Experience } from './v5-personalization.js';
import { normalizeActionThreadState } from './action-thread.js';
import { normalizeCashReality } from './v8-cash-reality.js';

export const CURRENT_BACKUP_SCHEMA = 9;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

const ARRAY_KEYS = ['missions', 'jobs', 'projects', 'records', 'progressLogs', 'weeklyReviews', 'phaseArchives', 'pilots', 'reports'];
const ARRAY_LABELS = { missions: '每日行动', jobs: '旧版兼容条目', projects: '项目', records: '每日记录', progressLogs: '变化记录', weeklyReviews: '周回顾', phaseArchives: '周期归档', pilots: '历史申请', reports: '历史报告' };
const isRecord = (item) => Boolean(item && typeof item === 'object' && !Array.isArray(item));
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const SEMANTIC_VALIDATORS = {
  missions: (item) => hasText(item.title),
  jobs: (item) => hasText(item.company) && hasText(item.role),
  projects: (item) => hasText(item.name),
  records: (item) => isExplicitDate(item.date),
  progressLogs: (item) => Boolean(normalizeProgressLog(item)),
  weeklyReviews: (item) => normalizeWeeklyReviews([item]).length === 1,
  phaseArchives: (item) => normalizePhaseArchives([item]).length === 1,
  pilots: (item) => hasText(item.contact) || hasText(item.note) || hasText(item.status),
  reports: (item) => hasText(item.title) || hasText(item.summary)
};

export function validateBackup(value, { fileSize = 0 } = {}) {
  if (Number(fileSize) > MAX_BACKUP_BYTES) return { ok: false, message: '备份文件过大，最多支持 10 MB。' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: '备份根节点必须是对象。' };
  if (value.schemaVersion != null) {
    const schemaVersion = Number(value.schemaVersion);
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1) return { ok: false, message: '备份版本无效。' };
    if (schemaVersion > CURRENT_BACKUP_SCHEMA) return { ok: false, message: '这是由更新版本生成的备份，请先更新缓冲区。' };
  }
  for (const key of ARRAY_KEYS) {
    if (key in value && !Array.isArray(value[key])) return { ok: false, message: `${key} 必须是数组。` };
    if (Array.isArray(value[key]) && value[key].length > 5000) return { ok: false, message: `${key} 数量异常。` };
  }
  if ('cash' in value && (!value.cash || typeof value.cash !== 'object' || Array.isArray(value.cash))) {
    return { ok: false, message: 'cash 必须是对象。' };
  }
  if ('visualSkinId' in value && typeof value.visualSkinId !== 'string') return { ok: false, message: 'visualSkinId 必须是字符串。' };
  if ('longitudinalEvidence' in value) {
    const evidence = value.longitudinalEvidence;
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return { ok: false, message: 'longitudinalEvidence 必须是对象。' };
    if ('usageDays' in evidence && !Array.isArray(evidence.usageDays)) return { ok: false, message: 'longitudinalEvidence.usageDays 必须是数组。' };
    if ('incidents' in evidence && !Array.isArray(evidence.incidents)) return { ok: false, message: 'longitudinalEvidence.incidents 必须是数组。' };
    if ((evidence.usageDays?.length || 0) > 500 || (evidence.incidents?.length || 0) > 500) return { ok: false, message: '长期使用证据数量异常。' };
  }
  if ('v5Experience' in value) {
    const experience = value.v5Experience;
    if (!experience || typeof experience !== 'object' || Array.isArray(experience)) return { ok: false, message: 'v5Experience 必须是对象。' };
    for (const key of ['interactionMoments', 'preferenceSignals', 'adaptationProposals', 'companionGrowthEvents', 'contactWindows']) {
      if (key in experience && !Array.isArray(experience[key])) return { ok: false, message: `v5Experience.${key} 必须是数组。` };
      if ((experience[key]?.length || 0) > 5000) return { ok: false, message: `v5Experience.${key} 数量异常。` };
    }
  }
  if ('actionThreads' in value) {
    const state = value.actionThreads;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, message: 'actionThreads 必须是对象。' };
    if ('threads' in state && !Array.isArray(state.threads)) return { ok: false, message: 'actionThreads.threads 必须是数组。' };
    if ((state.threads?.length || 0) > 1000) return { ok: false, message: '行动线数量异常。' };
  }
  if ('cashReality' in value) {
    const reality = value.cashReality;
    if (!reality || typeof reality !== 'object' || Array.isArray(reality)) return { ok: false, message: 'cashReality 必须是对象。' };
    for (const key of ['conditions', 'events', 'scenarioDrafts', 'occurrenceResolutions', 'realitySnapshots', 'forecastSnapshots']) {
      if (key in reality && !Array.isArray(reality[key])) return { ok: false, message: `cashReality.${key} 必须是数组。` };
      if ((reality[key]?.length || 0) > 5000) return { ok: false, message: `cashReality.${key} 数量异常。` };
    }
  }
  return { ok: true };
}

export function prepareBackupPreview(value, metadata = {}) {
  const validation = validateBackup(value, metadata);
  if (!validation.ok) return validation;
  const payload = { ...value };
  delete payload.realityCaptureCandidates;
  delete payload.captureTransaction;
  delete payload.candidates;
  const warnings = [];
  let skippedItems = 0;
  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(value[key])) continue;
    const objectItems = value[key].filter(isRecord);
    const malformed = value[key].length - objectItems.length;
    const accepted = objectItems.filter((item) => SEMANTIC_VALIDATORS[key](item));
    const incomplete = objectItems.length - accepted.length;
    payload[key] = accepted;
    if (malformed) {
      skippedItems += malformed;
      warnings.push(`${ARRAY_LABELS[key]}有 ${malformed} 项格式异常，恢复时会跳过。`);
    }
    if (incomplete) {
      skippedItems += incomplete;
      warnings.push(`${ARRAY_LABELS[key]}有 ${incomplete} 项字段不完整，恢复时会跳过。`);
    }
  }
  const rawEvidence = value.longitudinalEvidence;
  if (rawEvidence) {
    const normalizedEvidence = normalizeLongitudinalEvidence(rawEvidence);
    const rawCount = (rawEvidence.usageDays?.length || 0) + (rawEvidence.incidents?.length || 0);
    const acceptedCount = normalizedEvidence.usageDays.length + normalizedEvidence.incidents.length;
    const skippedEvidence = Math.max(0, rawCount - acceptedCount);
    payload.longitudinalEvidence = normalizedEvidence;
    if (skippedEvidence) {
      skippedItems += skippedEvidence;
      warnings.push(`长期使用证据有 ${skippedEvidence} 项格式异常，恢复时会跳过。`);
    }
  }
  const rawV5 = value.v5Experience;
  const normalizedV5 = normalizeV5Experience(rawV5);
  payload.v5Experience = normalizedV5;
  if (rawV5) {
    const rawCount = ['interactionMoments', 'preferenceSignals', 'adaptationProposals', 'companionGrowthEvents', 'contactWindows']
      .reduce((sum, key) => sum + (rawV5[key]?.length || 0), 0);
    const acceptedCount = normalizedV5.interactionMoments.length
      + normalizedV5.preferenceSignals.length
      + normalizedV5.adaptationProposals.length
      + normalizedV5.companionGrowthEvents.length
      + normalizedV5.contactWindows.length;
    const skippedV5 = Math.max(0, rawCount - acceptedCount);
    if (skippedV5) {
      skippedItems += skippedV5;
      warnings.push(`V5 使用与偏好数据有 ${skippedV5} 项格式异常或不是本机真实来源，恢复时会跳过。`);
    }
  }
  const rawActionThreads = value.actionThreads;
  const normalizedActionThreads = normalizeActionThreadState(rawActionThreads);
  payload.actionThreads = normalizedActionThreads;
  if (rawActionThreads) {
    const skippedThreads = Math.max(0, (rawActionThreads.threads?.length || 0) - normalizedActionThreads.threads.length);
    if (skippedThreads) {
      skippedItems += skippedThreads;
      warnings.push(`行动线有 ${skippedThreads} 项格式异常或不是真实本机来源，恢复时会跳过。`);
    }
  }
  const rawCashReality = value.cashReality;
  const normalizedCashReality = normalizeCashReality(rawCashReality);
  payload.cashReality = normalizedCashReality;
  if (rawCashReality) {
    const rawCount = (rawCashReality.conditions?.length || 0) + (rawCashReality.events?.length || 0) + (rawCashReality.scenarioDrafts?.length || 0) + (rawCashReality.occurrenceResolutions?.length || 0) + (rawCashReality.realitySnapshots?.length || 0) + (rawCashReality.forecastSnapshots?.length || 0);
    const acceptedCount = normalizedCashReality.conditions.length + normalizedCashReality.events.length + normalizedCashReality.scenarioDrafts.length + normalizedCashReality.occurrenceResolutions.length + normalizedCashReality.realitySnapshots.length + normalizedCashReality.forecastSnapshots.length;
    const skippedCashReality = Math.max(0, rawCount - acceptedCount);
    if (skippedCashReality) {
      skippedItems += skippedCashReality;
      warnings.push(`V8 现金事实有 ${skippedCashReality} 项格式异常或并非本人确认，恢复时会跳过。`);
    }
  }
  const count = (key) => Array.isArray(payload[key]) ? payload[key].length : 0;
  return {
    ok: true,
    summary: {
      fileName: String(metadata.fileName || '未命名备份'),
      fileSize: Number(metadata.fileSize || 0),
      schemaVersion: Number(value.schemaVersion || 1),
      exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
      jobs: count('jobs'),
      projects: count('projects'),
      records: count('records'),
      progressLogs: count('progressLogs'),
      weeklyReviews: count('weeklyReviews'),
      phaseArchives: count('phaseArchives'),
      longitudinalDays: normalizeLongitudinalEvidence(payload.longitudinalEvidence).usageDays.length,
      interactionMoments: normalizedV5.interactionMoments.length,
      preferenceSignals: normalizedV5.preferenceSignals.length,
      adaptationProposals: normalizedV5.adaptationProposals.length,
      companionGrowthEvents: normalizedV5.companionGrowthEvents.length,
      contactWindows: normalizedV5.contactWindows.length,
      actionThreads: normalizedActionThreads.threads.length,
      cashConditions: normalizedCashReality.conditions.length,
      cashEvents: normalizedCashReality.events.length,
      scenarioDrafts: normalizedCashReality.scenarioDrafts.length,
      occurrenceResolutions: normalizedCashReality.occurrenceResolutions.length,
      realitySnapshots: normalizedCashReality.realitySnapshots.length,
      forecastSnapshots: normalizedCashReality.forecastSnapshots.length,
      visualSkinId: typeof payload.visualSkinId === 'string' ? payload.visualSkinId : '',
      warnings
    },
    skippedItems,
    payload
  };
}
