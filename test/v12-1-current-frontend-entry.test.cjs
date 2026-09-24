const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
);
const rootIndex = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

test('all default npm entrypoints serve the current site frontend', () => {
  for (const scriptName of ['dev', 'start', 'preview']) {
    const command = packageJson.scripts[scriptName];
    assert.equal(typeof command, 'string', `missing npm script: ${scriptName}`);
    assert.match(command, /site[\\/]server\.py/);
    assert.doesNotMatch(command, /vite/i);
  }

  assert.match(packageJson.scripts.build, /site[\\/]build_index\.py/);
  assert.doesNotMatch(packageJson.scripts.build, /vite/i);
});

test('opening the repository root deterministically enters site/index.html', () => {
  assert.match(rootIndex, /site\/index\.html/);
  assert.doesNotMatch(rootIndex, /\/src\/main\.jsx/);
  assert.doesNotMatch(rootIndex, /id=["']root["']/);
});
