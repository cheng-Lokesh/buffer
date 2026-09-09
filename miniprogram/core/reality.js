const VALID_RANGES = new Set([7, 30, 90]);

function money(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

function classifyZone(days) {
  if (!Number.isInteger(days) || days < 0) return null;
  if (days < 15) return 'survival';
  if (days < 30) return 'danger';
  if (days <= 60) return 'warning';
  return 'safe';
}

function zoneLabel(zone) {
  return ({ survival: '生死期', danger: '危险期', warning: '警戒期', safe: '安全期' })[zone] || '暂无法判断';
}

function buildTrajectory(balance, daily, reserve, rangeDays) {
  return Array.from({ length: rangeDays + 1 }, (_, day) => ({
    day,
    balance: Math.max(0, Math.round((balance - daily * day) * 100) / 100),
    reserve
  }));
}

function buildRealityModel(input = {}) {
  const cash = input.cash || {};
  const balance = money(cash.balance);
  const reserve = money(cash.reserve);
  const daily = money(cash.daily);
  const rangeDays = VALID_RANGES.has(Number(input.rangeDays)) ? Number(input.rangeDays) : 30;

  if (balance === null || reserve === null || daily === null || daily <= 0) {
    return {
      status: 'unknown', rangeDays, runwayDays: null, zone: null, zoneLabel: '暂无法判断',
      confirmedAt: null, cash: null, composition: null, trajectory: [], changes: []
    };
  }

  const usable = Math.max(0, Math.round((balance - reserve) * 100) / 100);
  const runwayDays = Math.floor(usable / daily);
  const zone = classifyZone(runwayDays);
  const total = Math.max(balance, 1);
  return {
    status: 'current', rangeDays, runwayDays, zone, zoneLabel: zoneLabel(zone),
    confirmedAt: typeof input.confirmedAt === 'string' ? input.confirmedAt : null,
    cash: { balance, reserve, daily, usable },
    composition: {
      reservePercent: Math.min(100, Math.round((reserve / total) * 1000) / 10),
      usablePercent: Math.min(100, Math.round((usable / total) * 1000) / 10)
    },
    trajectory: buildTrajectory(balance, daily, reserve, rangeDays),
    changes: Array.isArray(input.changes) ? input.changes.slice(0, 30) : []
  };
}

module.exports = { VALID_RANGES, money, classifyZone, zoneLabel, buildRealityModel };
