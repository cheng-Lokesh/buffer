import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createDeepSeekRealityParserAdapter } from '../server/v12-1-deepseek.js';
import worker from '../server/worker.js';
import edgeOneRealityParser from '../edge-functions/api/reality/parse.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('provider requests stop within the configured timeout instead of hanging', async () => {
  const adapter = createDeepSeekRealityParserAdapter({
    apiKey: 'fixture',
    timeoutMs: 20,
    fetchImpl: async (_url, init) => new Promise((resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    })
  });
  const outcome = await Promise.race([
    adapter.parse({ text: '房租扣了1500', currentDate: '2026-09-20' }).then(
      () => 'resolved',
      (error) => error?.message
    ),
    new Promise((resolve) => setTimeout(() => resolve('test_timeout'), 150))
  ]);
  assert.equal(outcome, 'provider_timeout');
});

test('production worker rejects parser requests when the single-user rate limit is exhausted', async () => {
  let limiterCalls = 0;
  const response = await worker.fetch(new Request('https://buffer.example/api/reality/parse', {
    method: 'GET',
    headers: { origin: 'https://buffer.example' }
  }), {
    REALITY_PARSER_RATE_LIMITER: {
      async limit({ key }) {
        limiterCalls += 1;
        assert.equal(key, 'single-user:reality-parser');
        return { success: false };
      }
    }
  });
  assert.equal(limiterCalls, 1);
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'rate_limited' });
});

test('EdgeOne parser route enforces its single-user request ceiling before provider work', async () => {
  const responses = [];
  for (let index = 0; index < 31; index += 1) {
    responses.push(await edgeOneRealityParser({
      request: new Request('https://buffer.example/api/reality/parse', { method: 'GET' }),
      env: {}
    }));
  }
  assert.equal(responses[29].status, 405);
  assert.equal(responses[30].status, 429);
  assert.deepEqual(await responses[30].json(), { error: 'rate_limited' });
});

test('pilot deployment targets Tencent EdgeOne Makers China without an active Cloudflare route', () => {
  const config = JSON.parse(read('edgeone.json'));
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, './dist');
  assert.equal(config.nodeVersion, '22.11.0');

  const edgeFunction = read('edge-functions/api/reality/parse.js');
  assert.match(edgeFunction, /handleRealityParserRequest/);
  assert.match(edgeFunction, /context\.request/);
  assert.match(edgeFunction, /context\.env/);
  const middleware = read('middleware.js');
  assert.match(middleware, /PILOT_ACCESS_PASSWORD/);
  assert.match(middleware, /private_pilot_not_configured/);
  assert.match(middleware, /HttpOnly/);

  const packageJson = JSON.parse(read('package.json'));
  assert.match(packageJson.scripts['deploy:pilot:verify'] || '', /npm run build/);
  assert.match(packageJson.scripts['deploy:pilot:prepare'] || '', /prepare-edgeone-private-release/);
  assert.match(packageJson.scripts['deploy:pilot'] || '', /deploy-edgeone-private-release/);
  assert.doesNotMatch(packageJson.scripts['deploy:pilot'] || '', /wrangler|cloudflare/i);
  assert.equal(packageJson.devDependencies.wrangler, undefined);

  const deployScript = read('scripts/deploy-edgeone-private-release.mjs');
  assert.match(deployScript, /edgeone@1\.6\.40/);
  assert.match(deployScript, /'--site', 'china'/);
  assert.match(deployScript, /rm\(release, \{ recursive: true, force: true \}\)/);
  assert.match(deployScript, /shell: process\.platform === 'win32'/);

  assert.equal(fs.existsSync(path.join(root, 'server', 'wrangler.jsonc')), false);
});

test('pilot page includes its own favicon without depending on the retired root page', () => {
  const index = read('site/index.html');
  assert.match(index, /rel=["']icon["'] href=["']data:image\/svg\+xml,/);
  assert.equal(fs.existsSync(path.join(root, 'site', 'index.html')), true);
});
