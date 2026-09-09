const VALID_RANGES = new Set([7, 30, 90]);
const DAY_MS = 86400000;

function parseTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildHistoryModel(input = {}) {
  const rangeDays = VALID_RANGES.has(Number(input.rangeDays)) ? Number(input.rangeDays) : 30;
  const now = parseTime(input.now) || new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const cutoff = new Date(startOfToday.getTime() - rangeDays * DAY_MS);
  const changes = (Array.isArray(input.changes) ? input.changes : [])
    .map((change) => ({ change, date: parseTime(change && change.occurredAt) }))
    .filter(({ change, date }) => date && date >= cutoff && date <= now && change.after && Number.isFinite(Number(change.after.balance)))
    .sort((left, right) => left.date - right.date)
    .map(({ change }) => change);
  const points = changes.map((change) => ({
    date: change.occurredAt.slice(0, 10),
    balance: Number(change.after.balance),
    reserve: Number(change.after.reserve) || 0,
    daily: Number(change.after.daily) || 0
  }));
  const mode = points.length === 0 ? 'empty' : points.length === 1 ? 'snapshot' : points.length < 8 ? 'points' : 'line';
  const delta = points.length >= 2 ? Math.round((points[points.length - 1].balance - points[0].balance) * 100) / 100 : null;
  const averageDaily = points.length ? Math.round((points.reduce((sum, point) => sum + point.daily, 0) / points.length) * 100) / 100 : null;
  return { rangeDays, mode, points, changes: changes.slice().reverse(), delta, averageDaily };
}

module.exports = { VALID_RANGES, buildHistoryModel };
