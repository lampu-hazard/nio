import { Glob } from 'bun';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const client = resolve(root, 'apps/client');
const checks = [...new Glob('lib/**/*.check.{ts,tsx}').scanSync({ cwd: client })].sort();
if (!checks.length) throw new Error('No client checks found.');
for (const check of checks) {
  console.log(`\nChecking ${check}`);
  const result = Bun.spawnSync([process.execPath, check], { cwd: client, stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) process.exit(result.exitCode || 1);
}
console.log(`\n${checks.length} client check files passed.`);
