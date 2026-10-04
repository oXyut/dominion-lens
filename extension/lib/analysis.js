(() => {
  "use strict";
  const ns = globalThis.DominionLens ||= {};
  const bag = () => Object.create(null);
  const size = counts => Object.values(counts || {}).reduce((a, b) => a + b, 0);
  const validCount = n => Number.isSafeInteger(n) && n >= 0 && n <= 10000;
  function change(counts, name, delta, issues) {
    const next = (counts[name] || 0) + delta;
    if (next < 0) issues?.add("ログにないカードの移動があり、所有枚数を確定できません。");
    if (next > 0) counts[name] = next;
    else delete counts[name];
  }
  const gainTypes = new Set(["GAIN", "GAIN_WITH", "BUY_AND_GAIN", "GAIN_ON_DRAWPILE", "GAIN_FROM_TRASH", "EXCHANGE_RECEIVE"]);
  const lossTypes = new Set(["TRASH", "TRASH_WITH", "EXCHANGE_RETURN", "RETURN_TO"]);
  // Replay the complete, current log: an undo replaces earlier entries rather than
  // adding an inverse event, so incremental counters would be incorrect.
  function replay(players, entries) {
    const result = new Map(players.map(p => [p.index, { ...p, counts: bag(), initialized: false, issues: new Set() }]));
    for (const entry of [...entries].sort((a, b) => a.index - b.index)) {
      const p = result.get(entry.player);
      if (!p) continue;
      const cards = (entry.cards || []).filter(c => typeof c.name === "string" && validCount(c.count));
      if (entry.type === "STARTS_WITH") {
        // The live client emits starting cards in separate entries (e.g.
        // Estates, then Coppers). Each entry adds to this replay's fresh bag;
        // resetting here would erase the cards from earlier starting entries.
        p.initialized = true;
        for (const c of cards) change(p.counts, c.name, c.count);
      } else if (gainTypes.has(entry.type) || lossTypes.has(entry.type)) {
        for (const c of cards) change(p.counts, c.name, c.count * (gainTypes.has(entry.type) ? 1 : -1), p.issues);
      } else if (entry.type === "PASS") {
        const recipient = result.get(entry.toPlayer);
        for (const c of cards) {
          change(p.counts, c.name, -c.count, p.issues);
          if (recipient) change(recipient.counts, c.name, c.count, recipient.issues);
        }
      } else if (entry.type === "GAIN_ANOTHER_EXPERIMENT") change(p.counts, "Experiment", 1, p.issues);
      else if (["RECEIVES", "RETURN", "TAKE"].includes(entry.type) && cards.length) {
        // These are also used for Boons, Hexes and Artifacts; don't mistake them
        // for ownership changes of ordinary deck cards.
        p.issues.add("特殊な受け渡しを検出しました。所有枚数は参考値です。");
      }
    }
    return [...result.values()].map(p => ({ ...p, complete: p.initialized && p.issues.size === 0, issues: [...p.issues, ...(!p.initialized ? ["開始時のログがないため、所有カードを確定できません。"] : [])] }));
  }
  function drawProbability(total, copies, draws) {
    if (![total, copies, draws].every(validCount) || copies > total) return null;
    if (!total || !copies || !draws) return 0;
    const n = Math.min(draws, total);
    if (n > total - copies) return 1;
    let miss = 1;
    for (let i = 0; i < n; i++) miss *= (total - copies - i) / (total - i);
    return Math.max(0, Math.min(1, 1 - miss));
  }
  // Exhaust the current draw pile before sampling the current discard pile.
  // Cards already in hand, play or aside never enter this second sample.
  function drawProbabilityAfterShuffle(drawTotal, drawCopies, discardTotal, discardCopies, draws) {
    if (![drawTotal, drawCopies, discardTotal, discardCopies, draws].every(validCount)
      || drawCopies > drawTotal || discardCopies > discardTotal) return null;
    if (draws <= drawTotal) return drawProbability(drawTotal, drawCopies, draws);
    if (drawCopies) return 1;
    return drawProbability(discardTotal, discardCopies, draws - drawTotal);
  }
  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let value = 1;
    for (let i = 1; i <= k; i++) value *= (n - k + i) / i;
    return value;
  }
  // A weighted hypergeometric distribution of a uniformly sampled hand.
  function moneyDistribution(counts, draws, metadata = {}) {
    const N = size(counts), n = Math.min(draws, N), groups = new Map();
    let unknown = 0, sum = 0;
    for (const [name, count] of Object.entries(counts)) {
      const card = ns.card(name, metadata[name]);
      const value = card.money ?? 0;
      if (card.types.includes("TREASURE") && card.money === undefined) unknown += count;
      groups.set(value, (groups.get(value) || 0) + count); sum += count * value;
    }
    if (!N) return { expected: 0, unknown, distribution: [], p5: 0, p8: 0 };
    let dp = [new Map([[0, 1]])];
    for (const [value, count] of groups) {
      const next = Array.from({ length: n + 1 }, () => new Map());
      for (let selected = 0; selected < dp.length; selected++) {
        for (const [money, ways] of dp[selected]) {
          for (let k = 0; k <= Math.min(count, n - selected); k++) {
            const m = money + k * value, map = next[selected + k];
            map.set(m, (map.get(m) || 0) + ways * choose(count, k));
          }
        }
      }
      dp = next;
    }
    const denominator = choose(N, n);
    const distribution = [...dp[n]].sort((a, b) => a[0] - b[0]).map(([money, ways]) => ({ money, probability: ways / denominator }));
    return { expected: sum * n / N, unknown, distribution,
      p5: distribution.filter(x => x.money >= 5).reduce((s, x) => s + x.probability, 0),
      p8: distribution.filter(x => x.money >= 8).reduce((s, x) => s + x.probability, 0) };
  }
  function actionComposition(counts, metadata = {}) {
    const total = size(counts), copies = { terminal: 0, combo: 0, unknown: 0 };
    for (const [name, count] of Object.entries(counts)) {
      const c = ns.card(name, metadata[name]);
      if (!c.types.includes("ACTION")) continue;
      copies[c.actionRole === "terminal" || c.actionRole === "combo" ? c.actionRole : "unknown"] += count;
    }
    const actions = copies.terminal + copies.combo + copies.unknown;
    return { total, actions, ...Object.fromEntries(Object.entries(copies).map(([role, count]) => [role, {
      count, deckRatio: total ? count / total : null, actionRatio: actions ? count / actions : null
    }])) };
  }
  function metrics(counts, metadata = {}) {
    const total = size(counts), types = { action: 0, treasure: 0, victory: 0, curse: 0, other: 0 };
    let terminals = 0, villages = 0, draw = 0, junk = 0;
    for (const [name, count] of Object.entries(counts)) {
      const c = ns.card(name, metadata[name]);
      const category = c.types.includes("ACTION") ? "action" : c.types.includes("TREASURE") ? "treasure" : c.types.includes("VICTORY") ? "victory" : c.types.includes("CURSE") ? "curse" : "other";
      types[category] += count;
      if (c.tags?.includes("terminal")) terminals += count;
      if (c.tags?.includes("village")) villages += count;
      draw += (c.draw || 0) * count;
      if (["Copper", "Estate", "Curse"].includes(name)) junk += count;
    }
    return { total, types, terminals, villages, draw, junk, actionComposition: actionComposition(counts, metadata), money: moneyDistribution(counts, 5, metadata) };
  }
  function deriveDraw(player, snapshot) {
    if (!player.complete || !player.isMe || !snapshot?.discard?.complete || !snapshot?.zones?.complete) return null;
    const counts = { ...player.counts };
    const outside = [snapshot.discard.counts, snapshot.zones.hand, snapshot.zones.play, snapshot.zones.aside];
    for (const items of outside) for (const [name, count] of Object.entries(items || {})) {
      if ((counts[name] || 0) < count) return null;
      counts[name] -= count;
      if (!counts[name]) delete counts[name];
    }
    return size(counts) === snapshot.zones.drawSize ? counts : null;
  }
  function deriveDrawModel(player, snapshot, draws) {
    if (!validCount(draws)) return null;
    const draw = deriveDraw(player, snapshot);
    if (!draw) return null;
    const discard = snapshot.discard.counts, drawSize = size(draw), discardSize = size(discard);
    const reshuffle = draws > drawSize, counts = { ...draw };
    if (reshuffle) for (const [name, count] of Object.entries(discard)) counts[name] = (counts[name] || 0) + count;
    return { draw, discard, counts, drawSize, discardSize, reshuffle,
      fromDraw: Math.min(draws, drawSize), fromDiscard: Math.min(Math.max(0, draws - drawSize), discardSize) };
  }
  function recommendations(supply, counts, metadata = {}, turn = 0) {
    const m = metrics(counts, metadata), count = name => counts[name] || 0;
    const remaining = name => supply.find(p => p.name === name)?.remaining;
    const provinces = remaining("Colony") ?? remaining("Province");
    const late = provinces !== undefined && provinces <= 4;
    const names = new Set(supply.filter(p => p.remaining > 0).map(p => p.name));
    return supply.map(pile => {
      const c = ns.card(pile.name, metadata[pile.name]);
      const recommendation = { ...pile, card: c, availability: pile.remaining === 0 ? "empty" : "available", evaluation: c.score === undefined ? "unsupported" : "supported" };
      if (recommendation.availability === "empty") return { ...recommendation, score: null, reasons: ["このサプライは空です。"] };
      if (recommendation.evaluation === "unsupported") return { ...recommendation, score: null, reasons: ["このカードの評価データはまだありません。"] };
      let score = c.score, reasons = [c.tip];
      const adjust = (delta, reason) => { score += delta; reasons.push(reason); };
      if (c.tags.includes("trash")) {
        if (m.total && m.junk / m.total >= .4 && !late) adjust(1, "銅貨・屋敷・呪いが多く、圧縮で手札を改善できます。");
        if (m.total && m.junk / m.total < .2) adjust(-2, "廃棄したいカードが少なく、追加の圧縮は優先度が下がります。");
        if (count(c.name) && c.name === "Chapel") adjust(-4, "すでに礼拝堂があり、2枚目は使い道が重なりやすくなります。");
        if (c.name === "Chapel" && turn >= 12) adjust(-3, "終盤では圧縮の効果を回収するターンが少なくなります。");
      }
      if (c.tags.includes("copper") && !count("Copper")) adjust(-5, "廃棄する銅貨がありません。");
      if (c.tags.includes("village")) {
        if (m.terminals > m.villages) adjust(2, "使い切れないアクションがあり、追加アクションが役立ちます。");
        else adjust(-2, "現状は追加アクションの需要が少なめです。");
        if (names.has("Smithy") || names.has("Council Room")) reasons.push("王国のドローと組み合わせてデッキを回せます。");
      }
      if (c.tags.includes("terminal") && count(c.name) && !m.villages && m.terminals >= 2) adjust(-2, "追加アクションがなく、手札でアクションが重なりやすくなります。");
      if (c.tags.includes("draw") && c.tags.includes("terminal") && m.villages) adjust(1, "村系カードがあり、引いたアクションも使いやすい構成です。");
      if (c.tags.includes("curse")) {
        if (remaining("Curse") === 0) adjust(-4, "呪いが空になり、アタック部分の効果がなくなっています。");
        else if (count(c.name) >= 2) adjust(-2, "すでに複数枚あり、追加するより回転力を上げる候補もあります。");
      }
      if (c.tags.includes("silver") && !count("Silver")) adjust(-2, "銀貨がなく、追加の金量をまだ出せません。");
      if (c.name === "Gardens") {
        if (m.total >= 30) adjust(3, "デッキが30枚以上あり、庭園1枚が3点以上になります。");
        if (names.has("Workshop") || names.has("Artisan")) adjust(1, "複数枚を獲得する方針を組める王国です。");
      }
      if (c.tags.includes("victory")) {
        if (late) adjust(c.name === "Duchy" ? 6 : 2, "主要な勝利点の残りが4枚以下です。点数確保を優先する時期です。");
        else if (c.name === "Duchy") adjust(-1, "主要な勝利点がまだ多く、今はデッキの出力を育てやすい時期です。");
      } else if (late) adjust(-1, "ゲーム終了が近く、購入後に使える回数が少ない可能性があります。");
      return { ...recommendation, score: Math.max(0, Math.min(10, score)), reasons };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.card.cost || 0) - (b.card.cost || 0));
  }
  ns.analysis = { size, replay, drawProbability, drawProbabilityAfterShuffle, deriveDrawModel, moneyDistribution, actionComposition, metrics, recommendations, deriveDraw, validCount };
})();
