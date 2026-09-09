export const V5_MODEL_VERSION = 1;
export const DEFAULT_V5_PREFERENCES = Object.freeze({
  input_method: 'one_sentence',
  arrival_time: 'manual',
  content_length: 'balanced',
  evidence_depth: 'collapsed',
  action_density: 'up_to_three',
  reminder_tone: 'neutral',
  companion_intensity: 'visible',
  reward_visibility: 'instant'
});

const INTERACTION_KINDS = new Set(['arrival', 'action', 'capture', 'wait', 'closure']);
const SIGNAL_SOURCES = new Set(['explicit', 'observed']);
const SIGNAL_STATUSES = new Set(['observed', 'proposed', 'confirmed', 'rejected', 'locked']);
const PROPOSAL_STATUSES = new Set(['pending', 'accepted', 'declined', 'never_suggest', 'reverted']);
const GROWTH_KINDS = new Set(['progress', 'honesty', 'rest', 'tradeoff']);
const RESUME_STATUSES = new Set(['active', 'waiting', 'blocked', 'closed']);
const LOCAL_PROVENANCE = 'local_usage';
const MAX_INTERACTION_MOMENTS = 1000;
const MAX_PREFERENCE_SIGNALS = 200;
const MAX_ADAPTATION_PROPOSALS = 200;
const MAX_GROWTH_EVENTS = 500;
const MAX_CONTACT_WINDOWS = 20;
const GROWTH_MEMENTOS = new Map([[5, '林灯'], [10, '石径'], [20, '夜航星图'], [30, '共同行进册'], [50, '林间长椅']]);

const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const text = (value, fallback = '') => hasText(value) ? value.trim() : fallback;
const validDateTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const boundedNumber = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const uniqueText = (value, limit = 100) => [...new Set((Array.isArray(value) ? value : []).filter(hasText).map((item) => item.trim()))].slice(0, limit);
const validPreferenceValue = (value) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
const preferenceKey = (value) => JSON.stringify(value);

function normalizePreference(value) {
  if (!isRecord(value) || !hasText(value.dimension) || !validPreferenceValue(value.value)) return null;
  return { dimension: value.dimension.trim(), value: value.value };
}

function normalizeInteractionMoment(value) {
  if (!isRecord(value) || !hasText(value.id) || !INTERACTION_KINDS.has(value.kind) || !validDateTime(value.startedAt) || value.provenance !== LOCAL_PROVENANCE) return null;
  const completedAt = validDateTime(value.completedAt) && Date.parse(value.completedAt) >= Date.parse(value.startedAt) ? value.completedAt : null;
  const preference = normalizePreference(value.preference);
  return {
    id: value.id.trim(),
    kind: value.kind,
    startedAt: value.startedAt,
    completedAt,
    outcome: text(value.outcome),
    operationCount: Math.round(boundedNumber(value.operationCount, 0, 0, 100)),
    sourceFactIds: uniqueText(value.sourceFactIds, 50),
    ...(preference ? { preference } : {}),
    provenance: LOCAL_PROVENANCE,
    localOnly: true
  };
}

function normalizePreferenceSignal(value) {
  if (!isRecord(value) || !hasText(value.id) || !hasText(value.dimension) || !validPreferenceValue(value.value) || !SIGNAL_SOURCES.has(value.source) || !SIGNAL_STATUSES.has(value.status)) return null;
  return {
    id: value.id.trim(),
    dimension: value.dimension.trim(),
    value: value.value,
    source: value.source,
    evidenceIds: uniqueText(value.evidenceIds, 100),
    confidence: boundedNumber(value.confidence, value.source === 'explicit' ? 1 : 0, 0, 1),
    evidenceCount: Math.round(boundedNumber(value.evidenceCount, 0, 0, 1000)),
    lastConfirmedAt: validDateTime(value.lastConfirmedAt) ? value.lastConfirmedAt : null,
    status: value.status,
    proposalId: text(value.proposalId)
  };
}

function normalizeAdaptationProposal(value) {
  if (!isRecord(value) || !hasText(value.id) || !hasText(value.dimension) || !validPreferenceValue(value.before) || !validPreferenceValue(value.after) || !PROPOSAL_STATUSES.has(value.status) || !validDateTime(value.createdAt)) return null;
  return {
    id: value.id.trim(),
    dimension: value.dimension.trim(),
    before: value.before,
    after: value.after,
    reason: text(value.reason, '来自最近的真实使用选择'),
    evidenceIds: uniqueText(value.evidenceIds, 100),
    confidence: boundedNumber(value.confidence, 0, 0, 1),
    status: value.status,
    createdAt: value.createdAt,
    decidedAt: validDateTime(value.decidedAt) ? value.decidedAt : null
  };
}

function normalizeGrowthEvent(value) {
  if (!isRecord(value) || !hasText(value.id) || !hasText(value.sourceFactId) || !GROWTH_KINDS.has(value.kind) || !validDateTime(value.occurredAt) || value.provenance !== LOCAL_PROVENANCE) return null;
  return {
    id: value.id.trim(),
    sourceFactId: value.sourceFactId.trim(),
    kind: value.kind,
    growthDelta: Math.round(boundedNumber(value.growthDelta, 1, 1, 3)),
    assetUnlock: text(value.assetUnlock),
    occurredAt: value.occurredAt,
    provenance: LOCAL_PROVENANCE
  };
}

function normalizeContactWindow(value) {
  if (!isRecord(value) || !hasText(value.id) || !hasText(value.kind) || !validTime(value.startsAt) || !validTime(value.endsAt)) return null;
  return {
    id: value.id.trim(),
    kind: value.kind.trim(),
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    enabled: value.enabled !== false,
    maxPrompts: Math.round(boundedNumber(value.maxPrompts, 1, 0, 3)),
    quietUntil: validDateTime(value.quietUntil) ? value.quietUntil : null
  };
}

function normalizeResumePoint(value) {
  if (!isRecord(value) || !hasText(value.id) || !hasText(value.action) || !validDateTime(value.updatedAt)) return null;
  const target = isRecord(value.target) && hasText(value.target.primaryView)
    ? { primaryView: value.target.primaryView.trim(), secondaryView: text(value.target.secondaryView), label: text(value.target.label, '继续') }
    : null;
  return {
    id: value.id.trim(),
    action: value.action.trim(),
    subjectType: text(value.subjectType),
    subjectId: value.subjectId == null ? '' : String(value.subjectId),
    subjectLabel: text(value.subjectLabel),
    resultNote: text(value.resultNote),
    status: RESUME_STATUSES.has(value.status) ? value.status : 'active',
    sourceFactIds: uniqueText(value.sourceFactIds, 50),
    followUpOn: validDate(value.followUpOn) ? value.followUpOn : null,
    ...(target ? { target } : {}),
    updatedAt: value.updatedAt
  };
}

function normalizeClosure(value) {
  if (!isRecord(value) || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.closedOn || ''))) return null;
  return {
    closedOn: value.closedOn,
    nextAction: text(value.nextAction),
    remindersPaused: value.remindersPaused === true,
    closedAt: validDateTime(value.closedAt) ? value.closedAt : null
  };
}

const defaultSettings = Object.freeze({
  companionEnabled: true,
  companionIntensity: 'visible',
  preferenceLearningEnabled: true,
  growthFeedbackEnabled: true,
  motionEnabled: true,
  remindersEnabled: false
});

function normalizeSettings(value) {
  const source = isRecord(value) ? value : {};
  return {
    companionEnabled: source.companionEnabled !== false,
    companionIntensity: ['visible', 'quiet', 'paused'].includes(source.companionIntensity) ? source.companionIntensity : defaultSettings.companionIntensity,
    preferenceLearningEnabled: source.preferenceLearningEnabled !== false,
    growthFeedbackEnabled: source.growthFeedbackEnabled !== false,
    motionEnabled: source.motionEnabled !== false,
    remindersEnabled: source.remindersEnabled === true
  };
}

function normalizeCollection(value, normalize, limit) {
  const items = (Array.isArray(value) ? value : []).map(normalize).filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique.slice(-limit);
}

export function normalizeV5Experience(value) {
  const source = isRecord(value) ? value : {};
  return {
    version: V5_MODEL_VERSION,
    interactionMoments: normalizeCollection(source.interactionMoments, normalizeInteractionMoment, MAX_INTERACTION_MOMENTS),
    preferenceSignals: normalizeCollection(source.preferenceSignals, normalizePreferenceSignal, MAX_PREFERENCE_SIGNALS),
    adaptationProposals: normalizeCollection(source.adaptationProposals, normalizeAdaptationProposal, MAX_ADAPTATION_PROPOSALS),
    companionGrowthEvents: normalizeCollection(source.companionGrowthEvents, normalizeGrowthEvent, MAX_GROWTH_EVENTS),
    contactWindows: normalizeCollection(source.contactWindows, normalizeContactWindow, MAX_CONTACT_WINDOWS),
    settings: normalizeSettings(source.settings),
    resumePoint: normalizeResumePoint(source.resumePoint),
    closure: normalizeClosure(source.closure)
  };
}

export function recordInteractionMoment(value, input) {
  const state = normalizeV5Experience(value);
  const moment = normalizeInteractionMoment(input);
  if (!moment) return state;
  const interactionMoments = [...state.interactionMoments.filter((item) => item.id !== moment.id), moment].slice(-MAX_INTERACTION_MOMENTS);
  return { ...state, interactionMoments };
}

export function proposePreferenceAdaptation(value, { dimension, currentValue, now = new Date().toISOString(), minEvidence = 3, minShare = 0.7 } = {}) {
  const state = normalizeV5Experience(value);
  if (!state.settings.preferenceLearningEnabled || !hasText(dimension) || !validPreferenceValue(currentValue) || !validDateTime(now)) return state;
  if (state.adaptationProposals.some((item) => item.dimension === dimension && ['pending', 'accepted', 'never_suggest'].includes(item.status))) return state;

  const observations = state.interactionMoments.filter((item) => item.preference?.dimension === dimension);
  if (observations.length < minEvidence) return state;
  const counts = new Map();
  for (const item of observations) {
    const key = preferenceKey(item.preference.value);
    const current = counts.get(key) || { value: item.preference.value, count: 0, evidenceIds: [] };
    current.count += 1;
    current.evidenceIds.push(item.id);
    counts.set(key, current);
  }
  const winner = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  const confidence = winner.count / observations.length;
  if (winner.count < minEvidence || confidence < minShare || preferenceKey(winner.value) === preferenceKey(currentValue)) return state;

  const suffix = `${dimension}-${Date.parse(now)}`;
  const signal = normalizePreferenceSignal({
    id: `signal-${suffix}`,
    dimension,
    value: winner.value,
    source: 'observed',
    evidenceIds: winner.evidenceIds,
    confidence,
    evidenceCount: winner.count,
    status: 'proposed'
  });
  const proposal = normalizeAdaptationProposal({
    id: `proposal-${suffix}`,
    dimension,
    before: currentValue,
    after: winner.value,
    reason: `最近 ${observations.length} 次中有 ${winner.count} 次选择这一方式`,
    evidenceIds: winner.evidenceIds,
    confidence,
    status: 'pending',
    createdAt: now
  });
  return {
    ...state,
    preferenceSignals: [...state.preferenceSignals, signal].slice(-MAX_PREFERENCE_SIGNALS),
    adaptationProposals: [...state.adaptationProposals, proposal].slice(-MAX_ADAPTATION_PROPOSALS)
  };
}

export function decideAdaptationProposal(value, { id, decision, now = new Date().toISOString() } = {}) {
  const state = normalizeV5Experience(value);
  if (!hasText(id) || !['accepted', 'declined', 'never_suggest', 'reverted'].includes(decision) || !validDateTime(now)) return state;
  const proposal = state.adaptationProposals.find((item) => item.id === id);
  if (!proposal) return state;
  const adaptationProposals = state.adaptationProposals.map((item) => item.id === id ? { ...item, status: decision, decidedAt: now } : item);
  let preferenceSignals = state.preferenceSignals.filter((item) => item.proposalId !== id);
  if (decision === 'accepted') {
    preferenceSignals = [...preferenceSignals.filter((item) => !(item.dimension === proposal.dimension && item.status === 'confirmed')), normalizePreferenceSignal({
      id: `confirmed-${id}`,
      dimension: proposal.dimension,
      value: proposal.after,
      source: 'explicit',
      evidenceIds: proposal.evidenceIds,
      confidence: 1,
      evidenceCount: proposal.evidenceIds.length,
      lastConfirmedAt: now,
      status: 'confirmed',
      proposalId: id
    })].slice(-MAX_PREFERENCE_SIGNALS);
  } else if (decision === 'declined' || decision === 'never_suggest') {
    preferenceSignals = preferenceSignals.map((item) => item.dimension === proposal.dimension && item.status === 'proposed' ? { ...item, status: 'rejected' } : item);
  }
  return { ...state, adaptationProposals, preferenceSignals };
}

export function getConfirmedPreferences(value) {
  const state = normalizeV5Experience(value);
  return Object.fromEntries(state.preferenceSignals.filter((item) => item.status === 'confirmed' || item.status === 'locked').map((item) => [item.dimension, item.value]));
}

export function setExplicitPreference(value, { dimension, value: preferenceValue, now = new Date().toISOString() } = {}) {
  const state = normalizeV5Experience(value);
  if (!Object.hasOwn(DEFAULT_V5_PREFERENCES, dimension) || !validPreferenceValue(preferenceValue) || !validDateTime(now)) return state;
  const signal = normalizePreferenceSignal({
    id: `explicit-${dimension}-${Date.parse(now)}`,
    dimension,
    value: preferenceValue,
    source: 'explicit',
    evidenceIds: [],
    confidence: 1,
    evidenceCount: 1,
    lastConfirmedAt: now,
    status: 'confirmed'
  });
  return {
    ...state,
    preferenceSignals: [...state.preferenceSignals.filter((item) => !(item.dimension === dimension && ['confirmed', 'locked'].includes(item.status))), signal].slice(-MAX_PREFERENCE_SIGNALS)
  };
}

export function lockConfirmedPreference(value, { dimension, locked = true } = {}) {
  const state = normalizeV5Experience(value);
  if (!Object.hasOwn(DEFAULT_V5_PREFERENCES, dimension)) return state;
  return {
    ...state,
    preferenceSignals: state.preferenceSignals.map((item) => item.dimension === dimension && ['confirmed', 'locked'].includes(item.status)
      ? { ...item, status: locked ? 'locked' : 'confirmed' }
      : item)
  };
}

export function resetV5Preference(value, { dimension } = {}) {
  const state = normalizeV5Experience(value);
  if (!Object.hasOwn(DEFAULT_V5_PREFERENCES, dimension)) return state;
  return {
    ...state,
    preferenceSignals: state.preferenceSignals.filter((item) => item.dimension !== dimension),
    adaptationProposals: state.adaptationProposals.map((item) => item.dimension === dimension && item.status === 'accepted' ? { ...item, status: 'reverted' } : item)
  };
}

export function setV5ExperienceSettings(value, patch = {}) {
  const state = normalizeV5Experience(value);
  return { ...state, settings: normalizeSettings({ ...state.settings, ...(isRecord(patch) ? patch : {}) }) };
}

export function summarizePreferenceCenter(value) {
  const state = normalizeV5Experience(value);
  return {
    confirmed: state.preferenceSignals.filter((item) => item.status === 'confirmed' || item.status === 'locked'),
    pending: state.adaptationProposals.filter((item) => item.status === 'pending'),
    history: state.adaptationProposals.filter((item) => item.status !== 'pending'),
    defaults: { ...DEFAULT_V5_PREFERENCES },
    settings: { ...state.settings },
    contactWindows: state.contactWindows.map((item) => ({ ...item }))
  };
}

export function clearV5PreferenceHistory(value) {
  const state = normalizeV5Experience(value);
  return { ...state, preferenceSignals: [], adaptationProposals: [] };
}

export function recordCompanionGrowth(value, input) {
  const state = normalizeV5Experience(value);
  const event = normalizeGrowthEvent(input);
  if (!event || state.companionGrowthEvents.some((item) => item.sourceFactId === event.sourceFactId && item.kind === event.kind)) return state;
  const nextCount = state.companionGrowthEvents.length + 1;
  const nextEvent = event.assetUnlock || !GROWTH_MEMENTOS.has(nextCount)
    ? event
    : { ...event, assetUnlock: GROWTH_MEMENTOS.get(nextCount) };
  return { ...state, companionGrowthEvents: [...state.companionGrowthEvents, nextEvent].slice(-MAX_GROWTH_EVENTS) };
}

export function summarizeCompanionGrowth(value) {
  const state = normalizeV5Experience(value);
  const events = [...state.companionGrowthEvents].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const totalGrowth = events.reduce((sum, item) => sum + item.growthDelta, 0);
  return {
    totalGrowth,
    eventCount: events.length,
    level: events.length ? Math.floor(totalGrowth / 5) + 1 : 0,
    unlockedAssets: [...new Set(events.map((item) => item.assetUnlock).filter(Boolean))],
    lastGrowthAt: events.at(-1)?.occurredAt || null
  };
}
