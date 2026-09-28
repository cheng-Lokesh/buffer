import { cp, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist');
const release = join(tmpdir(), `buffer-edgeone-private-${randomUUID()}`);

async function copyContents(source, destination) {
  for (const entry of await readdir(source)) {
    await cp(join(source, entry), join(destination, entry), { recursive: true, dereference: false });
  }
}

try {
  const index = await stat(join(output, 'index.html'));
  if (!index.isFile()) throw new Error('production_build_missing');
  const [builtIndex, currentIndex] = await Promise.all([
    readFile(join(output, 'index.html')),
    readFile(join(root, 'site/index.html'))
  ]);
  if (!builtIndex.equals(currentIndex)) throw new Error('production_build_stale');
  await mkdir(release, { recursive: true });
  await copyContents(output, release);
  for (const relative of [
    'edge-functions/api/reality/parse.js',
    'middleware.js',
    'server/v12-1-deepseek.js',
    'src/v12-1-reality-parser.js'
  ]) {
    await cp(join(root, relative), join(release, relative), { recursive: true, dereference: false });
  }
  process.stdout.write(`${release}\n`);
} catch (error) {
  process.stderr.write(`private_release_prepare_failed:${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exitCode = 1;
}
