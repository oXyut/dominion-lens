(() => {
  "use strict";
  const ns = globalThis.DominionLens ||= {};
  class DiscardTracker {
    constructor() { this.reset(); }
    reset(state = null) { this.state = state; this.piles = new Map(); }
    begin(state) {
      if (state === this.state) return;
      this.reset(state);
      for (const zone of state.zones || []) if (zone?.zoneName === "DiscardZone") {
        const empty = !zone.cardStacks?.some(s => !s.destroyed && (s.cards.length + s.anonymousCards > 0));
        this.piles.set(zone.index, { counts: Object.create(null), complete: empty, expected: empty ? 0 : null });
      }
    }
    move(from, to, names) {
      const source = this.piles.get(from), target = this.piles.get(to);
      if (from === to) return;
      for (const name of names) {
        if (source) {
          if (!name || !source.counts[name]) source.complete = false;
          else if (--source.counts[name] === 0) delete source.counts[name];
          source.expected = null;
        }
        if (target) {
          if (!name) target.complete = false;
          else target.counts[name] = (target.counts[name] || 0) + 1;
          target.expected = null;
        }
      }
    }
    status(index, count) {
      const pile = this.piles.get(index);
      if (!pile) return;
      if (count === 0) { pile.counts = Object.create(null); pile.complete = true; }
      pile.expected = count;
      if (Object.values(pile.counts).reduce((s, n) => s + n, 0) !== count) pile.complete = false;
    }
    get(index) {
      const pile = this.piles.get(index);
      return pile ? { counts: { ...pile.counts }, complete: pile.complete, expected: pile.expected } : { counts: {}, complete: false, expected: null };
    }
  }
  ns.DiscardTracker = DiscardTracker;
})();
