import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

test('EdgeOne release contains the current site entry and assets, not the retired Vite page or source files', () => {
  execFileSync(npm, ['run', 'build'], { cwd: root, shell: process.platform === 'win32', stdio: 'pipe' });
  const release = execFileSync(process.execPath, [join(root, 'scripts/prepare-edgeone-private-release.mjs')], {
    cwd: root,
    encoding: 'utf8'
  }).trim();
  const safeRoot = resolve(tmpdir()) + sep;
  assert.ok(resolve(release).startsWith(safeRoot));
  assert.match(basename(release), /^buffer-edgeone-private-[0-9a-f-]+$/);
  try {
    const current = readFileSync(join(root, 'site/index.html'), 'utf8');
    const published = readFileSync(join(release, 'index.html'), 'utf8');
    const digest = (value) => createHash('sha256').update(value).digest('hex');
    assert.equal(digest(published), digest(current), 'released index differs from the current site');
    assert.match(published, /site-app\.js/);
    assert.match(published, /starfield-background\.js/);
    for (const asset of ['site-app.js', 'starfield-background.js', 'assets/night_panorama_user_crop.png', 'assets/side_card_web.mp4']) {
      assert.ok(existsSync(join(release, asset)), `missing published asset: ${asset}`);
    }
    for (const source of ['index.src.html', 'app-entry.js', 'build_index.py', 'server.py', 'package.json']) {
      assert.equal(existsSync(join(release, source)), false, `source file exposed: ${source}`);
    }
  } finally {
    rmSync(release, { recursive: true, force: true });
  }
});
