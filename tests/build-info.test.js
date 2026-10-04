import { cp, mkdir, mkdtemp, readFile, rm, appendFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBuildInfo, checkBuildInfo, writeBuildInfo } from '../scripts/build-info.mjs';

const root = path.resolve(import.meta.dirname, '..');
async function cleanCopy(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'dominion-lens-build-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(path.join(root, 'extension'), path.join(dir, 'extension'), { recursive: true });
  await cp(path.join(root, 'package.json'), path.join(dir, 'package.json'));
  await mkdir(path.join(dir, 'scripts'));
  for (const file of ['build-info.mjs', 'package.mjs']) await cp(path.join(root, 'scripts', file), path.join(dir, 'scripts', file));
  return dir;
}

test('checked-in build information matches the complete extension source', async () => {
  const info = await checkBuildInfo(root);
  assert.match(info.build, /^[a-f0-9]{12}$/);
  assert.notEqual(info.version, '0.1.1');
  const manifest = JSON.parse(await readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
  const isolated = manifest.content_scripts.find(group => group.world !== 'MAIN').js;
  assert.ok(isolated.indexOf('lib/build-info.js') < isolated.indexOf('lib/view.js'));
  assert.ok(isolated.includes('lib/build-info.js'));
});

test('source edits with the same release version reject stale packaging until regenerated', async t => {
  const dir = await cleanCopy(t), before = await checkBuildInfo(dir);
  await appendFile(path.join(dir, 'extension/bridge.js'), '\n// Anonymous source-update fixture.\n');
  const changed = await calculateBuildInfo(dir);
  assert.equal(changed.version, before.version);
  assert.notEqual(changed.build, before.build);
  await assert.rejects(checkBuildInfo(dir), /Build information is stale/);
  assert.throws(() => execFileSync(process.execPath, ['scripts/package.mjs'], { cwd: dir, stdio: 'pipe' }), /Build information is stale/);
  const generated = await writeBuildInfo(dir);
  assert.equal((await checkBuildInfo(dir)).build, generated.build);
  assert.equal((await writeBuildInfo(dir)).build, generated.build, 'regeneration must be deterministic');
  const manifestPath = path.join(dir, 'extension/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.description += ' Changed manifest fixture.';
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.notEqual((await calculateBuildInfo(dir)).build, generated.build);
  await assert.rejects(checkBuildInfo(dir), /Build information is stale/);
});

test('clean copies need no Git metadata and their ZIP filename, Manifest and panel identity agree', async t => {
  const dir = await cleanCopy(t);
  execFileSync(process.execPath, ['scripts/build-info.mjs', '--write'], { cwd: dir, stdio: 'pipe' });
  const info = await checkBuildInfo(dir);
  assert.equal(info.build, (await checkBuildInfo(root)).build, 'folder paths must not affect the identity');
  const zip = execFileSync(process.execPath, ['scripts/package.mjs'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(path.basename(zip), `dominion-lens-${info.version}-${info.build}.zip`);
  execFileSync('unzip', ['-t', zip], { stdio: 'pipe' });
  const manifest = JSON.parse(execFileSync('unzip', ['-p', zip, 'manifest.json'], { encoding: 'utf8' }));
  assert.equal(manifest.version, info.version);
  assert.equal(manifest.version_name, info.versionName);
  const source = execFileSync('unzip', ['-p', zip, 'lib/build-info.js'], { encoding: 'utf8' });
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.equal(context.DominionLens.buildInfo.build, info.build);
  assert.equal(context.DominionLens.buildInfo.version, manifest.version);
  assert.equal(execFileSync('unzip', ['-p', zip, 'bridge.js'], { encoding: 'utf8' }), await readFile(path.join(dir, 'extension/bridge.js'), 'utf8'));
});
