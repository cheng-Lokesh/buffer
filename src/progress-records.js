const RESULT_STATUSES = new Set(['advanced', 'waiting', 'blocked', 'closed']);
const SUBJECT_TYPES = new Set(['job', 'project']);
const MAX_PROGRESS_LOGS = 5000;
export const ENDED_SUBJECT_STAGE = '已结束';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isEndedSubjectStage(value) {
  const stage = text(value);
  if (!stage || /(?:未|尚未)(?:结束|拒绝|放弃|完成|关闭)/.test(stage)) return false;
  return /结束|拒绝|放弃|已完成|关闭/.test(stage);
}

function validDate(value) {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function normalizeLinkedAction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const date = text(value.date);
  const fingerprint = text(value.fingerprint);
  const title = text(value.title);
  return validDate(date) && fingerprint && title ? { date, fingerprint, title } : null;
}

export function resultStatusLabel(status) {
  return ({ advanced: '已推进', waiting: '等待回应', blocked: '受阻', closed: '已结束' })[status] || '未知结果';
}

export function normalizeProgressLog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = String(value.id ?? '').trim();
  const occurredOn = text(value.occurredOn);
  const subjectType = text(value.subjectType);
  const subjectId = String(value.subjectId ?? '').trim();
  const subjectLabel = text(value.subjectLabel);
  const subjectStage = text(value.subjectStage);
  const resultStatus = text(value.resultStatus);
  const resultNote = text(value.resultNote);
  const previousNextAction = text(value.previousNextAction);
  const nextAction = text(value.nextAction);
  const reminderValue = value.reminderOn == null || value.reminderOn === '' ? null : text(value.reminderOn);
  if (!id || !validDate(occurredOn) || !SUBJECT_TYPES.has(subjectType) || !subjectId || !subjectLabel || !subjectStage || !RESULT_STATUSES.has(resultStatus)) return null;
  if (resultStatus === 'closed' && (!isEndedSubjectStage(subjectStage) || nextAction)) return null;
  if (resultStatus !== 'closed' && !nextAction) return null;
  if (reminderValue !== null && !validDate(reminderValue)) return null;
  return {
    id,
    occurredOn,
    subjectType,
    subjectId,
    subjectLabel,
    subjectStage,
    resultStatus,
    resultNote,
    previousNextAction,
    nextAction,
    reminderOn: reminderValue,
    linkedDailyAction: normalizeLinkedAction(value.linkedDailyAction)
  };
}

export function normalizeProgressLogs(value, { max = MAX_PROGRESS_LOGS } = {}) {
  if (!Array.isArray(value) || value.length > max) return [];
  const ids = new Set();
  return value.reduce((logs, item) => {
    const normalized = normalizeProgressLog(item);
    if (!normalized || ids.has(normalized.id)) return logs;
    ids.add(normalized.id);
    logs.push(normalized);
    return logs;
  }, []);
}

export function sortProgressLogs(logs) {
  const normalized = normalizeProgressLogs(logs);
  return normalized
    .map((log, index) => ({ log, index }))
    .sort((left, right) => right.log.occurredOn.localeCompare(left.log.occurredOn) || left.index - right.index)
    .map(({ log }) => log);
}

export function getLatestProgressForSubject(logs, subjectType, subjectId) {
  const type = text(subjectType);
  const id = String(subjectId ?? '').trim();
  if (!SUBJECT_TYPES.has(type) || !id) return null;
  return sortProgressLogs(logs).find((log) => log.subjectType === type && log.subjectId === id) || null;
}

export function isHistoricalSubject(log, subjects = {}) {
  const normalized = normalizeProgressLog(log);
  if (!normalized) return true;
  const entries = normalized.subjectType === 'job' ? subjects.jobs : subjects.projects;
  return !Array.isArray(entries) || !entries.some((item) => String(item?.id ?? '') === normalized.subjectId);
}

export function getCurrentReminders(logs, asOf) {
  if (!validDate(asOf)) return [];
  const latest = new Map();
  for (const log of sortProgressLogs(logs).slice().reverse()) latest.set(`${log.subjectType}:${log.subjectId}`, log);
  const status = (reminderOn) => reminderOn < asOf ? 'overdue' : reminderOn === asOf ? 'today' : 'future';
  return [...latest.values()]
    .filter((log) => log.reminderOn)
    .map((log) => ({ ...log, status: status(log.reminderOn) }))
    .sort((left, right) => left.reminderOn.localeCompare(right.reminderOn) || left.subjectLabel.localeCompare(right.subjectLabel, 'zh-CN'));
}

export function matchDailyAction(log, actions) {
  const occurredOn = text(log?.occurredOn);
  const subjectType = text(log?.subjectType);
  const subjectId = String(log?.subjectId ?? '').trim();
  if (!validDate(occurredOn) || !SUBJECT_TYPES.has(subjectType) || !subjectId || !Array.isArray(actions)) return null;
  const action = actions.find((item) => item && item.date === occurredOn && Array.isArray(item.sources) && item.sources.some((source) => source?.kind === subjectType && String(source?.id ?? '') === subjectId));
  if (!action || !text(action.fingerprint) || !text(action.title)) return null;
  return { date: occurredOn, fingerprint: text(action.fingerprint), title: text(action.title) };
}
