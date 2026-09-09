const DEFAULT_PADDING = Object.freeze({ top: 18, right: 28, bottom: 32, left: 62 });

function finiteValues(points) {
  if (!Array.isArray(points)) return [];
  return points.map((point) => Number(point?.closingBalanceCents)).filter(Number.isFinite);
}

function normalizedPadding(value = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_PADDING).map(([key, fallback]) => {
    const candidate = Number(value[key]);
    return [key, Number.isFinite(candidate) && candidate >= 0 ? candidate : fallback];
  }));
}

function niceStep(span, targetIntervals) {
  const rough = Math.abs(span) / Math.max(1, targetIntervals);
  if (!Number.isFinite(rough) || rough === 0) return 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;
  const candidates = [1, 2, 2.5, 5, 10];
  const nearest = candidates.reduce((best, candidate) => (
    Math.abs(candidate - normalized) < Math.abs(best - normalized) ? candidate : best
  ));
  return nearest * power;
}

function niceDomain(rawMin, rawMax, requestedCount) {
  let minimum = rawMin;
  let maximum = rawMax;
  if (minimum === maximum) {
    const magnitude = Math.max(Math.abs(minimum), 100);
    const padding = Math.max(100, magnitude * 0.08);
    minimum -= padding;
    maximum += padding;
  }
  const step = niceStep(maximum - minimum, Math.max(1, requestedCount - 1));
  let domainMin = Math.floor(minimum / step) * step;
  let domainMax = Math.ceil(maximum / step) * step;
  if (domainMin === domainMax) domainMax = domainMin + step;
  const precision = Math.max(0, -Math.floor(Math.log10(step)));
  const round = (value) => Number(value.toFixed(precision));
  domainMin = round(domainMin);
  domainMax = round(domainMax);
  const ticks = [];
  for (let value = domainMax, guard = 0; value >= domainMin - step * 0.001 && guard < 12; value -= step, guard += 1) {
    ticks.push(round(Math.abs(value) < step * 0.0001 ? 0 : value));
  }
  return { domainMin, domainMax, step, ticks };
}

export function buildCashChartScale({
  baselinePoints = [],
  scenarioPoints = [],
  reserveCents = 0,
  width = 800,
  height = 250,
  padding,
  tickCount = 5
} = {}) {
  const safeWidth = Number.isFinite(Number(width)) && Number(width) > 0 ? Number(width) : 800;
  const safeHeight = Number.isFinite(Number(height)) && Number(height) > 0 ? Number(height) : 250;
  const safePadding = normalizedPadding(padding);
  const plotBounds = {
    left: Math.min(safePadding.left, safeWidth - 1),
    right: Math.max(1, safeWidth - safePadding.right),
    top: Math.min(safePadding.top, safeHeight - 1),
    bottom: Math.max(1, safeHeight - safePadding.bottom)
  };
  if (plotBounds.right <= plotBounds.left) plotBounds.right = Math.min(safeWidth, plotBounds.left + 1);
  if (plotBounds.bottom <= plotBounds.top) plotBounds.bottom = Math.min(safeHeight, plotBounds.top + 1);

  const reserve = Number.isFinite(Number(reserveCents)) ? Number(reserveCents) : 0;
  const values = [...finiteValues(baselinePoints), ...finiteValues(scenarioPoints), reserve];
  let rawMin = Math.min(...values);
  let rawMax = Math.max(...values);
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) rawMin = rawMax = 0;
  const count = Math.max(2, Math.min(8, Math.round(Number(tickCount) || 5)));
  const nice = niceDomain(rawMin, rawMax, count);
  const { domainMin, domainMax } = nice;
  const domainSpan = domainMax - domainMin;

  const yForValue = (value) => {
    const numeric = Number(value);
    const safeValue = Number.isFinite(numeric) ? numeric : domainMin;
    const ratio = (domainMax - safeValue) / domainSpan;
    return plotBounds.top + ratio * (plotBounds.bottom - plotBounds.top);
  };
  const xForIndex = (index, pointCount = baselinePoints.length) => {
    const total = Math.max(1, Number(pointCount) - 1);
    const safeIndex = Math.max(0, Math.min(total, Number(index) || 0));
    return plotBounds.left + (safeIndex / total) * (plotBounds.right - plotBounds.left);
  };
  const ticks = nice.ticks.map((value) => ({ value, y: yForValue(value) }));

  return {
    domainMin,
    domainMax,
    plotBounds,
    reserveY: yForValue(reserve),
    ticks,
    yForValue,
    xForIndex
  };
}

export function buildFutureChartAnnotations({ points = [], reserveCents = 0, reserveTouch = null } = {}) {
  if (!Array.isArray(points) || !points.length) return { start: null, end: null, crossing: null };
  const start = { date: points[0].date, valueCents: points[0].closingBalanceCents, pointIndex: 0 };
  const endIndex = points.length - 1;
  const end = { date: points[endIndex].date, valueCents: points[endIndex].closingBalanceCents, pointIndex: endIndex };
  let crossing = null;
  if (reserveTouch?.status === 'reached' && reserveTouch.date) {
    let pointIndex = points.findIndex((point) => point.date === reserveTouch.date);
    if (pointIndex < 0) pointIndex = points.findIndex((point) => Number(point.closingBalanceCents) <= Number(reserveCents));
    if (pointIndex >= 0) crossing = { date: reserveTouch.date, valueCents: Number(reserveCents), pointIndex };
  }
  return { start, end, crossing };
}

export function chartPath(points, scale) {
  if (!Array.isArray(points) || !points.length || !scale) return '';
  return points.map((point, index) => {
    const x = scale.xForIndex(index, points.length);
    const y = scale.yForValue(point.closingBalanceCents);
    return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

export function buildTimeAxisTicks(points, scale, count = 4) {
  if (!Array.isArray(points) || !points.length || !scale) return [];
  const tickCount = Math.max(2, Math.min(points.length, Number(count) || 4));
  const indices = [...new Set(Array.from({ length: tickCount }, (_, index) => Math.round((index / (tickCount - 1)) * (points.length - 1))))];
  return indices.map((pointIndex) => ({ pointIndex, date: points[pointIndex].date, x: scale.xForIndex(pointIndex, points.length) }));
}
