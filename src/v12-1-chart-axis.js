function niceStep(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const multiplier = [1, 2, 2.5, 5, 10].find((candidate) => candidate >= normalized) || 10;
  return multiplier * magnitude;
}

export function createBalanceAxis(values, { targetIntervals = 4 } = {}) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: 0, max: 1, step: 1, ticks: [0, 1] };
  const observedMin = Math.min(...finite);
  const observedMax = Math.max(...finite);
  const observedSpan = observedMax - observedMin;
  const workingSpan = observedSpan || Math.max(1, Math.abs(observedMax) * 0.08);
  const padding = workingSpan * 0.1;
  const step = niceStep((workingSpan + 2 * padding) / Math.max(2, targetIntervals));
  const min = Math.floor((observedMin - padding) / step) * step;
  const max = Math.ceil((observedMax + padding) / step) * step;
  const tickCount = Math.round((max - min) / step);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => Number((min + index * step).toPrecision(12)));
  return { min, max, step, ticks };
}

export function formatChartAmount(value) {
  const sign = value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${sign}¥${Number((absolute / 100_000_000).toFixed(1))}亿`;
  if (absolute >= 10_000) return `${sign}¥${Number((absolute / 10_000).toFixed(1))}万`;
  return `${sign}¥${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(absolute)}`;
}
