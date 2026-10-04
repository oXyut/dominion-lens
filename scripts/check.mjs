import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { checkBuildInfo } from './build-info.mjs';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'extension');
const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
await checkBuildInfo(root);
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);
assert.ok(!manifest.web_accessible_resources && !manifest.externally_connectable);
assert.deepEqual(manifest.background, { service_worker: 'background.js' });
await readFile(path.join(dir, manifest.background.service_worker));
for (const group of manifest.content_scripts) for (const file of group.js) await readFile(path.join(dir, file));
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (file.endsWith('.js') || file.endsWith('.mjs')) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}
for (const name of ['extension', 'demo', 'scripts', 'tests']) await walk(path.join(root, name));
console.log('Manifest, referenced files, permissions and JavaScript syntax: OK');
