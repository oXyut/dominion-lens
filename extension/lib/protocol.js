(() => {
  "use strict";
  const ns = globalThis.DominionLens ||= {};
  const text = (s, limit = 180) => typeof s === "string" && s.length <= limit;
  const count = n => Number.isSafeInteger(n) && n >= 0 && n <= 10000;
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const counts = value => object(value) && Object.keys(value).length <= 2000 && Object.entries(value).every(([name, n]) => text(name) && count(n));
  const index = n => Number.isInteger(n) && n >= 0 && n < 6;
  const cost = n => n === null || count(n);
  const meta = c => object(c) && (c.ja === undefined || text(c.ja)) && cost(c.cost)
    && Array.isArray(c.types) && c.types.length <= 20 && c.types.every(t => text(t, 40));
  function validSnapshot(data) {
    if (!object(data) || !["ready", "rated", "waiting", "error"].includes(data.status)) return false;
    if (data.status !== "ready") return text(data.message, 1000);
    return text(data.gameId) && count(data.turn) && (data.ended === undefined || typeof data.ended === "boolean")
      && Array.isArray(data.players) && data.players.length > 0 && data.players.length <= 6
      && data.players.every(p => object(p) && index(p.index) && text(p.name) && typeof p.isMe === "boolean")
      && new Set(data.players.map(p => p.index)).size === data.players.length
      && Array.isArray(data.logs) && data.logs.length <= 100000
      && data.logs.every(e => object(e) && Number.isSafeInteger(e.index) && e.index >= 0 && text(e.type, 80)
        && (e.player === null || index(e.player)) && (e.toPlayer === null || e.toPlayer === undefined || index(e.toPlayer))
        && (e.turn === undefined || e.turn === null || count(e.turn))
        && Array.isArray(e.cards) && e.cards.length <= 2000 && e.cards.every(c => object(c) && text(c.name) && count(c.count)))
      && object(data.metadata) && Object.keys(data.metadata).length <= 2000 && Object.entries(data.metadata).every(([name, c]) => text(name) && meta(c))
      && Array.isArray(data.supply) && data.supply.length <= 200
      && data.supply.every(p => meta(p) && text(p.name) && count(p.remaining) && count(p.potion || 0) && count(p.debt || 0))
      && Array.isArray(data.ownZones) && data.ownZones.length <= 6
      && data.ownZones.every(p => object(p) && index(p.index) && object(p.zones) && typeof p.zones.complete === "boolean"
        && counts(p.zones.hand) && counts(p.zones.play) && counts(p.zones.aside) && (p.zones.drawSize === null || count(p.zones.drawSize))
        && object(p.discard) && typeof p.discard.complete === "boolean" && counts(p.discard.counts) && (p.discard.expected === null || count(p.discard.expected)));
  }
  ns.validSnapshot = validSnapshot;
})();
