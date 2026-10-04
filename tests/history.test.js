import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { historyFixture } from './helpers/history-fixture.mjs';

function runtime(storage, now) {
  const context = vm.createContext({ TextEncoder, structuredClone });
  for (const file of ['protocol', 'history']) vm.runInContext(readFileSync(new URL(`../extension/lib/${file}.js`, import.meta.url), 'utf8'), context);
  return { history: context.DominionLens.history, store: new context.DominionLens.history.HistoryStore(storage, now) };
}
function memoryStorage() {
  return { data: {}, writes: 0, failRead: false, failWrite: false,
    async get() { if (this.failRead) throw Error('read'); return structuredClone(this.data); },
    async set(value) { if (this.failWrite) throw Error('quota'); this.data = structuredClone(value); this.writes++; }
  };
}
const plain = value => JSON.parse(JSON.stringify(value));
const save = (store, snapshot = historyFixture()) => store.run({ type: 'record', snapshot });

test('history defaults off and survives a fresh worker with same game deduplication and undo replacement', async () => {
  const storage = memoryStorage(); let now = 1000;
  let { store } = runtime(storage, () => now++);
  assert.equal((await store.run({ type: 'read' })).state.enabled, false);
  assert.equal((await save(store)).status.code, 'disabled');
  assert.equal(storage.writes, 0);
  await store.run({ type: 'enabled', enabled: true });
  const first = await save(store); assert.equal(first.status.code, 'saved');
  const createdAt = first.state.records[0].createdAt;
  const writes = storage.writes;
  await save(store); assert.equal(storage.writes, writes, 'same public snapshot must not write or duplicate');
  ({ store } = runtime(storage, () => now++)); // Models worker/browser restart.
  await save(store); assert.equal(storage.writes, writes);
  const undone = historyFixture(); undone.logs = undone.logs.slice(0, -2); undone.turn = 1;
  const result = await save(store, undone);
  assert.equal(result.state.records.length, 1);
  assert.equal(result.state.records[0].createdAt, createdAt);
  assert.deepEqual(plain(result.state.records[0].logs), undone.logs);
  assert.ok(result.state.records[0].updatedAt > createdAt);
  await save(store, historyFixture('sample-match-2'));
  assert.equal((await store.run({ type: 'read' })).state.records.length, 2);
});

test('record allowlist drops zones, raw arguments, arbitrary metadata and authentication fields', async () => {
  const storage = memoryStorage(), { store } = runtime(storage);
  const snapshot = historyFixture();
  snapshot.secret = 'DO_NOT_PERSIST'; snapshot.authToken = 'DO_NOT_PERSIST';
  snapshot.players[0].token = 'DO_NOT_PERSIST'; snapshot.metadata.Copper.private = 'DO_NOT_PERSIST';
  snapshot.logs[0].logArguments = ['DO_NOT_PERSIST']; snapshot.logs[0].cards[0].secret = 'DO_NOT_PERSIST';
  snapshot.ownZones = [{ index: 0, zones: { complete: true, hand: { HiddenOwnCard: 1 }, play: {}, aside: {}, drawSize: 5 }, discard: { complete: true, counts: {}, expected: 0 } }];
  await store.run({ type: 'enabled', enabled: true }); await save(store, snapshot);
  const json = JSON.stringify(storage.data);
  assert.doesNotMatch(json, /DO_NOT_PERSIST|HiddenOwnCard|ownZones|authToken|logArguments/);
  assert.match(json, /Sample A|sample-match-1|銅貨/);
  assert.equal(storage.data.lensHistory.records[0].partial, false);
  snapshot.logs = snapshot.logs.filter(e => e.type !== 'STARTS_WITH');
  assert.equal((await save(store, snapshot)).state.records[0].partial, true);
});

test('single and all deletion fence in-flight writes and never revive after reconnect/restart', async () => {
  const storage = memoryStorage(), { store } = runtime(storage);
  await store.run({ type: 'enabled', enabled: true });
  await store.run({ type: 'delete', gameId: 'already-evicted' });
  assert.equal((await save(store, historyFixture('already-evicted'))).status.code, 'deleted', 'deletion from a stale tab still prevents revival');
  await Promise.all([save(store), store.run({ type: 'delete', gameId: 'sample-match-1' }), save(store)]);
  assert.equal(storage.data.lensHistory.records.length, 0);
  let fresh = runtime(storage).store;
  assert.equal((await save(fresh)).status.code, 'deleted');
  await save(fresh, historyFixture('sample-match-2'));
  await save(fresh, historyFixture('sample-match-3'));
  await Promise.all([fresh.run({ type: 'delete', all: true }), save(fresh, historyFixture('sample-match-2'))]);
  fresh = runtime(storage).store;
  assert.equal((await save(fresh, historyFixture('sample-match-3'))).status.code, 'deleted');
  assert.equal(storage.data.lensHistory.records.length, 0);
  assert.equal((await save(fresh, historyFixture('sample-match-4'))).status.code, 'saved');
  await Promise.all([fresh.run({ type: 'enabled', enabled: false }), save(fresh, historyFixture('sample-match-5'))]);
  assert.equal(storage.data.lensHistory.records.length, 1);
  assert.equal((await save(runtime(storage).store, historyFixture('sample-match-6'))).status.code, 'disabled');
});

test('storage read/write/quota failures retain acknowledged data and never report saved', async () => {
  const storage = memoryStorage(), { store } = runtime(storage);
  await store.run({ type: 'enabled', enabled: true }); await save(store);
  const before = structuredClone(storage.data);
  storage.failWrite = true;
  for (const action of [{ type: 'record', snapshot: historyFixture('other') }, { type: 'delete', all: true }, { type: 'enabled', enabled: false }]) {
    const result = await store.run(action);
    assert.equal(result.status.code, 'error'); assert.match(result.status.message, /未保存/);
    assert.deepEqual(storage.data, before);
  }
  storage.failRead = true;
  assert.equal((await save(store)).state, null);
  storage.failRead = false; storage.failWrite = false;
  assert.equal((await save(store, historyFixture('other'))).status.code, 'saved');
});

test('record count/byte limits evict oldest records, but an oversized update is rejected atomically', async () => {
  const storage = memoryStorage(); let clock = 1;
  const { store, history } = runtime(storage, () => clock++);
  await store.run({ type: 'enabled', enabled: true });
  for (let i = 0; i < 31; i++) await save(store, historyFixture(`sample-${i}`));
  assert.equal(storage.data.lensHistory.records.length, 30);
  assert.equal(storage.data.lensHistory.records.some(r => r.gameId === 'sample-0'), false);
  const large = historyFixture('large');
  large.logs = Array.from({ length: 7000 }, (_, index) => ({ index, type: 'GAIN', turn: 1, player: 0, toPlayer: null, cards: [{ name: 'X'.repeat(180), count: 1 }] }));
  const withinLimit = await save(store, large);
  assert.equal(withinLimit.status.code, 'saved'); assert.match(withinLimit.status.message, /古い履歴/);
  assert.ok(new TextEncoder().encode(JSON.stringify(storage.data.lensHistory)).length <= history.limits.bytes);
  const byteEviction = await save(store, { ...large, gameId: 'large-2' });
  assert.equal(byteEviction.status.code, 'saved');
  assert.equal(byteEviction.state.records.length, 1, 'two individually valid large records exceed the total byte limit');
  assert.equal(byteEviction.state.records[0].gameId, 'large-2');
  assert.match(byteEviction.status.message, /古い履歴/);
  const before = structuredClone(storage.data);
  large.logs = Array.from({ length: 10000 }, (_, index) => ({ ...large.logs[0], index }));
  assert.equal((await save(store, large)).status.code, 'error');
  assert.deepEqual(storage.data, before, 'failed oversize update must not evict acknowledged records');
});

test('malformed snapshots, rated games and corrupt stored history are rejected without overwriting', async () => {
  const storage = memoryStorage(), { store } = runtime(storage);
  await store.run({ type: 'enabled', enabled: true });
  for (const mutate of [s => s.gameId = '', s => s.gameId = '-1', s => s.logs[0].type = 'LOOK_AT', s => s.logs[0].turn = -1, s => s.logs.push(s.logs[0])]) {
    const snapshot = historyFixture(); mutate(snapshot);
    assert.equal((await save(store, snapshot)).status.code, 'error');
  }
  assert.equal((await save(store, { status: 'rated', message: 'sample' })).status.code, 'error');
  await save(store);
  const valid = structuredClone(storage.data);
  for (const mutate of [s => s.records = [null], s => s.records[0].players = [null], s => s.records[0].logs = [null], s => s.records[0].labels = null, s => s.deletedIds = [null], s => s.version = 0]) {
    storage.data = structuredClone(valid); mutate(storage.data.lensHistory);
    const before = structuredClone(storage.data);
    assert.equal((await runtime(storage).store.run({ type: 'read' })).status.code, 'error');
    assert.deepEqual(storage.data, before);
  }
});
