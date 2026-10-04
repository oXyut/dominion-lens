import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const context = vm.createContext({});
for (const file of ['catalog', 'analysis', 'view']) vm.runInContext(readFileSync(new URL(`../extension/lib/${file}.js`, import.meta.url), 'utf8'), context);
const player = { complete: true, counts: { Copper: 7, Estate: 3 } };
const pile = (name, remaining = 10, extra = {}) => ({ name, cost: 3, remaining, ...extra });
function kingdom(supply, settings = {}, selected = player) {
  return context.DominionLens.Panel.prototype.kingdom.call({
    snapshot: { supply, metadata: {}, turn: 1 }, settings: { basic: false, budget: '', ...settings }
  }, selected);
}
const section = (html, label) => html.match(new RegExp(`<section aria-label="${label}">([\\s\\S]*?)</section>`))?.[1] || '';
const articles = html => [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map(match => match[1]);

test('kingdom separates empty supplies and never labels an empty supported card unevaluated', () => {
  const html = kingdom([pile('Village', 0), pile('Expansion', 0), pile('Smithy'), pile('Chapel')], { budget: 5 });
  const candidates = section(html, '購入候補'), empty = section(html, '空のサプライ');
  assert.match(candidates, /Smithy/);
  assert.match(candidates, /Chapel/);
  assert.doesNotMatch(candidates, /Village|Expansion|残り0枚/);
  assert.equal(articles(empty).length, 2);
  for (const row of articles(empty)) {
    assert.match(row, />空<\/span>/);
    assert.match(row, /残り0枚/);
    assert.match(row, /このサプライは空です。/);
    assert.doesNotMatch(row, /未評価|評価データはまだありません/);
  }
});
test('positive unsupported supplies remain unevaluated while restored supplies rejoin candidates', () => {
  const supply = [pile('Village', 1), pile('Expansion', 1)];
  const initial = kingdom(supply, { budget: 5 });
  assert.match(section(initial, '購入候補'), /Expansion[\s\S]*未評価/);
  for (let i = 0; i < 2; i++) {
    for (const p of supply) p.remaining = 0;
    assert.equal(articles(section(kingdom(supply), '購入候補')).length, 0);
    for (const p of supply) p.remaining = 1;
    assert.equal(kingdom(supply, { budget: 5 }), initial);
    assert.equal(section(initial, '空のサプライ'), '');
    const village = articles(initial).find(row => row.includes('Village'));
    assert.match(village, /\d\.\d \/ 10/);
    assert.doesNotMatch(village, /未評価|>空<\/span>/);
  }
});
test('empty sections respect budget and base filters and all-empty supplies explain the lack of candidates', () => {
  const supply = [pile('Village', 0), pile('Silver', 0, { base: true }), pile('Gold', 0, { cost: 6, base: true })];
  const html = kingdom(supply, { budget: 5 });
  assert.match(section(html, '購入候補'), /条件に合う購入候補がありません。/);
  assert.equal(articles(section(html, '空のサプライ')).length, 1);
  const withBase = section(kingdom(supply, { basic: true, budget: 5 }), '空のサプライ');
  assert.match(withBase, /Silver/);
  assert.doesNotMatch(withBase, /Gold/);
  assert.equal(articles(section(kingdom(supply, { basic: true }), '空のサプライ')).length, 3);
  assert.match(kingdom(supply, { budget: 0 }), /条件に合うカードがありません。/);
  assert.match(kingdom([]), /条件に合うカードがありません。/);
});
test('incomplete ownership still stops evaluations and does not show stale purchase or empty sections', () => {
  const html = kingdom([pile('Village', 0), pile('Smithy')], {}, { ...player, complete: false });
  assert.match(html, /所有カードを確定できないため/);
  assert.equal(articles(html).length, 0);
  assert.equal(section(html, '購入候補'), '');
  assert.equal(section(html, '空のサプライ'), '');
});
