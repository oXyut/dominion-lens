import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const context = vm.createContext({});
for (const file of ['catalog', 'analysis', 'zones']) vm.runInContext(readFileSync(new URL(`../extension/lib/${file}.js`, import.meta.url), 'utf8'), context);
const { analysis: a, DiscardTracker } = context.DominionLens;
const plain = x => JSON.parse(JSON.stringify(x));
const players = [{ index: 0, isMe: true }, { index: 1, isMe: false }];
const event = (index, type, player, name, count = 1, extra = {}) => ({ index, type, player, cards: [{ name, count }], ...extra });
const start = index => ({ index, type: 'STARTS_WITH', player: index, cards: [{ name: 'Copper', count: 7 }, { name: 'Estate', count: 3 }] });

test('opening hand has exactly 3.5 expected coins and 1/12 chance of 5 coins', () => {
  const result = a.moneyDistribution({ Copper: 7, Estate: 3 }, 5);
  assert.equal(result.expected, 3.5);
  assert.ok(Math.abs(result.p5 - 1 / 12) < 1e-12);
  assert.equal(result.p8, 0);
  assert.ok(Math.abs(result.distribution.reduce((s, d) => s + d.probability, 0) - 1) < 1e-12);
  assert.ok(Math.abs(result.distribution.reduce((s, d) => s + d.probability * d.money, 0) - 3.5) < 1e-12);
});
test('money model correctly weights mixed treasures, and handles a small deck', () => {
  const r = a.moneyDistribution({ Silver: 2, Gold: 2, Estate: 1 }, 5);
  assert.equal(r.expected, 10); assert.equal(r.p8, 1);
  assert.deepEqual(plain(r.distribution), [{ money: 10, probability: 1 }]);
  assert.equal(a.moneyDistribution({ Gold: 1 }, 5).expected, 3);
  assert.equal(a.moneyDistribution({}, 5).expected, 0);
});
test('unknown treasures produce an explicit lower bound', () => {
  const r = a.moneyDistribution({ Copper: 1, FoolGold: 1 }, 2, { FoolGold: { types: ['TREASURE'] } });
  assert.equal(r.unknown, 1); assert.equal(r.expected, 1);
});
test('action proportions count copies and distinguish deck and action denominators', () => {
  const r = a.metrics({ Copper: 5, Silver: 3, Gold: 1, Estate: 1, Chapel: 1, Village: 2, Smithy: 2, Market: 1, Sentry: 1, Province: 1 }).actionComposition;
  assert.equal(r.total, 18); assert.equal(r.actions, 7);
  assert.deepEqual(plain(r.terminal), { count: 3, deckRatio: 3 / 18, actionRatio: 3 / 7 });
  assert.deepEqual(plain(r.combo), { count: 4, deckRatio: 4 / 18, actionRatio: 4 / 7 });
  assert.equal(r.unknown.count, 0);
});
test('unsupported actions remain unclassified and stay in both denominators', () => {
  const r = a.actionComposition({ Copper: 4, Smithy: 1, Village: 2, ExpansionAction: 3 }, {
    ExpansionAction: { types: ['ACTION', 'REACTION'], actions: 1, actionRole: 'combo' }
  });
  assert.equal(r.total, 10); assert.equal(r.actions, 6);
  assert.deepEqual(plain(r.terminal), { count: 1, deckRatio: .1, actionRatio: 1 / 6 });
  assert.deepEqual(plain(r.combo), { count: 2, deckRatio: .2, actionRatio: 2 / 6 });
  assert.deepEqual(plain(r.unknown), { count: 3, deckRatio: .3, actionRatio: .5 });
});
test('zero actions and an empty deck have no artificial action percentage', () => {
  const r = a.actionComposition({ Copper: 7, Estate: 3 });
  assert.equal(r.actions, 0);
  for (const role of ['terminal', 'combo', 'unknown']) {
    assert.equal(r[role].count, 0); assert.equal(r[role].deckRatio, 0); assert.equal(r[role].actionRatio, null);
    assert.equal(a.actionComposition({})[role].deckRatio, null);
  }
});
test('printed plus actions classify base cards without conditional play assumptions', () => {
  const card = context.DominionLens.card;
  for (const name of ['Cellar', 'Harbinger', 'Merchant', 'Village', 'Poacher', 'Festival', 'Laboratory', 'Market', 'Sentry']) assert.equal(card(name).actionRole, 'combo', name);
  for (const name of ['Chapel', 'Moat', 'Vassal', 'Workshop', 'Bureaucrat', 'Militia', 'Moneylender', 'Remodel', 'Smithy', 'Throne Room', 'Bandit', 'Council Room', 'Library', 'Mine', 'Witch', 'Artisan']) assert.equal(card(name).actionRole, 'terminal', name);
  assert.equal(card('Gardens').actionRole, null);
  assert.equal(a.actionComposition({ Gardens: 3, Copper: 4 }).actions, 0);
});
test('hypergeometric draw probability respects limits and invalid inputs', () => {
  assert.equal(a.drawProbability(10, 1, 5), .5);
  assert.ok(Math.abs(a.drawProbability(10, 2, 5) - 7 / 9) < 1e-12);
  assert.equal(a.drawProbability(10, 1, 20), 1);
  assert.equal(a.drawProbability(0, 0, 5), 0);
  assert.equal(a.drawProbability(10, 11, 5), null);
  assert.equal(a.drawProbability(10, 1, -5), null);
});
test('replay counts purchases once, trash, exchanges, return and pass', () => {
  const result = a.replay(players, [start(0), start(1), event(2, 'BUY', 0, 'Silver'), event(3, 'GAIN', 0, 'Silver'), event(4, 'TRASH', 0, 'Copper', 2), event(5, 'EXCHANGE_RETURN', 0, 'Estate'), event(6, 'EXCHANGE_RECEIVE', 0, 'Duchy'), event(7, 'PASS', 0, 'Silver', 1, { toPlayer: 1 }), event(8, 'RETURN_TO', 0, 'Duchy')]);
  assert.deepEqual(plain(result[0].counts), { Copper: 5, Estate: 2 });
  assert.deepEqual(plain(result[1].counts), { Copper: 7, Estate: 3, Silver: 1 });
  assert.equal(result[0].complete, true);
});
test('split starting-card entries accumulate for every player before gains and trash', () => {
  const threePlayers = [...players, { index: 2, isMe: false }];
  const logs = [
    event(0, 'STARTS_WITH', 0, 'Estate', 3),
    event(1, 'STARTS_WITH', 1, 'Copper', 7),
    event(2, 'STARTS_WITH', 2, 'Estate', 3),
    event(3, 'STARTS_WITH', 0, 'Copper', 7),
    event(4, 'STARTS_WITH', 1, 'Estate', 3),
    event(5, 'STARTS_WITH', 2, 'Copper', 7)
  ];
  const initial = a.replay(threePlayers, [...logs].reverse());
  for (const p of initial) {
    assert.deepEqual(plain(p.counts), p.index === 1 ? { Copper: 7, Estate: 3 } : { Estate: 3, Copper: 7 });
    assert.equal(p.complete, true);
    assert.equal(a.size(p.counts), 10);
    assert.equal(a.metrics(p.counts).money.expected, 3.5);
  }
  logs.push(event(6, 'BUY_AND_GAIN', 0, 'Silver'), event(7, 'TRASH', 0, 'Estate'),
    event(8, 'TRASH', 1, 'Estate'), event(9, 'TRASH', 2, 'Copper', 2));
  const result = a.replay(threePlayers, logs);
  assert.deepEqual(plain(result[0].counts), { Estate: 2, Copper: 7, Silver: 1 });
  assert.deepEqual(plain(result[1].counts), { Copper: 7, Estate: 2 });
  assert.deepEqual(plain(result[2].counts), { Estate: 3, Copper: 5 });
  for (const p of result) { assert.equal(p.complete, true); assert.deepEqual(plain(p.issues), []); }
  // Full replay remains stateless across polling, undo and the next game.
  assert.deepEqual(plain(a.replay(threePlayers, logs)), plain(result));
  assert.equal(a.replay(threePlayers, logs.slice(0, 6))[0].counts.Silver, undefined);
  assert.deepEqual(plain(a.replay(players, [start(0)])[0].counts), { Copper: 7, Estate: 3 });
});
test('split starts support nonstandard decks and do not suppress impossible-loss warnings', () => {
  const logs = [event(0, 'STARTS_WITH', 0, 'Estate', 3), event(1, 'STARTS_WITH', 0, 'Copper', 4),
    event(2, 'STARTS_WITH', 0, 'Necropolis'), event(3, 'STARTS_WITH', 0, 'Overgrown Estate'),
    event(4, 'STARTS_WITH', 0, 'Hovel')];
  const p = a.replay(players, logs)[0];
  assert.deepEqual(plain(p.counts), { Estate: 3, Copper: 4, Necropolis: 1, 'Overgrown Estate': 1, Hovel: 1 });
  assert.equal(p.complete, true);
  const bad = a.replay(players, [...logs, event(5, 'TRASH', 0, 'Gold'), event(6, 'STARTS_WITH', 0, 'Silver')])[0];
  assert.equal(bad.complete, false);
  assert.equal(bad.issues.length, 1);
  assert.equal(bad.counts.Estate, 3);
});
test('undo and a new game discard removed gains instead of double counting', () => {
  const logs = [start(0), event(1, 'GAIN', 0, 'Gold')];
  assert.equal(a.replay(players, logs)[0].counts.Gold, 1);
  logs.pop();
  assert.equal(a.replay(players, logs)[0].counts.Gold, undefined);
  assert.equal(a.replay(players, [start(0)])[0].counts.Gold, undefined);
});
test('missing starts and impossible losses are never declared complete', () => {
  assert.equal(a.replay(players, [event(1, 'GAIN', 0, 'Gold')])[0].complete, false);
  assert.equal(a.replay(players, [start(0), event(1, 'TRASH', 0, 'Gold')])[0].complete, false);
});
test('derive current draw pile only when all outside zones reconcile', () => {
  const player = { complete: true, isMe: true, counts: { Copper: 7, Estate: 3 } };
  const own = { zones: { complete: true, hand: { Copper: 4, Estate: 1 }, play: {}, aside: {}, drawSize: 5 }, discard: { complete: true, counts: {} } };
  assert.deepEqual(plain(a.deriveDraw(player, own)), { Copper: 3, Estate: 2 });
  own.discard.complete = false; assert.equal(a.deriveDraw(player, own), null);
  own.discard.complete = true; own.zones.drawSize = 6; assert.equal(a.deriveDraw(player, own), null);
  assert.equal(a.deriveDraw({ ...player, isMe: false }, own), null);
});
test('recommendations react to curse exhaustion, village need and late victory', () => {
  const supply = ['Witch', 'Village', 'Duchy', 'Province', 'Curse', 'Moneylender'].map(name => ({ name, remaining: 10 }));
  const base = a.recommendations(supply, { Copper: 5, Estate: 3, Smithy: 2 });
  const score = (recs, name) => recs.find(r => r.name === name).score;
  assert.ok(score(base, 'Village') > score(a.recommendations(supply, { Copper: 7, Estate: 3 }), 'Village'));
  supply.find(p => p.name === 'Curse').remaining = 0;
  assert.ok(score(a.recommendations(supply, { Copper: 5, Estate: 3 }), 'Witch') < score(base, 'Witch'));
  supply.find(p => p.name === 'Province').remaining = 3;
  assert.ok(score(a.recommendations(supply, { Copper: 5, Estate: 3 }), 'Duchy') > score(base, 'Duchy'));
  assert.ok(score(a.recommendations(supply, { Gold: 5 }), 'Moneylender') < score(base, 'Moneylender'));
  assert.equal(a.recommendations([{ name: 'Unknown', remaining: 10 }], {})[0].score, null);
});
test('empty supplies keep evaluation support separate from availability', () => {
  const recs = a.recommendations([{ name: 'Village', remaining: 0 }, { name: 'Expansion', remaining: 0 }], { Copper: 7, Estate: 3 });
  for (const rec of recs) {
    assert.equal(rec.availability, 'empty');
    assert.equal(rec.score, null);
    assert.deepEqual(plain(rec.reasons), ['このサプライは空です。']);
  }
  assert.equal(recs.find(r => r.name === 'Village').evaluation, 'supported');
  assert.equal(recs.find(r => r.name === 'Expansion').evaluation, 'unsupported');
});
test('restoring supply counts restores scored and unsupported recommendations without stale state', () => {
  const supply = [{ name: 'Village', remaining: 1 }, { name: 'Expansion', remaining: 1 }];
  const counts = { Copper: 7, Estate: 3 }, initial = plain(a.recommendations(supply, counts));
  for (let i = 0; i < 2; i++) {
    for (const pile of supply) pile.remaining = 0;
    assert.ok(a.recommendations(supply, counts).every(r => r.availability === 'empty'));
    for (const pile of supply) pile.remaining = 1;
    const restored = a.recommendations(supply, counts);
    assert.deepEqual(plain(restored), initial);
    assert.equal(restored.find(r => r.name === 'Village').availability, 'available');
    assert.equal(typeof restored.find(r => r.name === 'Village').score, 'number');
    const unsupported = restored.find(r => r.name === 'Expansion');
    assert.equal(unsupported.evaluation, 'unsupported');
    assert.deepEqual(plain(unsupported.reasons), ['このカードの評価データはまだありません。']);
  }
});
test('discard observer handles known/unknown moves, reshuffle, and a state reset', () => {
  const tracker = new DiscardTracker();
  const state = { zones: [{ index: 2, zoneName: 'DiscardZone', cardStacks: [] }] };
  tracker.begin(state); tracker.move(1, 2, ['Silver', 'Copper']); tracker.status(2, 2);
  assert.deepEqual(plain(tracker.get(2).counts), { Silver: 1, Copper: 1 });
  assert.equal(tracker.get(2).complete, true);
  tracker.move(2, 3, [null]); assert.equal(tracker.get(2).complete, false);
  tracker.status(2, 0); assert.equal(tracker.get(2).complete, true);
  assert.deepEqual(plain(tracker.get(2).counts), {});
  tracker.begin({ zones: [{ index: 2, zoneName: 'DiscardZone', cardStacks: [{ cards: [{}], anonymousCards: 0 }] }] });
  assert.equal(tracker.get(2).complete, false);
});
