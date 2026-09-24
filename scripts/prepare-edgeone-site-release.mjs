import { cp, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const site = join(root, 'site');
const release = join(tmpdir(), `buffer-edgeone-site-${randomUUID()}`);

try {
  if (!(await stat(join(site, 'index.html'))).isFile()) throw new Error('site_build_missing');
  await mkdir(release, { recursive: true });
  await cp(join(site, 'index.html'), join(release, 'index.html'));
  await cp(join(site, 'assets'), join(release, 'assets'), { recursive: true });
  await cp(join(site, 'starfield-background.js'), join(release, 'starfield-background.js'));
  await cp(join(site, 'site-app.js'), join(release, 'site-app.js'));
  await cp(join(root, 'middleware.js'), join(release, 'middleware.js'));
  await mkdir(join(release, 'server'), { recursive: true });
  await cp(join(root, 'server', 'v12-1-deepseek.js'), join(release, 'server', 'v12-1-deepseek.js'));
  await mkdir(join(release, 'src'), { recursive: true });
  await cp(join(root, 'src', 'v12-1-reality-parser.js'), join(release, 'src', 'v12-1-reality-parser.js'));
  process.stdout.write(`${release}\n`);
} catch (error) {
  process.stderr.write(`site_release_prepare_failed:${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exitCode = 1;
}
