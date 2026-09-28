import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'site');
const output = resolve(root, 'dist');

if (output !== join(root, 'dist') || !output.startsWith(root + sep)) {
  throw new Error('unsafe_edgeone_output_path');
}

for (const relative of ['index.html', 'site-app.js', 'starfield-background.js', 'assets']) {
  await stat(join(source, relative));
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const relative of ['index.html', 'site-app.js', 'starfield-background.js', 'assets']) {
  await cp(join(source, relative), join(output, relative), { recursive: true, dereference: false });
}
