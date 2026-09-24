import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const run = (command, args, options = {}) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.on('error', reject);
  child.on('close', (code) => resolveRun({ code, output }));
});

const prepared = await run(process.execPath, ['scripts/prepare-edgeone-site-release.mjs']);
if (prepared.code !== 0) throw new Error(prepared.output || 'site_release_prepare_failed');
const release = prepared.output.trim();
try {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const deployed = await run(npx, ['--yes', 'edgeone@1.6.40', 'makers', 'deploy', release, '-n', 'buffer-v12-1-private-pilot', '-e', 'production', '--site', 'china', '--skip-ai-gateway-sync', '--json'], { shell: process.platform === 'win32' });
  process.stdout.write(deployed.output);
  process.exitCode = deployed.code || 0;
} finally {
  await rm(release, { recursive: true, force: true });
}
