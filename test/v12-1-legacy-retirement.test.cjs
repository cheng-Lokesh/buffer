const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the default web entry contains only the current four-space reality product', () => {
  const main = read('src/main.jsx');
  assert.match(main, /V8Experience/);
  assert.match(main, /now.*future.*conditions.*records/s);
  assert.doesNotMatch(main, /\b(jobs|projects|premium|payment|cloud|entitlement|phoneLogin|authSession)\b/i);
  assert.match(main, /legacy-data-archive/);
});

test('the deployed server exposes only the V12.1 reality parser boundary', () => {
  const worker = read('server/worker.js');
  const wrangler = read('server/wrangler.jsonc');
  assert.match(worker, /api\/reality\/parse/);
  assert.match(worker, /handleRealityParserRequest/);
  assert.doesNotMatch(worker, /payments|checkout|entitlements|\/auth\/|\/sync\/|feedback|upgrade-requests/i);
  assert.doesNotMatch(wrangler, /PAYMENT|AUTH_DEBUG|PUBLIC_SITE|KV|BUFFER_DB/i);
});

test('legacy product payloads are preserved only by an explicit compatibility archive', async () => {
  const adapterFile = path.join(root, 'src/legacy-data-archive.js');
  assert.equal(fs.existsSync(adapterFile), true);
  const { archiveLegacyProductData, restoreLegacyProductData } = await import(pathToFileURL(adapterFile).href);
  const legacy = {
    cash: { balance: 1000 },
    jobs: [{ company: '旧版公司' }],
    projects: [{ name: '旧版项目' }],
    entitlement: { status: 'active' }
  };
  const archive = archiveLegacyProductData(legacy);
  assert.deepEqual(archive, {
    version: 1,
    payload: {
      jobs: legacy.jobs,
      projects: legacy.projects,
      entitlement: legacy.entitlement
    }
  });
  assert.deepEqual(restoreLegacyProductData({ cash: legacy.cash }, archive), legacy);
  assert.equal(archiveLegacyProductData(null), null);
  assert.equal(archiveLegacyProductData({}), null);
  assert.deepEqual(restoreLegacyProductData({ cash: legacy.cash }, null), { cash: legacy.cash });
});

test('the local preview no longer packages retired product demonstrations', () => {
  const vite = read('vite.config.js');
  const packageJson = read('package.json');
  assert.doesNotMatch(vite, /miniprogram-v1-preview|v8-blueprint-preview/);
  assert.doesNotMatch(packageJson, /cf:deploy|wrangler deploy/);
});
