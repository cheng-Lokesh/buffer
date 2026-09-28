const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

test('the current public branch descends only from the sanitized release root', () => {
  assert.equal(git('rev-list', '--max-parents=0', 'HEAD'), git('rev-parse', 'v0.35.0'));
  assert.equal(git('rev-list', '--count', '--max-parents=0', 'HEAD'), '1');
});

test('all published branches share the sanitized root and only the current release tag remains', () => {
  const remoteBranches = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin')
    .split(/\r?\n/)
    .filter((name) => name && name !== 'origin' && name !== 'origin/HEAD')
    .sort();
  const tags = git('tag', '--list').split(/\r?\n/).filter(Boolean).sort();

  const releaseRoot = git('rev-parse', 'v0.35.0');
  assert.ok(remoteBranches.includes('origin/main'));
  for (const branch of remoteBranches) {
    assert.equal(git('rev-list', '--max-parents=0', branch), releaseRoot, branch);
  }
  assert.deepEqual(tags, ['v0.35.0']);
});
