(() => {
  const names = ["Chapel", "Village", "Smithy", "Witch", "Market", "Sentry", "Moat", "Festival", "Merchant", "Moneylender"];
  const starting = [{ name: "Copper", count: 7 }, { name: "Estate", count: 3 }];
  function initial() {
    const logs = [0, 1].map(player => ({ index: player, type: "STARTS_WITH", player, cards: structuredClone(starting) }));
    let index = 2;
    const push = (player, type, name, count) => logs.push({ index: index++, player, type, cards: [{ name, count }] });
    push(0, "TRASH", "Copper", 2); push(0, "TRASH", "Estate", 2);
    for (const [name, count] of [["Silver", 3], ["Gold", 1], ["Chapel", 1], ["Village", 2], ["Smithy", 2], ["Market", 1], ["Sentry", 1], ["Province", 1]]) push(0, "BUY_AND_GAIN", name, count);
    for (const [name, count] of [["Silver", 2], ["Gold", 2], ["Smithy", 1], ["Duchy", 1]]) push(1, "BUY_AND_GAIN", name, count);
    const supplyNames = [...names, "Copper", "Silver", "Gold", "Estate", "Duchy", "Province", "Curse"];
    return { status: "ready", demo: true, gameId: "DEMO", turn: 9,
      players: [{ index: 0, name: "You", isMe: true }, { index: 1, name: "CPU", isMe: false }], logs,
      metadata: Object.fromEntries(supplyNames.map(name => [name, DominionLens.card(name)])),
      supply: supplyNames.map(name => ({ ...DominionLens.card(name), remaining: name === "Province" ? 7 : name === "Curse" ? 6 : 10 })),
      ownZones: [{ index: 0, zones: { hand: { Copper: 2, Silver: 1, Smithy: 1, Village: 1 }, play: {}, aside: {}, drawSize: 9, complete: true }, discard: { counts: { Copper: 1, Silver: 1, Chapel: 1, Province: 1 }, complete: true, expected: 4 } }] };
  }
  let state = initial(); const history = [];
  const host = document.createElement("div"); host.id = "dominion-lens-host"; document.body.append(host);
  const panel = new DominionLens.Panel(host);
  function show(message) {
    panel.update(state);
    document.getElementById("feedback").textContent = message;
    document.getElementById("undo").disabled = !history.length;
    document.getElementById("trash").disabled = !(state.ownZones[0].zones.hand.Copper > 0);
    document.getElementById("shuffle").disabled = DominionLens.analysis.size(state.ownZones[0].discard.counts) === 0;
  }
  function event(type, name) {
    state.logs.push({ index: Math.max(...state.logs.map(e => e.index)) + 1, player: 0, type, cards: [{ name, count: 1 }] });
  }
  document.getElementById("gain").onclick = () => {
    history.push(structuredClone(state)); event("GAIN", "Silver");
    const discard = state.ownZones[0].discard; discard.counts.Silver = (discard.counts.Silver || 0) + 1; discard.expected++;
    show("銀貨を1枚獲得しました。所有枚数・期待金量・捨て札を更新しました。");
  };
  document.getElementById("trash").onclick = () => {
    history.push(structuredClone(state)); event("TRASH", "Copper");
    if (--state.ownZones[0].zones.hand.Copper === 0) delete state.ownZones[0].zones.hand.Copper;
    show("手札の銅貨を1枚廃棄しました。所有カードと王国評価を更新しました。");
  };
  document.getElementById("shuffle").onclick = () => {
    history.push(structuredClone(state));
    const own = state.ownZones[0]; own.zones.drawSize += DominionLens.analysis.size(own.discard.counts); own.discard = { counts: {}, complete: true, expected: 0 };
    show("捨て札を山札に戻しました。山札の内訳とドロー確率を更新しました。");
  };
  document.getElementById("undo").onclick = () => { state = history.pop(); show("直前の操作を巻き戻し、元のログから再集計しました。"); };
  document.getElementById("reset").onclick = () => { state = initial(); history.length = 0; show("サンプル対戦を初期状態に戻しました。"); };
  const kingdom = document.getElementById("kingdom");
  for (const [i, name] of names.entries()) {
    const card = DominionLens.card(name), node = document.createElement("div"); node.className = "card";
    node.innerHTML = `<div class="card-name">${card.ja}</div><div class="card-art">${["♜", "♧", "⚒", "☽", "◇", "⚑", "≈", "✦", "♙", "◈"][i]}</div><div class="card-footer"><span>${card.cost}金</span><span>10枚</span></div>`;
    kingdom.append(node);
  }
  show("サンプル対戦を表示しています。実際の対戦には接続していません。");
})();
