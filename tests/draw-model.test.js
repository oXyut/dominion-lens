import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const context = vm.createContext({});
for (const file of ['catalog', 'analysis', 'view']) vm.runInContext(readFileSync(new URL(`../extension/lib/${file}.js`, import.meta.url), 'utf8'), context);
const { analysis: a, Panel } = context.DominionLens;
const plain = value => JSON.parse(JSON.stringify(value));
const fixture = () => ({
  player: { complete: true, isMe: true, counts: { Copper: 9, Chapel: 1, Gold: 1, Smithy: 1, Province: 1 } },
  own: {
    zones: { complete: true, hand: { Gold: 1 }, play: { Smithy: 1 }, aside: { Province: 1 }, drawSize: 2 },
    discard: { complete: true, counts: { Copper: 7, Chapel: 1 }, expected: 8 }
  }
});
const render = (player, own, draws = 5, zone = 'draw') => Panel.prototype.deck.call({
  snapshot: { metadata: {} }, settings: { zone, draws }
}, player, own);
const cardRow = (html, name) => html.split('<div class="card-row">').find(row => row.includes(`<small>${name}</small>`));

test('two-stage draw uses 3 of 8 discard cards after exhausting a two-card draw pile', () => {
  assert.equal(a.drawProbabilityAfterShuffle(2, 0, 8, 1, 5), .375);
  assert.equal(a.drawProbabilityAfterShuffle(2, 1, 8, 0, 2), 1);
  assert.equal(a.drawProbabilityAfterShuffle(2, 1, 8, 1, 5), 1);
  assert.equal(a.drawProbabilityAfterShuffle(2, 0, 8, 1, 2), 0);
});

test('draws within the current pile preserve every ordinary draw probability', () => {
  for (let total = 0; total <= 12; total++) for (let copies = 0; copies <= total; copies++) {
    for (let draws = 0; draws <= total; draws++) {
      assert.equal(a.drawProbabilityAfterShuffle(total, copies, 8, 1, draws), a.drawProbability(total, copies, draws));
    }
  }
});

test('discard probabilities match exhaustive equally likely subsets', () => {
  for (let total = 1; total <= 6; total++) for (let copies = 0; copies <= total; copies++) {
    for (let draws = 0; draws <= total; draws++) {
      const subsets = Array.from({ length: 2 ** total }, (_, mask) => mask)
        .filter(mask => mask.toString(2).replaceAll('0', '').length === draws);
      const hits = subsets.filter(mask => mask & (2 ** copies - 1)).length;
      const probability = a.drawProbabilityAfterShuffle(2, 0, total, copies, 2 + draws);
      assert.ok(Math.abs(probability - hits / subsets.length) < 1e-12);
    }
  }
});

test('empty piles, capped draws, absent targets and malformed counts have explicit results', () => {
  assert.equal(a.drawProbabilityAfterShuffle(0, 0, 8, 1, 3), .375);
  assert.equal(a.drawProbabilityAfterShuffle(2, 0, 0, 0, 5), 0);
  assert.equal(a.drawProbabilityAfterShuffle(0, 0, 0, 0, 5), 0);
  assert.equal(a.drawProbabilityAfterShuffle(2, 0, 8, 1, 20), 1);
  assert.equal(a.drawProbabilityAfterShuffle(2, 0, 8, 0, 20), 0);
  assert.equal(a.drawProbabilityAfterShuffle(2, 1, 8, 1, 0), 0);
  for (const args of [[2, 3, 8, 1, 5], [2, 0, 8, 9, 5], [2, 0, 8, 1, -1], [2, 0, 8, 1, 1.5], [2, 0, NaN, 1, 5]]) {
    assert.equal(a.drawProbabilityAfterShuffle(...args), null);
  }
});

test('model includes only current draw and discard cards and never mutates a snapshot', () => {
  const { player, own } = fixture(), before = structuredClone({ player, own });
  const model = a.deriveDrawModel(player, own, 5);
  assert.deepEqual(plain(model.counts), { Copper: 9, Chapel: 1 });
  assert.deepEqual(plain(model.draw), { Copper: 2 });
  assert.equal(model.fromDraw, 2); assert.equal(model.fromDiscard, 3);
  assert.equal(model.reshuffle, true);
  assert.deepEqual(plain(a.deriveDrawModel(player, own, 2).counts), { Copper: 2 });
  assert.equal(a.deriveDrawModel(player, own, 2).reshuffle, false);
  assert.equal(a.deriveDrawModel(player, own, 20).fromDiscard, 8);
  assert.deepEqual({ player, own }, before);
});

test('uncertain ownership or zones and opponent private zones cannot produce a model', () => {
  const { player, own } = fixture();
  for (const mutate of [
    f => { f.player.complete = false; },
    f => { f.player.isMe = false; },
    f => { f.own.discard.complete = false; },
    f => { f.own.zones.complete = false; },
    f => { f.own.zones.drawSize = 3; },
    f => { f.own.zones.hand.Copper = 10; }
  ]) {
    const f = structuredClone({ player, own }); mutate(f);
    assert.equal(a.deriveDrawModel(f.player, f.own, 5), null);
    assert.equal(a.deriveDrawModel(f.player, f.own, 1), null);
  }
  assert.equal(a.deriveDrawModel(player, undefined, 5), null);
  assert.equal(a.deriveDrawModel(player, own, -1), null);
});

test('each snapshot rebuilds the model after gain, shuffle, undo and repeated updates', () => {
  const { player, own } = fixture(), original = structuredClone({ player, own });
  const probability = () => {
    const model = a.deriveDrawModel(player, own, 5);
    return a.drawProbabilityAfterShuffle(model.drawSize, model.draw.Chapel || 0, model.discardSize, model.discard.Chapel || 0, 5);
  };
  assert.equal(probability(), .375);
  player.counts.Chapel++; own.discard.counts.Chapel++; own.discard.expected++;
  assert.ok(Math.abs(probability() - 7 / 12) < 1e-12);
  own.zones.drawSize = 11; own.discard = { complete: true, counts: {}, expected: 0 };
  assert.equal(a.deriveDrawModel(player, own, 5).reshuffle, false);
  assert.equal(probability(), a.drawProbability(11, 2, 5));
  Object.assign(player, original.player); Object.assign(own, original.own);
  for (let i = 0; i < 3; i++) assert.equal(probability(), .375);
});

test('draw view shows discard-only candidates, exact stage sizes and excluded outside cards', () => {
  const { player, own } = fixture(), html = render(player, own);
  assert.match(html, /山札2枚＋捨て札8枚/);
  assert.match(html, /山札→捨て札シャッフル/);
  assert.match(html, /捨て札8枚から3枚（計5枚）/);
  assert.match(cardRow(html, 'Chapel'), /37\.5%/);
  assert.match(cardRow(html, 'Copper'), /100\.0%/);
  for (const name of ['Gold', 'Smithy', 'Province']) assert.equal(cardRow(html, name), undefined);
  const smaller = render(player, own, 2);
  assert.match(smaller, /山札のみ/);
  assert.equal(cardRow(smaller, 'Chapel'), undefined);
  assert.match(render(player, own, 20), /計10枚/);
  assert.match(render(player, own, 20), /引ける枚数までで計算/);
});

test('view states disclose unavailable models without rendering private or uncertain probabilities', () => {
  const { player, own } = fixture();
  const uncertain = render(player, { ...own, discard: { ...own.discard, complete: false } });
  assert.match(uncertain, /山札と捨て札の確定した内訳が必要/);
  assert.match(uncertain, /「所有全体」では/);
  assert.equal(cardRow(uncertain, 'Chapel'), undefined);
  const opponent = render({ ...player, isMe: false }, own);
  assert.match(opponent, /相手の山札・捨て札の内訳は表示しません/);
  assert.equal(cardRow(opponent, 'Chapel'), undefined);
  assert.equal(cardRow(render({ ...player, isMe: false }, own, 5, 'discard'), 'Chapel'), undefined);
  const incomplete = render({ ...player, complete: false }, own);
  assert.doesNotMatch(incomplete, /「所有全体」では/);
  const empty = render({ ...player, counts: {} }, { zones: { complete: true, hand: {}, play: {}, aside: {}, drawSize: 0 }, discard: { complete: true, counts: {} } });
  assert.match(empty, /計0枚/);
  assert.match(empty, /この領域にカードはありません/);
});
