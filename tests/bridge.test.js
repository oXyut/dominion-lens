import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const src = file => readFileSync(new URL(`../extension/${file}`, import.meta.url), 'utf8');
function fixture() {
  const output = [], listeners = new Map(); let interval;
  const types = { TREASURE: {}, VICTORY: {}, ACTION: {} };
  const card = (name, type, coin, base) => ({ name, types: [types[type]], cost: { coin, debt: 0, potion: 0 }, isBaseCard: () => base });
  const cards = { Copper: card('Copper', 'TREASURE', 0, true), Estate: card('Estate', 'VICTORY', 2, true), Village: card('Village', 'ACTION', 3, false) };
  const names = { STARTS_WITH: {}, GAIN: {}, TRASH: {}, PASS: {} };
  class SupplyZone { constructor(c) { this.pileName = c; this.cardStacks = [{ topCard: { cardName: c, cost: c.cost }, cards: Array(10).fill({ cardName: c }), anonymousCards: 0 }]; } }
  class CardMove { execute() { this.called = true; return 73; } }
  class PilesStatus { execute() { this.called = true; return 42; } }
  const discard = { index: 2, zoneName: 'DiscardZone', cardStacks: [] };
  const hand = { index: 0, zoneName: 'HandZone', cardStacks: [{ cards: Array(5).fill({ cardName: cards.Copper }), anonymousCards: 0 }] };
  const draw = { index: 1, zoneName: 'DrawZone', primaryStacks: [{ cards: [], anonymousCards: 5 }], cardStacks: [] };
  const state = { players: [{ index: 0, name: 'You', isMe: true, ownedZones: [hand, draw, discard] }], zones: [hand, draw, discard, new SupplyZone(cards.Village)], cardNames: Object.values(cards), activeTurn: { turnNumber: 1 }, cards: [{ cardName: cards.Copper }] };
  const game = { isRunning: () => true, state, displayedGameId: 900,
    animationDirector: { queueElements: [] }, logModel: { isRated: false, entries: [{ index: 0, name: names.STARTS_WITH, logArguments: [{ argument: 0 }, { argument: [{ cardName: cards.Copper, frequency: 7 }, { cardName: cards.Estate, frequency: 3 }] }] }] } };
  const window = { addEventListener: (name, fn) => listeners.set(name, fn), postMessage: msg => output.push(msg) };
  const context = vm.createContext({ window, location: { origin: 'https://dominion.games' }, document: { body: {} },
    angular: { element: () => ({ injector: () => ({ get: name => { assert.equal(name, 'game'); return game; } }) }) },
    CardNames: cards, LogEntryNames: names, Types: types, SupplyZone, CardMove, PilesStatus,
    JapaneseCardNames: { [cards.Copper]: { singular: '銅貨' } },
    setInterval: fn => { interval = fn; } });
  vm.runInContext(src('lib/zones.js'), context); vm.runInContext(src('lib/protocol.js'), context); vm.runInContext(src('bridge.js'), context);
  return { game, output, poll: () => interval(), context, cards, CardMove, PilesStatus, listeners, window };
}
test('adapter reads current typed logs and zones without double-counting draw stacks', () => {
  const f = fixture(), data = f.output.at(-1).data;
  assert.equal(data.status, 'ready'); assert.equal(data.logs[0].cards[0].name, 'Copper');
  assert.equal(f.context.DominionLens.validSnapshot(data), true);
  assert.equal(data.ownZones[0].zones.drawSize, 5);
  assert.equal(data.supply[0].name, 'Village'); assert.equal(data.supply[0].remaining, 10);
  assert.equal(data.metadata.Copper.types[0], 'TREASURE');
  f.poll(); assert.equal(f.output.length, 1, 'unchanged snapshots are not emitted repeatedly');
});
test('adapter and replay retain separate starting entries through trash and undo', () => {
  const f = fixture();
  vm.runInContext(src('lib/catalog.js'), f.context);
  vm.runInContext(src('lib/analysis.js'), f.context);
  const names = f.game.logModel.entries[0].name;
  const entry = (index, name, card, frequency) => ({ index, name, logArguments: [
    { argument: 0 }, { argument: [{ cardName: card, frequency }] }
  ] });
  f.game.logModel.entries = [entry(0, names, f.cards.Estate, 3), entry(1, names, f.cards.Copper, 7)];
  f.poll();
  const replay = () => {
    const data = f.output.at(-1).data;
    assert.equal(f.context.DominionLens.validSnapshot(data), true);
    return f.context.DominionLens.analysis.replay(data.players, data.logs)[0];
  };
  assert.equal(f.output.at(-1).data.logs.length, 2);
  assert.equal(replay().counts.Estate, 3);
  assert.equal(replay().counts.Copper, 7);
  assert.equal(f.context.DominionLens.analysis.metrics(replay().counts).money.expected, 3.5);
  f.game.logModel.entries.push(entry(2, f.context.LogEntryNames.TRASH, f.cards.Estate, 1));
  f.poll();
  assert.equal(replay().counts.Estate, 2);
  assert.equal(replay().complete, true);
  assert.equal(replay().issues.length, 0);
  // Repeated polling and a forced publication must not accumulate counts.
  f.poll();
  f.listeners.get('message')({ source: f.window, origin: 'https://dominion.games', data: { channel: 'dominion-lens:request:v1' } });
  assert.equal(replay().counts.Estate, 2);
  f.game.logModel.entries.pop(); f.poll();
  assert.equal(replay().counts.Estate, 3);
});
test('malformed metadata, zones, card counts and duplicate players are rejected', () => {
  const f = fixture(), valid = f.context.DominionLens.validSnapshot;
  const data = JSON.parse(JSON.stringify(f.output.at(-1).data));
  for (const mutate of [
    d => { d.metadata.Copper.types = 'TREASURE'; },
    d => { d.ownZones[0].zones.hand = null; },
    d => { d.logs[0].cards[0].count = -1; },
    d => { d.players.push({ ...d.players[0] }); },
    d => { d.supply[0].remaining = NaN; }
  ]) {
    const bad = structuredClone(data); mutate(bad); assert.equal(valid(bad), false);
  }
  assert.equal(valid({ status: 'waiting', message: 'Loading' }), true);
  assert.equal(valid({ status: 'ready' }), false);
});
test('movement observers preserve original results and track cleanup discards', () => {
  const f = fixture(), move = new f.CardMove();
  Object.assign(move, { fromZoneIndex: 0, toZoneIndex: 2, cardIds: [0], cardIdsAfterMoving: [-1] });
  assert.equal(move.execute(f.game), 73); assert.equal(move.called, true);
  f.poll(); assert.equal(f.output.at(-1).data.ownZones[0].discard.counts.Copper, 1);
  const status = new f.PilesStatus(); Object.assign(status, { discardIndex: 2, discardSize: 0 });
  assert.equal(status.execute(f.game), 42); f.poll();
  assert.equal(Object.keys(f.output.at(-1).data.ownZones[0].discard.counts).length, 0);
});
test('observer errors never block the game, and changed game state resets certainty', () => {
  const f = fixture(), move = new f.CardMove();
  assert.equal(move.execute(f.game), 73);
  f.game.state = { ...f.game.state, zones: f.game.state.zones.map(z => z.zoneName === 'DiscardZone' ? { ...z, cardStacks: [{ cards: [f.game.state.cards[0]], anonymousCards: 0 }] } : z) };
  f.poll(); assert.equal(f.output.at(-1).data.ownZones[0].discard.complete, false);
});
test('rated and idle states clear game information instead of exposing a stale deck', () => {
  const f = fixture(); f.game.logModel.isRated = true; f.poll();
  assert.equal(f.output.at(-1).data.status, 'rated');
  assert.equal(f.output.at(-1).data.logs, undefined);
  f.game.isRunning = () => false; f.poll();
  assert.equal(f.output.at(-1).data.status, 'waiting');
  assert.equal(f.output.at(-1).data.players, undefined);
});
test('animations delay snapshots and only same-window requests trigger publishing', () => {
  const f = fixture(); f.game.animationDirector.queueElements.push({}); f.poll(); assert.equal(f.output.length, 1);
  f.game.animationDirector.queueElements = [];
  const request = f.listeners.get('message');
  request({ source: {}, origin: 'https://dominion.games', data: { channel: 'dominion-lens:request:v1' } }); assert.equal(f.output.length, 1);
  request({ source: f.window, origin: 'https://evil.example', data: { channel: 'dominion-lens:request:v1' } }); assert.equal(f.output.length, 1);
  request({ source: f.window, origin: 'https://dominion.games', data: { channel: 'dominion-lens:request:v1' } }); assert.equal(f.output.length, 2);
});
