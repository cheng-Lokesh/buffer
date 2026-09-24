const cents = (amount) => Number.isFinite(Number(amount)) ? Math.round(Number(amount) * 100) : null;

export function buildNowDashboardFacts(reality, view, asOf) {
  if (!view?.valid || !Array.isArray(view.points) || !view.points.length) return null;

  const pointAt = (day) => view.points[day]?.closingBalanceCents ?? null;
  const start = Date.parse(`${asOf}T00:00:00Z`);
  const cutoff = Number.isFinite(start) ? new Date(start - 29 * 86400000).toISOString().slice(0, 10) : asOf;
  const recentEvents = [...(reality?.events || [])]
    .filter((event) => ['income', 'expense'].includes(event.type)
      && Number.isFinite(Number(event.amount))
      && event.occurredAt >= cutoff && event.occurredAt <= asOf)
    .sort((left, right) => `${right.occurredAt}${right.createdAt || ''}`.localeCompare(`${left.occurredAt}${left.createdAt || ''}`));
  const recorded30 = recentEvents.reduce((total, event) => {
    total[`${event.type}Cents`] += cents(event.amount);
    total[`${event.type}Count`] += 1;
    total.count += 1;
    return total;
  }, { incomeCents: 0, expenseCents: 0, incomeCount: 0, expenseCount: 0, count: 0 });

  const future30 = view.points.slice(1, 31).reduce((total, point) => {
    total.confirmedIncomeCents += point.confirmedInflowsCents || 0;
    total.extraExpenseCents += point.recurringOutflowsCents || 0;
    total.minimumSpendCents += point.dailyFloorOutflowsCents || 0;
    if (point.oneOffEventsCents > 0) total.confirmedIncomeCents += point.oneOffEventsCents;
    if (point.oneOffEventsCents < 0) total.extraExpenseCents -= point.oneOffEventsCents;
    return total;
  }, { confirmedIncomeCents: 0, extraExpenseCents: 0, minimumSpendCents: 0 });

  const upcomingCutoff = Number.isFinite(start) ? new Date(start + 30 * 86400000).toISOString().slice(0, 10) : asOf;
  const nextKnownChange = (view.expectedOccurrences || [])
    .filter((item) => item.status === 'upcoming' && !item.includedInDailyFloor && item.expectedDate <= upcomingCutoff)
    .sort((left, right) => left.expectedDate.localeCompare(right.expectedDate))[0] || null;
  const dailyFloor = (reality?.conditions || []).find((item) => item.type === 'daily_floor' && item.status === 'confirmed');

  return {
    forecastBalancesCents: { day7: pointAt(7), day30: pointAt(30), day60: pointAt(60) },
    minimumDailySpendCents: dailyFloor ? cents(dailyFloor.amount) : null,
    recorded30,
    latestEvent: recentEvents[0] || null,
    future30,
    nextKnownChange
  };
}
