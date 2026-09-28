const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
);
const rootIndex = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const siteServerPath = path.join(repoRoot, 'server', 'site-server.mjs');
const siteServer = fs.existsSync(siteServerPath)
  ? fs.readFileSync(siteServerPath, 'utf8')
  : '';

test('all default npm entrypoints serve the current site frontend', () => {
  for (const scriptName of ['dev', 'start', 'preview']) {
    const command = packageJson.scripts[scriptName];
    assert.equal(typeof command, 'string', `missing npm script: ${scriptName}`);
    assert.match(command, /server[\\/]site-server\.mjs/);
    assert.doesNotMatch(command, /vite/i);
  }

  assert.match(packageJson.scripts.build, /site[\\/]build_index\.py/);
  assert.doesNotMatch(packageJson.scripts.build, /vite/i);
  assert.match(siteServer, /siteRoot\s*=\s*resolve\([^\n]+['"]site['"]\)/);
});

test('opening the repository root deterministically enters site/index.html', () => {
  assert.match(rootIndex, /site\/index\.html/);
  assert.doesNotMatch(rootIndex, /\/src\/main\.jsx/);
  assert.doesNotMatch(rootIndex, /id=["']root["']/);
});
