import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const prepare = fileURLToPath(new URL('./prepare-edgeone-private-release.mjs', import.meta.url));

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'], shell: false, ...options });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, output }));
  });
}

const node = process.execPath;
const prepared = await run(node, [prepare]);
if (prepared.code !== 0) process.exit(prepared.code || 1);
const release = prepared.output.trim();
if (!release) throw new Error('private_release_path_missing');

try {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const deployed = await run(npx, [
    '--yes', 'edgeone@1.6.40', 'makers', 'deploy', release,
    '-n', 'buffer-v12-1-private-pilot', '-e', 'production', '--site', 'china', '--skip-ai-gateway-sync', '--json'
  ], { shell: process.platform === 'win32' });
  process.stdout.write(deployed.output);
  process.exitCode = deployed.code || 0;
} finally {
  await rm(release, { recursive: true, force: true });
}
