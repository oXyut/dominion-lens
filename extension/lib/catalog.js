/* Card facts and independently authored coaching heuristics. No remote dependency. */
(() => {
  "use strict";
  const ns = globalThis.DominionLens ||= {};
  const cards = Object.create(null);
  function add(name, ja, cost, types, details = {}) {
    cards[name] = Object.freeze({ name, ja, cost, types, base: false, ...details });
  }
  const T = ["TREASURE"], V = ["VICTORY"], A = ["ACTION"];
  add("Copper", "銅貨", 0, T, { base: true, money: 1 });
  add("Silver", "銀貨", 3, T, { base: true, money: 2, score: 6, tags: ["money"], tip: "アクションを消費せず、手札の金量を増やせます。" });
  add("Gold", "金貨", 6, T, { base: true, money: 3, score: 7, tags: ["money"], tip: "財宝中心のデッキで属州に届きやすくなります。" });
  add("Platinum", "白金貨", 9, T, { base: true, money: 5, score: 8, tags: ["money"], tip: "植民地を買うための金量を増やせます。" });
  add("Estate", "屋敷", 2, V, { base: true, vp: 1 });
  add("Duchy", "公領", 5, V, { base: true, vp: 3, score: 2, tags: ["victory"], tip: "終盤の点数確保に向きます。序盤は手札の出力が落ちます。" });
  add("Province", "属州", 8, V, { base: true, vp: 6, score: 7, tags: ["victory"], tip: "6点を確保できます。残り枚数とゲーム終了の時期を見て買います。" });
  add("Colony", "植民地", 11, V, { base: true, vp: 10, score: 8, tags: ["victory"], tip: "10点を確保できる終盤の主要な購入先です。" });
  add("Curse", "呪い", 0, ["CURSE"], { base: true, vp: -1 });
  const definitions = [
    ["Cellar", "地下貯蔵庫", 2, 5, ["cycling", "cantrip"], "屋敷や呪いが多い手札を交換できます。デッキの枚数は減らせません。", { actions: 1 }],
    ["Chapel", "礼拝堂", 2, 9, ["trash", "terminal"], "不要なカードを最大4枚廃棄できます。序盤に圧縮すると後の手札が強くなります。"],
    ["Moat", "堀", 2, 5, ["draw", "reaction", "terminal"], "2枚引けます。手札にあればアタックを防ぐ選択肢になります。", { draw: 2 }],
    ["Harbinger", "前駆者", 3, 5, ["cantrip", "topdeck"], "捨て札から次に引きたいカードを山札に戻せます。", { draw: 1, actions: 1 }],
    ["Merchant", "商人", 3, 6, ["cantrip", "silver"], "銀貨と同じターンに使うと金量を増やせます。", { draw: 1, actions: 1 }],
    ["Vassal", "家臣", 3, 5, ["money", "terminal"], "2金を出し、山札の一番上がアクションなら使える場合があります。"],
    ["Village", "村", 3, 6, ["village", "cantrip"], "アクション回数を増やし、鍛冶屋などを同じターンに使いやすくします。", { draw: 1, actions: 2 }],
    ["Workshop", "工房", 3, 5, ["gain", "terminal"], "4金以下のカードを獲得できます。王国に良い獲得先があると役立ちます。"],
    ["Bureaucrat", "役人", 4, 4, ["attack", "gain", "terminal"], "銀貨を山札に獲得します。ドローが少ない場では勝利点を戻すアタックも役立ちます。"],
    ["Gardens", "庭園", 4, 4, ["victory", "gardens"], "所有カード10枚ごとに1点です。獲得でデッキを大きくする方針と相性があります。", { victory: true }],
    ["Militia", "民兵", 4, 7, ["attack", "money", "terminal"], "2金を出しながら相手の手札を3枚に減らせます。"],
    ["Moneylender", "金貸し", 4, 6, ["trash", "copper", "terminal"], "銅貨を廃棄して3金に変えられます。銅貨が減ると使う機会も減ります。"],
    ["Poacher", "密猟者", 4, 6, ["cantrip", "money"], "カード・アクション・金量を増やせます。空のサプライが増えると手札を捨てます。", { draw: 1, actions: 1 }],
    ["Remodel", "改築", 4, 6, ["trash", "gain", "terminal"], "不要なカードを廃棄し、2金高いカードまで獲得できます。"],
    ["Smithy", "鍛冶屋", 4, 7, ["draw", "terminal"], "3枚引けます。村系カードがあれば複数のアクションを使うデッキを組めます。", { draw: 3 }],
    ["Throne Room", "玉座の間", 4, 6, ["multiplier", "terminal"], "手札のアクション1枚を2回使います。強い対象と一緒に引く必要があります。"],
    ["Bandit", "山賊", 5, 6, ["attack", "gain", "terminal"], "金貨を獲得できます。相手の銀貨・金貨を廃棄するアタックもあります。"],
    ["Council Room", "議事堂", 5, 7, ["draw", "buy", "terminal"], "4枚と購入回数を増やせます。相手にも1枚引かせる点を考慮します。", { draw: 4, buys: 1 }],
    ["Festival", "祝祭", 5, 7, ["village", "buy", "money"], "アクション・購入回数・金量を増やします。ドローと組み合わせると使いやすくなります。", { actions: 2, buys: 1 }],
    ["Laboratory", "研究所", 5, 8, ["draw", "cantrip"], "2枚引いてアクションを維持できます。デッキを回すための安定した候補です。", { draw: 2, actions: 1 }],
    ["Library", "書庫", 5, 7, ["draw", "terminal"], "手札が7枚になるまで引きます。先に手札を減らすカードと組み合わせられます。"],
    ["Market", "市場", 5, 7, ["cantrip", "buy", "money"], "ドロー・アクション・購入回数・金量を少しずつ補えます。", { draw: 1, actions: 1, buys: 1 }],
    ["Mine", "鉱山", 5, 4, ["trash", "treasure", "terminal"], "財宝を廃棄して高い財宝を手札に獲得します。効果を使える財宝が必要です。"],
    ["Sentry", "衛兵", 5, 8, ["trash", "cantrip"], "山札の上の不要なカードを廃棄・捨て札にできます。アクションも維持できます。", { draw: 1, actions: 1 }],
    ["Witch", "魔女", 5, 9, ["draw", "attack", "curse", "terminal"], "2枚引きながら相手に呪いを配ります。呪いが残る序盤ほど購入価値が高くなります。", { draw: 2 }],
    ["Artisan", "職人", 6, 7, ["gain", "terminal"], "5金以下のカードを手札に獲得できます。山札に戻すカードも選びます。"]
  ];
  for (const [name, ja, cost, score, tags, tip, extra = {}] of definitions) {
    const types = extra.victory ? V : [...A, ...(tags.includes("attack") ? ["ATTACK"] : []), ...(tags.includes("reaction") ? ["REACTION"] : [])];
    // Classify the printed +Actions, without assuming a target for Throne Room
    // or a revealed card for Vassal. Unsupported cards remain unclassified.
    const actionRole = types.includes("ACTION") ? (extra.actions >= 1 ? "combo" : "terminal") : null;
    add(name, ja, cost, types, { score, tags, tip, ...extra, actionRole });
  }
  ns.catalog = Object.freeze(cards);
  ns.card = (name, metadata = {}) => cards[name] || { name, ja: metadata.ja || name, cost: metadata.cost ?? null, types: metadata.types || [], base: metadata.base || false, unreviewed: true };
})();
