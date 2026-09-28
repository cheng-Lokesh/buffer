import test from 'node:test';
import assert from 'node:assert/strict';
import { createBalanceAxis, formatChartAmount } from '../src/v12-1-chart-axis.js';

test('balance axis adapts to a narrow high-value range instead of forcing zero', () => {
  const axis = createBalanceAxis([998_000, 999_000, 1_000_000], { targetIntervals: 4 });
  assert.ok(axis.min > 990_000);
  assert.ok(axis.max < 1_010_000);
  assert.ok(axis.ticks.length >= 3 && axis.ticks.length <= 6);
  assert.ok(axis.ticks.every((value, index) => index === 0 || value > axis.ticks[index - 1]));
});

test('balance axis includes reserve and scenario values on the same linear domain', () => {
  const axis = createBalanceAxis([-350, 1_270, 4_000, 5_500]);
  assert.ok(axis.min <= -350);
  assert.ok(axis.max >= 5_500);
  assert.ok(axis.ticks.includes(0));
});

test('balance axis remains readable when all amounts are equal', () => {
  const axis = createBalanceAxis([4_000, 4_000, 4_000]);
  assert.ok(axis.min < 4_000 && axis.max > 4_000);
  assert.ok(Number.isFinite(axis.step) && axis.step > 0);
});

test('axis amounts stay compact while selected values can remain exact', () => {
  assert.equal(formatChartAmount(4_000), '¥4,000');
  assert.equal(formatChartAmount(123_000), '¥12.3万');
  assert.equal(formatChartAmount(120_000_000), '¥1.2亿');
  assert.equal(formatChartAmount(-350), '−¥350');
});

test('empty or invalid values get a finite fallback scale', () => {
  assert.deepEqual(createBalanceAxis([NaN, Infinity]), { min: 0, max: 1, step: 1, ticks: [0, 1] });
});
