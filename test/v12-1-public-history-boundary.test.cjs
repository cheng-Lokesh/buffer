const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

test('the current public branch is one sanitized root snapshot', () => {
  assert.equal(git('rev-list', '--count', 'HEAD'), '1');
  assert.equal(git('rev-list', '--max-parents=0', 'HEAD'), git('rev-parse', 'HEAD'));
});

test('the normal checkout exposes only main and the current release tag', () => {
  const remoteBranches = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin')
    .split(/\r?\n/)
    .filter((name) => name && name !== 'origin' && name !== 'origin/HEAD')
    .sort();
  const tags = git('tag', '--list').split(/\r?\n/).filter(Boolean).sort();

  assert.deepEqual(remoteBranches, ['origin/main']);
  assert.deepEqual(tags, ['v0.35.0']);
});
