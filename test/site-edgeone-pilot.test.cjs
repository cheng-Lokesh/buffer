const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('private EdgeOne pilot stages the current site baseline instead of the retired Vite frontend', () => {
  const source = read('site/index.src.html');
  assert.match(source, /night_panorama_astrophotography_v2\.png/);
  assert.match(source, /starfield-background\.js/);

  const stage = read('scripts/prepare-edgeone-site-release.mjs');
  assert.match(stage, /join\(site, 'index\.html'\)/);
  assert.match(stage, /join\(site, 'assets'\)/);
  assert.match(stage, /starfield-background\.js/);
  assert.doesNotMatch(stage, /src[\\/]main\.jsx/);

  const middleware = read('middleware.js');
  assert.match(middleware, /PILOT_ACCESS_PASSWORD/);
  assert.match(middleware, /__pilot-access/);
});
