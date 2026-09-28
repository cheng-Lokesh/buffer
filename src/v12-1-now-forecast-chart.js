const WIDTH = 1000;
const HEIGHT = 240;
const LEFT = 16;
const RIGHT = 984;
const TOP = 18;
const BOTTOM = 210;
const CHECKPOINT_DAYS = [0, 30, 60, 90];

export function buildNowForecastChart(view) {
  if (!view?.valid || !Array.isArray(view.points) || view.points.length < 2
    || !Number.isFinite(view.reserveCents)) return null;

  const balances = view.points.map((point, index) => index === 0 && Number.isFinite(point?.openingBalanceCents)
    ? point.openingBalanceCents
    : point?.closingBalanceCents);
  if (balances.some((balance) => !Number.isFinite(balance))) return null;

  const minimum = Math.min(view.reserveCents, ...balances);
  const maximum = Math.max(view.reserveCents, ...balances);
  const padding = maximum > minimum ? (maximum - minimum) * 0.1 : Math.max(1000, Math.abs(maximum) * 0.1);
  const lower = minimum - padding;
  const upper = maximum + padding;
  const xAt = (index) => LEFT + (index / (view.points.length - 1)) * (RIGHT - LEFT);
  const yAt = (amount) => TOP + ((upper - amount) / (upper - lower)) * (BOTTOM - TOP);
  const points = view.points.map((point, index) => ({
    day: index,
    x: Number(xAt(index).toFixed(2)),
    y: Number(yAt(balances[index]).toFixed(2)),
    balanceCents: balances[index],
    date: String(point.date || '')
  }));
  const path = points.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const checkpoints = CHECKPOINT_DAYS.flatMap((day) => points[day] ? [points[day]] : []);
  const touchDay = view.reserveTouch?.status === 'reached' ? view.reserveTouch.days : null;

  return {
    width: WIDTH,
    height: HEIGHT,
    path,
    reserveY: Number(yAt(view.reserveCents).toFixed(2)),
    reserveCents: view.reserveCents,
    points,
    checkpoints,
    reserveTouch: Number.isInteger(touchDay) ? points[touchDay] || null : null
  };
}
