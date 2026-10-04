/* Site adapter verified against the public Dominion Online 2.3.4 client.
 * Observe the ordinary client; never send commands or alter its game data.
 */
(() => {
  "use strict";
  const ns = globalThis.DominionLens ||= {};
  if (ns.bridgeStarted) return;
  ns.bridgeStarted = true;
  const discards = new ns.DiscardTracker();
  let lastPayload = "", wrapped = false, lastReady = null;
  const channel = "dominion-lens:snapshot:v1";
  const logTypes = new Set(["NEW_TURN", "BUY", "STARTS_WITH", "GAIN", "GAIN_WITH", "BUY_AND_GAIN", "TRASH", "TRASH_WITH", "EXCHANGE_RETURN", "EXCHANGE_RECEIVE", "RETURN_TO", "PASS", "GAIN_ON_DRAWPILE", "GAIN_FROM_TRASH", "GAIN_ANOTHER_EXPERIMENT", "RECEIVES", "RETURN", "TAKE"]);
  function globalsReady() { return typeof angular !== "undefined" && typeof CardNames !== "undefined" && typeof LogEntryNames !== "undefined"; }
  function enumKey(object, value) { return Object.keys(object).find(key => object[key] === value); }
  function cardName(card) { const name = card?.cardName?.name; return name && name !== "Back" ? name : null; }
  function observeMovement(move, game) {
    discards.begin(game.state);
    const names = move.cardIds.map((id, i) => cardName(game.state.cards[id]) || cardName(game.state.cards[move.cardIdsAfterMoving[i]]));
    discards.move(move.fromZoneIndex, move.toZoneIndex, names);
  }
  function wrapObservers() {
    if (wrapped || typeof CardMove === "undefined" || typeof PilesStatus === "undefined") return;
    wrapped = true;
    const originalMove = CardMove.prototype.execute;
    CardMove.prototype.execute = function (...args) {
      // Observer failure must not prevent the game's original method from running.
      try { observeMovement(this, args[0]); } catch { discards.reset(); }
      return Reflect.apply(originalMove, this, args);
    };
    const originalStatus = PilesStatus.prototype.execute;
    PilesStatus.prototype.execute = function (...args) {
      try { discards.begin(args[0].state); discards.status(this.discardIndex, this.discardSize); } catch { discards.reset(); }
      return Reflect.apply(originalStatus, this, args);
    };
  }
  function metadata(card) {
    const ja = typeof JapaneseCardNames !== "undefined" ? JapaneseCardNames[card]?.singular : undefined;
    return { name: card.name, ja: ja || card.name, cost: card.cost?.coin ?? null,
      potion: card.cost?.potion || 0, debt: card.cost?.debt || 0,
      types: card.types.map(t => enumKey(Types, t)).filter(Boolean), base: card.isBaseCard() };
  }
  function extractLogs(game) {
    const keyMap = new Map(Object.entries(LogEntryNames).map(([key, value]) => [value, key]));
    let turn = null;
    return [...(game.logModel.entries || [])].sort((a, b) => a.index - b.index).flatMap(entry => {
      const type = keyMap.get(entry.name);
      if (!logTypes.has(type)) return [];
      const args = entry.logArguments || [];
      if (type === "NEW_TURN") {
        // NEW_TURN carries a public LoggedTurn as argument 0 in client 2.3.4.
        const description = args[0]?.argument;
        turn = Number.isSafeInteger(description?.turnNumber) && description.turnNumber >= 0 ? description.turnNumber : null;
        return [{ index: entry.index, type, player: description?.ownerId ?? null, cards: [], toPlayer: null, turn }];
      }
      const player = typeof args[0]?.argument === "number" ? args[0].argument : null;
      const cards = Array.isArray(args[1]?.argument) ? args[1].argument.filter(c => c?.cardName?.name && Number.isInteger(c.frequency)).map(c => ({ name: c.cardName.name, count: c.frequency })) : [];
      return [{ index: entry.index, type, player, cards, toPlayer: type === "PASS" ? args[2]?.argument : null, turn }];
    });
  }
  function knownCards(zones) {
    const counts = Object.create(null); let complete = true;
    for (const zone of zones) for (const stack of zone.cardStacks || []) {
      if (stack.destroyed || stack.isInset) continue;
      if (stack.anonymousCards > 0) complete = false;
      for (const card of stack.cards) {
        const name = cardName(card);
        if (name) counts[name] = (counts[name] || 0) + 1;
        else complete = false;
      }
    }
    return { counts, complete };
  }
  function ownedZones(player) {
    if (!player.isMe) return null;
    const zones = player.ownedZones || [];
    const hand = knownCards(zones.filter(z => z.zoneName === "HandZone"));
    const play = knownCards(zones.filter(z => z.zoneName === "InPlayZone"));
    const aside = knownCards(zones.filter(z => !["HandZone", "InPlayZone", "DrawZone", "DiscardZone"].includes(z.zoneName)));
    const draw = zones.find(z => z.zoneName === "DrawZone");
    const discard = zones.find(z => z.zoneName === "DiscardZone");
    // DrawZone renders each card twice, in primaryStacks and windowStacks.
    const drawSize = draw?.primaryStacks?.filter(s => !s.destroyed).reduce((n, s) => n + s.cards.length + s.anonymousCards, 0) ?? null;
    return { index: player.index, zones: { hand: hand.counts, play: play.counts, aside: aside.counts,
      complete: hand.complete && play.complete && aside.complete, drawSize }, discard: discards.get(discard?.index) };
  }
  function snapshot() {
    if (!globalsReady()) return { status: "waiting", message: "サイトの読み込みを待っています。" };
    wrapObservers();
    const injector = angular.element(document.body).injector();
    if (!injector) return { status: "waiting", message: "サイトへの接続を待っています。" };
    const game = injector.get("game");
    if (!game.isRunning() || !game.state?.players?.length) {
      // The client can become inactive between polls while its final public log
      // is still available. Capture it once before announcing the waiting state.
      if (!game.logModel?.isRated && lastReady && lastReady.gameId === String(game.displayedGameId) && Array.isArray(game.logModel?.entries)) {
        const final = { ...lastReady, logs: extractLogs(game), turn: game.state?.activeTurn?.turnNumber ?? lastReady.turn, ended: true };
        lastReady = null; return final;
      }
      lastReady = null;
      return { status: "waiting", message: "ログインして、友達またはCPUとのゲームを開始してください。" };
    }
    if (game.logModel?.isRated) { lastReady = null; return { status: "rated", message: "レート戦では分析表示を停止しています。" }; }
    // Poll only after the animation queue settles, so log and zones represent the same moment.
    if (game.animationDirector?.queueElements?.length) return null;
    discards.begin(game.state);
    const cardMetadata = Object.create(null);
    for (const card of game.state.cardNames) cardMetadata[card.name] = metadata(card);
    const supply = game.state.zones.filter(z => z instanceof SupplyZone).map(zone => {
      const top = zone.cardStacks[0]?.topCard;
      const card = top?.cardName?.name !== "Back" ? top?.cardName : zone.pileName;
      const meta = metadata(card);
      return { ...meta, cost: top?.cost?.coin ?? meta.cost, potion: top?.cost?.potion ?? meta.potion,
        debt: top?.cost?.debt ?? meta.debt, remaining: zone.cardStacks.reduce((n, s) => n + s.cards.length + s.anonymousCards, 0) };
    });
    lastReady = { status: "ready", gameId: String(game.displayedGameId), turn: game.state.activeTurn.turnNumber,
      players: game.state.players.map(p => ({ index: p.index, name: p.name, isMe: p.isMe })),
      logs: extractLogs(game), metadata: cardMetadata, supply,
      ownZones: game.state.players.map(ownedZones).filter(Boolean) };
    return lastReady;
  }
  function publish(force = false) {
    try {
      const data = snapshot(); if (!data) return;
      if (data.ended) {
        window.postMessage({ channel, data }, location.origin);
        const waiting = { status: "waiting", message: "対戦が終了しました。取得済みの対戦ログは「履歴」で確認できます。" };
        lastPayload = JSON.stringify(waiting);
        window.postMessage({ channel, data: waiting }, location.origin);
        return;
      }
      const payload = JSON.stringify(data);
      if (force || payload !== lastPayload) { lastPayload = payload; window.postMessage({ channel, data }, location.origin); }
    } catch {
      const data = { status: "error", message: "サイトの接続形式が変わった可能性があります。ページを再読み込みしてください。" };
      const payload = JSON.stringify(data);
      if (force || lastPayload !== payload) { lastPayload = payload; window.postMessage({ channel, data }, location.origin); }
    }
  }
  window.addEventListener("message", event => {
    if (event.source === window && event.origin === location.origin && event.data?.channel === "dominion-lens:request:v1") publish(true);
  });
  setInterval(publish, 750);
  publish();
})();
