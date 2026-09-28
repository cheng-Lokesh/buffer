const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = fs.readFileSync(path.resolve(__dirname, '../site/app-entry.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '../site/index.src.html'), 'utf8');
const section = (start, end) => runtime.match(new RegExp(`function ${start}\\([\\s\\S]*?function ${end}\\(`))?.[0] || '';

test('entering Records through the main navigation starts at confirmed history', () => {
  assert.match(runtime, /\.nav-item\[data-page="rec"\][\s\S]*?billView\s*=\s*'confirmed'/);
});

test('precise amount edit compares before and after, blocks no-op, and permits returning to edit', () => {
  const source = section('openPrecise', 'openOccurrenceChange');
  assert.match(source, /item\.status\s*===\s*'confirmed'/);
  assert.match(source, /amount\s*===\s*Number\(item\.amount\)/);
  assert.match(source, /原金额/);
  assert.match(source, /新金额/);
  assert.match(source, /返回修改/);
});

test('modal has compact header and keeps keyboard focus inside until dismissed', () => {
  const source = section('modal', 'openBaseline');
  assert.match(html, /\.live-modal header\s*\{[^}]*height:auto/);
  assert.match(source, /event\.key\s*!==\s*'Tab'/);
  assert.match(source, /previousFocus/);
});

test('Future has one range control and read-only comparison cards', () => {
  const source = section('renderFuture', 'conditionLabel');
  assert.match(source, /<article class="fut-card/);
  assert.doesNotMatch(source, /<button class="fut-card/);
  assert.match(source, /class="chart-tabs"/);
});

test('an empty local bill import offers one visible file-choice action', () => {
  const source = section('renderRecords', 'importBillFile');
  assert.match(source, /billRows\.length\s*\?\s*`<button[^`]*data-action="bill-import"/);
  assert.match(source, /bill-empty/);
});

test('a saved scenario can be reopened from Future without entering Reality', () => {
  const source = section('renderFuture', 'conditionLabel');
  const actions = section('action', 'modal');
  assert.match(source, /scenarioDrafts/);
  assert.match(source, /data-action="open-saved-scenario"/);
  assert.match(actions, /open-saved-scenario/);
  assert.match(actions, /runScenarioPatch/);
  assert.doesNotMatch(actions, /saveReality\([\s\S]*?open-saved-scenario/);
});

test('backup actions stay behind one secondary Records control', () => {
  const source = section('renderRecords', 'importBillFile');
  assert.match(source, /data-action="backup-actions"/);
  assert.doesNotMatch(source, /data-action="export"/);
  assert.doesNotMatch(source, /data-action="import"/);
  assert.match(runtime, /function openBackupActions\(/);
});

test('sparse Conditions and Records do not inflate empty cards to half-screen height', () => {
  assert.match(html, /\.reference-conditions\.is-sparse \.cond-mid\s*\{[^}]*height:auto/);
  assert.match(html, /\.reference-records\.is-sparse \.rec-mid\s*\{[^}]*height:auto/);
  assert.match(html, /\.reference-records\.is-sparse \.rec-card\s*\{[^}]*height:auto/);
});

test('empty condition cards do not show a useless internal scrollbar', () => {
  assert.match(section('renderConditions', 'renderRecords'), /condition-group group-\$\{groupIndex \+ 1\}\$\{items\.length \? '' : ' is-empty'\}/);
  assert.match(html, /\.condition-group\.is-empty \.set-list\s*\{[^}]*overflow:visible/);
});
