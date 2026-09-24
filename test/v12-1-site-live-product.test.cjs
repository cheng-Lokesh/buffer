const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const read = (path) => readFile(resolve(root, path), 'utf8');

test('current site loads the live V12.1 product runtime', async () => {
  const [html, app] = await Promise.all([
    read('site/index.src.html'),
    read('site/app-entry.js')
  ]);

  assert.match(html, /<script type="module" src="site-app\.js"><\/script>/);
  assert.match(app, /createV12_1RealityParser/);
  assert.match(app, /commitRealityCapture/);
  assert.match(app, /buildCashRealityProjection/);
  assert.match(app, /captureTemporalMemory/);
  assert.match(app, /persistProductState/);
  assert.match(app, /prepareBackupPreview/);
  assert.match(app, /buffer-zone\.product\.state\.v1/);
});
test('local and EdgeOne runtimes expose the authenticated parser endpoint', async () => {
  const [localServer, middleware, release, build] = await Promise.all([
    read('server/site-server.mjs'),
    read('middleware.js'),
    read('scripts/prepare-edgeone-site-release.mjs'),
    read('site/build_runtime.mjs')
  ]);

  assert.match(localServer, /handleRealityParserRequest/);
  assert.match(localServer, /\/api\/reality\/parse/);
  assert.match(middleware, /handleRealityParserRequest/);
  assert.match(middleware, /\/api\/reality\/parse/);
  assert.match(release, /site-app\.js/);
  assert.match(release, /v12-1-deepseek\.js/);
  assert.match(release, /v12-1-reality-parser\.js/);
  assert.match(build, /app-entry\.js/);
});

