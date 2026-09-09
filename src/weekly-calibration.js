const MAX_WEEKLY_REVIEWS = 300;
const MAX_PHASE_ARCHIVES = 100;
const MAX_TEXT = 500;
const MAX_FOCUSES = 3;
const OUTCOMES = new Set(['found_job', 'ended_search', 'paused']);
const ACTION_KINDS = new Set(['confirm', 'adjust']);
const CASH_KINDS = new Set(['quick', 'full', 'skip']);
import { getCurrentReminders } from './progress-records.js';

const text = (value, max = MAX_TEXT) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function isExplicitDate(value) {
  const date = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function isStrictMoney(value) {
  return /^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text(value, 32));
}

function addDays(date, offset) {
  if (!isExplicitDate(date) || !Number.isInteger(offset)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + offset));
  return result.toISOString().slice(0, 10);
}

export function buildWeeklyWindow(weekEndedOn) {
  if (!isExplicitDate(weekEndedOn)) return null;
  return { startedOn: addDays(weekEndedOn, -6), endedOn: weekEndedOn };
}

function daysBetween(startedOn, endedOn) {
  if (!isExplicitDate(startedOn) || !isExplicitDate(endedOn)) return null;
  const asUtc = (value) => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((asUtc(endedOn) - asUtc(startedOn)) / 86400000);
}

export function buildCycleOverview({ phaseState, asOf, weeklyReviews, records, progressLogs } = {}) {
  const cycleId = text(phaseState?.cycleId, 100);
  const startedOn = text(phaseState?.startedOn, 10);
  const status = text(phaseState?.status, 16);
  if (!cycleId || !isExplicitDate(startedOn) || !['active', 'completed'].includes(status) || !isExplicitDate(asOf)) return null;
  const endedOn = addDays(startedOn, 29);
  const effectiveDate = status === 'completed' && isExplicitDate(phaseState.completedOn) ? phaseState.completedOn : asOf;
  const elapsed = daysBetween(startedOn, effectiveDate);
  const currentDay = Math.max(1, Math.min(30, Number(elapsed) + 1));
  const currentWeek = Math.min(4, Math.ceil(currentDay / 7));
  const sourceRecords = Array.isArray(records) ? records : [];
  const sourceProgress = Array.isArray(progressLogs) ? progressLogs : [];
  const sourceReviews = Array.isArray(weeklyReviews) ? weeklyReviews : [];
  const milestones = [0, 7, 14, 21].map((offset, index) => {
    const milestoneStartedOn = addDays(startedOn, offset);
    const milestoneEndedOn = index === 3 ? endedOn : addDays(milestoneStartedOn, 6);
    const milestoneStatus = effectiveDate < milestoneStartedOn ? 'upcoming' : status === 'completed' || effectiveDate > milestoneEndedOn ? 'complete' : 'active';
    const within = (value) => isExplicitDate(value) && value >= milestoneStartedOn && value <= milestoneEndedOn && (status !== 'completed' || value <= effectiveDate);
    return {
      week: index + 1,
      startedOn: milestoneStartedOn,
      endedOn: milestoneEndedOn,
      status: milestoneStatus,
      recordCount: sourceRecords.filter((item) => within(item?.date)).length,
      progressCount: sourceProgress.filter((item) => within(item?.occurredOn)).length,
      reviewCount: sourceReviews.filter((item) => item?.cycleId === cycleId && within(item?.weekEndedOn)).length
    };
  });
  return { cycleId, startedOn, endedOn, status, currentDay, currentWeek, milestones };
}

function inWindow(date, window) {
  return isExplicitDate(date) && window && date >= window.startedOn && date <= window.endedOn;
}

function compactRecord(record) {
  const id = text(String(record?.id ?? ''), 80);
  if (!record || typeof record !== 'object' || !id || !isExplicitDate(record.date)) return null;
  return { id, date: record.date, cashDelta: Number.isFinite(Number(record.cashDelta)) ? Number(record.cashDelta) : 0, jobsApplied: Number.isFinite(Number(record.jobsApplied)) ? Number(record.jobsApplied) : 0, projectMinutes: Number.isFinite(Number(record.projectMinutes)) ? Number(record.projectMinutes) : 0, note: text(record.note) };
}

function compactProgress(log) {
  const id = text(String(log?.id ?? ''), 80);
  if (!log || typeof log !== 'object' || !id || !isExplicitDate(log.occurredOn)) return null;
  return { id, occurredOn: log.occurredOn, subjectType: text(log.subjectType, 16), subjectId: text(String(log.subjectId ?? ''), 80), subjectLabel: text(log.subjectLabel), resultStatus: text(log.resultStatus, 32), nextAction: text(log.nextAction) };
}

export function summarizeWeekEvidence({ weekEndedOn, records, progressLogs } = {}) {
  const window = buildWeeklyWindow(weekEndedOn);
  if (!window) return { window: null, records: [], progressLogs: [] };
  const choose = (values, mapper, dateKey) => Array.isArray(values) ? values.map(mapper).filter((item) => item && inWindow(item[dateKey], window)).slice(0, 100) : [];
  return { window, records: choose(records, compactRecord, 'date'), progressLogs: choose(progressLogs, compactProgress, 'occurredOn') };
}

function normalizeCashCalibration(value) {
  if (!value || typeof value !== 'object') return null;
  const kind = text(value.kind, 16);
  if (!CASH_KINDS.has(kind)) return null;
  if (kind === 'skip') return { kind: 'skip' };
  const balance = text(value.balance, 32);
  if (!isStrictMoney(balance)) return null;
  if (kind === 'quick') return isExplicitDate(value.asOf) ? { kind, balance, asOf: value.asOf } : null;
  const evidence = text(value.evidence);
  return evidence && isExplicitDate(value.updatedAt) ? { kind, balance, evidence, updatedAt: value.updatedAt } : null;
}

function normalizeFocuses(value) {
  if (!Array.isArray(value) || value.length > MAX_FOCUSES) return [];
  const seen = new Set();
  return value.reduce((items, item) => {
    const kind = text(item?.kind || item?.subjectType, 16);
    const subjectId = text(String(item?.subjectId ?? ''), 80);
    const nextAction = text(item?.nextAction);
    const label = text(item?.label) || (kind === 'general' ? '通用本周重点' : subjectId);
    const previousNextAction = text(item?.previousNextAction);
    const decision = text(item?.decision, 16) || 'adjust';
    const key = `${kind}:${subjectId || label}`;
    if (!['job', 'project', 'general'].includes(kind) || !nextAction || (kind !== 'general' && !subjectId) || seen.has(key)) return items;
    seen.add(key);
    items.push({ kind, subjectId: kind === 'general' ? '' : subjectId, label, previousNextAction, nextAction, decision });
    return items;
  }, []);
}

function normalizeSnapshot(value) {
  if (!Array.isArray(value) || value.length > MAX_FOCUSES) return [];
  return value.reduce((items, item) => {
    const fingerprint = text(item?.fingerprint, 1000);
    const title = text(item?.title);
    if (fingerprint && title) items.push({ fingerprint, title });
    return items;
  }, []);
}

function normalizeActionDecision(value) {
  if (!value || typeof value !== 'object' || !ACTION_KINDS.has(text(value.kind, 16))) return null;
  const kind = text(value.kind, 16);
  if (kind === 'confirm') return { kind, snapshot: normalizeSnapshot(value.snapshot) };
  const focuses = normalizeFocuses(value.focuses);
  return focuses.length ? { kind, focuses } : null;
}

function normalizeEvidence(value, weekEndedOn) {
  const evidence = value && typeof value === 'object' ? value : {};
  const fromStoredWindow = evidence.window?.startedOn === buildWeeklyWindow(weekEndedOn)?.startedOn && evidence.window?.endedOn === weekEndedOn;
  if (!fromStoredWindow) return summarizeWeekEvidence({ weekEndedOn, records: evidence.records, progressLogs: evidence.progressLogs });
  return summarizeWeekEvidence({ weekEndedOn, records: evidence.records, progressLogs: evidence.progressLogs });
}

function normalizeWeeklyReview(value) {
  if (!value || typeof value !== 'object') return null;
  const cycleId = text(value.cycleId, 100);
  const weekEndedOn = text(value.weekEndedOn, 10);
  const window = buildWeeklyWindow(weekEndedOn);
  const id = text(value.id, 160) || `review-${cycleId}-${weekEndedOn}`;
  const windowStart = text(value.windowStart, 10) || window?.startedOn;
  const windowEnd = text(value.windowEnd, 10) || weekEndedOn;
  const cashCalibration = normalizeCashCalibration(value.cashCalibration);
  const actionDecision = normalizeActionDecision(value.actionDecision);
  if (!cycleId || !id || !isExplicitDate(weekEndedOn) || windowStart !== window?.startedOn || windowEnd !== weekEndedOn || !cashCalibration || !actionDecision) return null;
  const nextReviewOn = value.nextReviewOn == null || value.nextReviewOn === '' ? null : text(value.nextReviewOn, 10);
  if (nextReviewOn !== null && !isExplicitDate(nextReviewOn)) return null;
  return { id, cycleId, weekEndedOn, windowStart, windowEnd, evidence: normalizeEvidence(value.evidence, weekEndedOn), cashCalibration, actionDecision, focuses: normalizeFocuses(value.focuses), note: text(value.note), nextReviewOn };
}

export function normalizeWeeklyReviews(value, { max = MAX_WEEKLY_REVIEWS } = {}) {
  if (!Array.isArray(value) || value.length > max) return [];
  const seen = new Set();
  return value.reduce((reviews, item) => {
    const review = normalizeWeeklyReview(item);
    const key = review && `${review.cycleId}:${review.weekEndedOn}`;
    if (!review || seen.has(key)) return reviews;
    seen.add(key);
    reviews.push(review);
    return reviews;
  }, []);
}

export function upsertWeeklyReview(reviews, review) {
  const normalized = normalizeWeeklyReview(review);
  if (!normalized) return normalizeWeeklyReviews(reviews);
  const current = normalizeWeeklyReviews(reviews);
  const key = `${normalized.cycleId}:${normalized.weekEndedOn}`;
  const index = current.findIndex((item) => `${item.cycleId}:${item.weekEndedOn}` === key);
  return index < 0
    ? [normalized, ...current].slice(0, MAX_WEEKLY_REVIEWS)
    : current.map((item, itemIndex) => itemIndex === index ? { ...normalized, id: item.id } : item);
}

export function applyActionDecision({ decision, jobs, projects, dailyActions } = {}) {
  const normalized = normalizeActionDecision(decision);
  const nextJobs = Array.isArray(jobs) ? jobs.map((item) => ({ ...item })) : [];
  const nextProjects = Array.isArray(projects) ? projects.map((item) => ({ ...item })) : [];
  if (!normalized) return { jobs: nextJobs, projects: nextProjects, focuses: [], snapshot: [] };
  if (normalized.kind === 'confirm') {
    const snapshot = (Array.isArray(dailyActions) ? dailyActions : []).reduce((items, action) => {
      const fingerprint = text(action?.fingerprint, 1000); const title = text(action?.title);
      if (items.length < MAX_FOCUSES && fingerprint && title) items.push({ fingerprint, title });
      return items;
    }, []);
    return { jobs: nextJobs, projects: nextProjects, focuses: [], snapshot };
  }
  const applied = normalized.focuses.filter((focus) => {
    if (focus.kind === 'general') return true;
    const collection = focus.kind === 'job' ? nextJobs : nextProjects;
    const index = collection.findIndex((item) => String(item?.id ?? '') === focus.subjectId);
    if (index < 0) return false;
    collection[index] = focus.kind === 'job' ? { ...collection[index], next: focus.nextAction } : { ...collection[index], nextAction: focus.nextAction };
    return true;
  });
  return { jobs: nextJobs, projects: nextProjects, focuses: applied, snapshot: [] };
}

export function getCurrentCycleProgressReminders(logs, asOf, phaseState) {
  if (phaseState?.status !== 'active' || !isExplicitDate(phaseState?.startedOn)) return [];
  if (!isExplicitDate(asOf) || !Array.isArray(logs)) return [];
  if (phaseState.reminderScope !== true) return getCurrentReminders(logs, asOf);
  const startedOn = phaseState.reminderScope === true ? phaseState.startedOn : null;
  const latest = new Map();
  logs.filter((log) => log && isExplicitDate(log.occurredOn) && (!startedOn || log.occurredOn >= startedOn) && ['job', 'project'].includes(text(log.subjectType, 16))).forEach((log) => {
    const key = `${log.subjectType}:${text(String(log.subjectId ?? ''), 80)}`;
    if (key.endsWith(':')) return;
    const current = latest.get(key);
    if (!current || log.occurredOn >= current.occurredOn) latest.set(key, log);
  });
  return [...latest.values()].filter((log) => isExplicitDate(log.reminderOn)).map((log) => ({ ...log, status: log.reminderOn < asOf ? 'overdue' : log.reminderOn === asOf ? 'today' : 'future' })).sort((left, right) => left.reminderOn.localeCompare(right.reminderOn));
}

export function getWeeklyReminder(reviews, asOf, cycleId) {
  if (!isExplicitDate(asOf) || !text(cycleId, 100)) return null;
  const latest = normalizeWeeklyReviews(reviews).filter((item) => item.cycleId === cycleId).sort((left, right) => right.weekEndedOn.localeCompare(left.weekEndedOn))[0];
  if (!latest?.nextReviewOn) return null;
  return { ...latest, status: latest.nextReviewOn < asOf ? 'overdue' : latest.nextReviewOn === asOf ? 'today' : 'future' };
}

export function normalizePhaseState(value) {
  if (!value || typeof value !== 'object') return null;
  const cycleId = text(value.cycleId, 100); const startedOn = text(value.startedOn, 10); const status = text(value.status, 16);
  if (!cycleId || !isExplicitDate(startedOn) || !['active', 'completed'].includes(status)) return null;
  if (status === 'active') return { cycleId, startedOn, status: 'active', reminderScope: value.reminderScope === true };
  const outcome = text(value.outcome, 32); const completedOn = text(value.completedOn, 10);
  const archiveId = text(value.archiveId, 160) || `archive-${cycleId}`;
  if (!OUTCOMES.has(outcome) || !isExplicitDate(completedOn) || completedOn < startedOn || !archiveId) return null;
  return { cycleId, startedOn, status, reminderScope: value.reminderScope === true, outcome, completedOn, note: text(value.note), archiveId };
}

export function completePhase(phaseState, completion) {
  const current = normalizePhaseState(phaseState);
  const outcome = text(completion?.outcome, 32); const completedOn = text(completion?.completedOn, 10);
  const archiveId = text(completion?.archiveId, 160) || `archive-${current?.cycleId || ''}-${completedOn}`;
  if (!current || current.status !== 'active' || !OUTCOMES.has(outcome) || !isExplicitDate(completedOn) || completedOn < current.startedOn || !archiveId) return null;
  return { ...current, status: 'completed', outcome, completedOn, note: text(completion?.note), archiveId };
}

export function normalizePhaseArchives(value, { max = MAX_PHASE_ARCHIVES } = {}) {
  if (!Array.isArray(value) || value.length > max) return [];
  const archiveIds = new Set();
  const cycleIds = new Set();
  return value.reduce((archives, item) => {
    const phase = normalizePhaseState(item);
    if (!phase || phase.status !== 'completed' || archiveIds.has(phase.archiveId) || cycleIds.has(phase.cycleId)) return archives;
    archiveIds.add(phase.archiveId);
    cycleIds.add(phase.cycleId);
    archives.push({ ...phase, weeklyReviewCount: Math.max(0, Math.min(MAX_WEEKLY_REVIEWS, Number(item.weeklyReviewCount) || 0)) });
    return archives;
  }, []);
}

export function startNewCycle({ phaseState, phaseArchives, cycleId, startedOn } = {}) {
  const nextCycleId = text(cycleId, 100);
  if (!nextCycleId || !isExplicitDate(startedOn)) return null;
  const current = normalizePhaseState(phaseState);
  const archives = normalizePhaseArchives(phaseArchives);
  if (archives.some((item) => item.cycleId === nextCycleId) || current?.cycleId === nextCycleId || (current?.status === 'completed' && startedOn < current.completedOn)) return null;
  const nextArchives = current?.status === 'completed' && !archives.some((item) => item.archiveId === current.archiveId || item.cycleId === current.cycleId)
    ? [{ ...current, weeklyReviewCount: 0 }, ...archives].slice(0, MAX_PHASE_ARCHIVES)
    : archives;
  return { phaseState: { cycleId: nextCycleId, startedOn, status: 'active', reminderScope: true }, phaseArchives: nextArchives };
}
