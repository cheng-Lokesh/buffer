export const ACTION_THREAD_VERSION = 1;
export const MAX_ACTION_THREADS = 200;

const STATUSES = new Set(['active', 'waiting', 'blocked', 'completed', 'closed']);
const SUBJECT_TYPES = new Set(['job', 'project', 'cash', 'daily', '']);
const LOCAL_PROVENANCE = 'local_usage';
const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const text = (value) => hasText(value) ? value.trim() : '';
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const validDateTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const uniqueText = (value, limit = 100) => [...new Set((Array.isArray(value) ? value : []).filter(hasText).map((item) => item.trim()))].slice(0, limit);

function normalizeThread(value) {
  if (!isRecord(value) || !hasText(value.id) || !hasText(value.action) || !validDateTime(value.createdAt) || !validDateTime(value.updatedAt)) return null;
  if (value.provenance === 'acceptance_fixture') return null;
  const status = STATUSES.has(value.status) ? value.status : 'active';
  const subjectType = SUBJECT_TYPES.has(value.subjectType) ? value.subjectType : '';
  const closedAt = ['completed', 'closed'].includes(status) && validDateTime(value.closedAt) ? value.closedAt : null;
  return {
    id: value.id.trim(),
    action: value.action.trim(),
    subjectType,
    subjectId: value.subjectId == null ? '' : String(value.subjectId),
    subjectLabel: text(value.subjectLabel),
    status,
    resultNote: text(value.resultNote),
    nextAction: text(value.nextAction),
    followUpOn: validDate(value.followUpOn) ? value.followUpOn : null,
    sourceFactIds: uniqueText(value.sourceFactIds, 50),
    recordIds: uniqueText(value.recordIds, 100),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    closedAt,
    provenance: LOCAL_PROVENANCE
  };
}

export function normalizeActionThreadState(value) {
  const source = isRecord(value) ? value : {};
  const seen = new Set();
  const normalized = [];
  for (const candidate of Array.isArray(source.threads) ? source.threads : []) {
    const thread = normalizeThread(candidate);
    if (!thread || seen.has(thread.id)) continue;
    seen.add(thread.id);
    normalized.push(thread);
  }
  const requestedActiveId = hasText(source.activeThreadId) ? source.activeThreadId.trim() : '';
  const active = normalized.find((thread) => thread.id === requestedActiveId && !['completed', 'closed'].includes(thread.status));
  const withoutActive = active ? normalized.filter((thread) => thread.id !== active.id) : normalized;
  const threads = [...withoutActive.slice(-(MAX_ACTION_THREADS - (active ? 1 : 0))), ...(active ? [active] : [])];
  return {
    version: ACTION_THREAD_VERSION,
    activeThreadId: active?.id || '',
    threads
  };
}

export function createActionThread(value, input = {}, now = new Date().toISOString()) {
  const state = normalizeActionThreadState(value);
  if (!hasText(input.id) || !hasText(input.action) || !validDateTime(now)) return state;
  const thread = normalizeThread({
    id: input.id,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    subjectLabel: input.subjectLabel,
    status: 'active',
    resultNote: input.resultNote,
    nextAction: input.nextAction,
    followUpOn: input.followUpOn,
    sourceFactIds: input.sourceFactIds,
    recordIds: [],
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    provenance: LOCAL_PROVENANCE
  });
  if (!thread) return state;
  return normalizeActionThreadState({
    ...state,
    activeThreadId: thread.id,
    threads: [...state.threads.filter((item) => item.id !== thread.id), thread]
  });
}

export function transitionActionThread(value, input = {}, now = new Date().toISOString()) {
  const state = normalizeActionThreadState(value);
  if (!hasText(input.id) || !STATUSES.has(input.status) || !validDateTime(now)) return state;
  const current = state.threads.find((thread) => thread.id === input.id.trim());
  if (!current) return state;
  if (input.status === 'waiting' && !validDate(input.followUpOn)) return state;
  const terminal = ['completed', 'closed'].includes(input.status);
  const updated = normalizeThread({
    ...current,
    status: input.status,
    resultNote: hasText(input.resultNote) ? input.resultNote : current.resultNote,
    nextAction: hasText(input.nextAction) ? input.nextAction : current.nextAction,
    followUpOn: input.status === 'waiting' ? input.followUpOn : validDate(input.followUpOn) ? input.followUpOn : current.followUpOn,
    updatedAt: now,
    closedAt: terminal ? now : null
  });
  return normalizeActionThreadState({
    ...state,
    activeThreadId: terminal ? '' : updated.id,
    threads: state.threads.map((thread) => thread.id === updated.id ? updated : thread)
  });
}

export function linkCaptureToActionThread(value, input = {}, now = new Date().toISOString()) {
  const state = normalizeActionThreadState(value);
  if (!hasText(input.threadId) || !hasText(input.note) || !hasText(input.recordId) || !validDateTime(now)) return state;
  const current = state.threads.find((thread) => thread.id === input.threadId.trim());
  if (!current) return state;
  const status = ({ start: 'active', progress: 'active', waiting: 'waiting', blocked: 'blocked', completed: 'completed', closed: 'closed' })[input.result];
  if (!status || (status === 'waiting' && !validDate(input.followUpOn))) return state;
  const terminal = ['completed', 'closed'].includes(status);
  const updated = normalizeThread({
    ...current,
    status,
    resultNote: input.note,
    nextAction: hasText(input.nextAction) ? input.nextAction : current.nextAction,
    followUpOn: status === 'waiting' ? input.followUpOn : current.followUpOn,
    recordIds: [...current.recordIds, input.recordId],
    updatedAt: now,
    closedAt: terminal ? now : null
  });
  return normalizeActionThreadState({
    ...state,
    activeThreadId: terminal ? '' : updated.id,
    threads: state.threads.map((thread) => thread.id === updated.id ? updated : thread)
  });
}

export function buildCurrentActionThread(value, options = {}) {
  const state = normalizeActionThreadState(value);
  const thread = state.threads.find((item) => item.id === state.activeThreadId) || null;
  if (!thread) return null;
  const { provenance: _provenance, ...view } = thread;
  if (hasText(options.today) && thread.status === 'waiting') {
    return { ...view, isDue: Boolean(thread.followUpOn && thread.followUpOn <= options.today) };
  }
  return view;
}

