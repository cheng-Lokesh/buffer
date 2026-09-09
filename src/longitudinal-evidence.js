// Version 4 adds explicit provenance so deterministic acceptance fixtures can
// exercise the lifecycle without ever qualifying as real-user evidence.
const EVIDENCE_VERSION = 4;
const LOCAL_PROVENANCE = 'local_usage';
const FIXTURE_PROVENANCE = 'acceptance_fixture';
const PROVENANCE_VALUES = new Set([LOCAL_PROVENANCE, FIXTURE_PROVENANCE]);
const MAX_USAGE_DAYS = 400;
const MAX_INCIDENTS = 400;
const INCIDENT_KINDS = new Set(['storage_failure']);

function isExplicitDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function addDays(value, offset) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function normalizeIncident(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = String(value.id || '').trim().slice(0, 120);
  const kind = String(value.kind || '').trim();
  const occurredOn = String(value.occurredOn || '');
  const resolvedOn = value.resolvedOn == null || value.resolvedOn === '' ? null : String(value.resolvedOn);
  if (!id || !INCIDENT_KINDS.has(kind) || !isExplicitDate(occurredOn)) return null;
  if (resolvedOn !== null && (!isExplicitDate(resolvedOn) || resolvedOn < occurredOn)) return null;
  return { id, kind, occurredOn, resolvedOn };
}

export function normalizeLongitudinalEvidence(value) {
  if (value?.version !== EVIDENCE_VERSION || !PROVENANCE_VALUES.has(value?.provenance)) {
    return { version: EVIDENCE_VERSION, provenance: LOCAL_PROVENANCE, usageDays: [], incidents: [] };
  }
  const usageDays = [...new Set((Array.isArray(value?.usageDays) ? value.usageDays : []).filter(isExplicitDate).map(String))]
    .sort()
    .slice(-MAX_USAGE_DAYS);
  const ids = new Set();
  const incidents = (Array.isArray(value?.incidents) ? value.incidents : []).reduce((items, entry) => {
    const incident = normalizeIncident(entry);
    if (!incident || ids.has(incident.id) || items.length >= MAX_INCIDENTS) return items;
    ids.add(incident.id);
    items.push(incident);
    return items;
  }, []);
  return { version: EVIDENCE_VERSION, provenance: value.provenance, usageDays, incidents };
}

export function recordUsageDay(value, date) {
  if (!isExplicitDate(date)) return value;
  const normalized = normalizeLongitudinalEvidence(value);
  const current = normalized.provenance === FIXTURE_PROVENANCE
    ? { version: EVIDENCE_VERSION, provenance: LOCAL_PROVENANCE, usageDays: [], incidents: [] }
    : normalized;
  if (current.usageDays.includes(date)) return value;
  return normalizeLongitudinalEvidence({ ...current, usageDays: [...current.usageDays, date] });
}

export function recordEvidenceIncident(value, incident) {
  const normalized = normalizeIncident({ ...incident, resolvedOn: incident?.resolvedOn ?? null });
  if (!normalized) return value;
  const candidate = normalizeLongitudinalEvidence(value);
  const current = candidate.provenance === FIXTURE_PROVENANCE
    ? { version: EVIDENCE_VERSION, provenance: LOCAL_PROVENANCE, usageDays: [], incidents: [] }
    : candidate;
  if (current.incidents.some((entry) => entry.id === normalized.id)) return value;
  return normalizeLongitudinalEvidence({ ...current, incidents: [...current.incidents, normalized] });
}

export function resolveEvidenceIncidents(value, { kind, resolvedOn } = {}) {
  if (!INCIDENT_KINDS.has(kind) || !isExplicitDate(resolvedOn)) return value;
  const current = normalizeLongitudinalEvidence(value);
  let changed = false;
  const incidents = current.incidents.map((incident) => {
    if (incident.kind !== kind || incident.resolvedOn || resolvedOn < incident.occurredOn) return incident;
    changed = true;
    return { ...incident, resolvedOn };
  });
  return changed ? { ...current, incidents } : value;
}

function consecutiveGroups(days) {
  return days.reduce((groups, date) => {
    const current = groups[groups.length - 1];
    if (!current || addDays(current[current.length - 1], 1) !== date) groups.push([date]);
    else current.push(date);
    return groups;
  }, []);
}

export function summarizeLongitudinalEvidence(value, asOf) {
  const current = normalizeLongitudinalEvidence(value);
  const validAsOf = isExplicitDate(asOf) ? asOf : null;
  const evaluatedDays = validAsOf ? current.usageDays.filter((date) => date <= validAsOf) : [];
  const evaluatedGroups = consecutiveGroups(evaluatedDays);
  const isFixture = current.provenance === FIXTURE_PROVENANCE;
  const usageDays = isFixture ? [] : evaluatedDays;
  const groups = isFixture ? [] : evaluatedGroups;
  const lastGroup = groups[groups.length - 1] || [];
  const currentStreakDays = validAsOf && lastGroup[lastGroup.length - 1] === validAsOf ? lastGroup.length : 0;
  const longestStreakDays = groups.reduce((longest, group) => Math.max(longest, group.length), 0);
  const unresolved = current.incidents.filter((incident) => incident.occurredOn <= validAsOf && (!incident.resolvedOn || incident.resolvedOn > validAsOf));
  let qualifiedWindow = null;
  for (let groupIndex = groups.length - 1; groupIndex >= 0 && !qualifiedWindow; groupIndex -= 1) {
    const group = groups[groupIndex];
    for (let endIndex = group.length - 1; endIndex >= 29; endIndex -= 1) {
      const startedOn = group[endIndex - 29];
      const endedOn = group[endIndex];
      const blocked = unresolved.some((incident) => incident.occurredOn >= startedOn && incident.occurredOn <= endedOn);
      if (!blocked) {
        qualifiedWindow = { startedOn, endedOn, days: 30 };
        break;
      }
    }
  }
  const fixtureQualified = isFixture && evaluatedGroups.some((group) => group.length >= 30);
  return {
    provenance: current.provenance,
    totalUsageDays: usageDays.length,
    currentStreakDays,
    longestStreakDays,
    daysRemaining: Math.max(0, 30 - currentStreakDays),
    firstUsedOn: usageDays[0] || null,
    lastUsedOn: usageDays[usageDays.length - 1] || null,
    unresolvedBlockingIncidents: unresolved.length,
    qualified: Boolean(qualifiedWindow),
    qualifiedWindow,
    fixtureUsageDays: isFixture ? evaluatedDays.length : 0,
    fixtureQualified
  };
}
