(() => {
  "use strict";
  const ns = globalThis.DominionLens ||= {};
  const KEY = "lensHistory";
  const limits = Object.freeze({ records: 30, bytes: 2 * 1024 * 1024 });
  const types = new Set(["NEW_TURN", "BUY", "STARTS_WITH", "GAIN", "GAIN_WITH", "BUY_AND_GAIN", "TRASH", "TRASH_WITH", "EXCHANGE_RETURN", "EXCHANGE_RECEIVE", "RETURN_TO", "PASS", "GAIN_ON_DRAWPILE", "GAIN_FROM_TRASH", "GAIN_ANOTHER_EXPERIMENT", "RECEIVES", "RETURN", "TAKE"]);
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const empty = () => ({ version: 1, enabled: false, records: [], deletedIds: [] });
  const text = value => typeof value === "string" && value.length <= 180;
  function validStoredRecord(r) {
    return r !== null && typeof r === "object" && Array.isArray(r.players)
      && r.players.every(p => p !== null && typeof p === "object")
      && ns.validSnapshot({ status: "ready", gameId: r.gameId, turn: r.turn,
        players: r.players.map(p => ({ ...p, isMe: false })), logs: r.logs, metadata: {}, supply: [], ownZones: [] })
      && r.logs.every(e => types.has(e.type)) && new Set(r.logs.map(e => e.index)).size === r.logs.length
      && r.labels !== null && typeof r.labels === "object" && !Array.isArray(r.labels)
      && Object.entries(r.labels).every(([key, value]) => text(key) && text(value))
      && typeof r.partial === "boolean" && Number.isSafeInteger(r.createdAt) && r.createdAt >= 0
      && Number.isSafeInteger(r.updatedAt) && r.updatedAt >= r.createdAt;
  }
  function validState(state) {
    try {
      return state?.version === 1 && typeof state.enabled === "boolean" && Array.isArray(state.records) && Array.isArray(state.deletedIds)
        && state.records.length <= limits.records && state.records.every(validStoredRecord)
        && new Set(state.records.map(r => r.gameId)).size === state.records.length
        && state.deletedIds.every(text) && bytes(state) <= limits.bytes;
    } catch { return false; }
  }

  // Build an explicit public-data allowlist. Never persist zones, raw arguments,
  // arbitrary metadata, authentication data or a whole incoming snapshot.
  function publicRecord(data) {
    if (!ns.validSnapshot(data) || data.status !== "ready" || data.demo
      || !data.gameId.trim() || ["-1", "undefined", "null"].includes(data.gameId)) return null;
    if (data.logs.some(e => !types.has(e.type))) return null;
    const logs = data.logs.map(e => ({ index: e.index, type: e.type, player: e.player,
      cards: e.cards.map(c => ({ name: c.name, count: c.count })),
      toPlayer: e.toPlayer ?? null, turn: e.turn ?? null })).sort((a, b) => a.index - b.index);
    if (new Set(logs.map(e => e.index)).size !== logs.length) return null;
    const labels = Object.create(null);
    for (const e of logs) for (const c of e.cards) labels[c.name] = data.metadata[c.name]?.ja || c.name;
    return { gameId: data.gameId, turn: data.turn,
      players: data.players.map(p => ({ index: p.index, name: p.name })), logs, labels,
      partial: !data.players.every(p => logs.some(e => e.type === "STARTS_WITH" && e.player === p.index && e.cards.length)) };
  }

  class HistoryStore {
    constructor(storage, now = () => Date.now()) { this.storage = storage; this.now = now; this.queue = Promise.resolve(); }
    run(action) {
      // One worker owns all mutations, including settings and deletion. Reload
      // storage for every action so worker suspension/restart loses no state.
      const result = this.queue.then(() => this.execute(action));
      this.queue = result.catch(() => {});
      return result;
    }
    async execute(action) {
      let state;
      try {
        const stored = (await this.storage.get(KEY))[KEY];
        state = stored === undefined ? empty() : stored;
        if (!validState(state)) throw new Error("format");
      } catch {
        return { state: null, status: { code: "error", message: "履歴を読み込めません。拡張を再読み込みして再試行してください。保存は行っていません。" } };
      }
      const respond = (code, message, gameId) => ({ state, status: { code, message, gameId } });
      if (action.type === "read") return respond("loaded", "保存済みの履歴を読み込みました。");
      const next = structuredClone(state);
      let gameId, message;
      if (action.type === "enabled" && typeof action.enabled === "boolean") {
        next.enabled = action.enabled;
        message = next.enabled ? "対戦ログの保存を有効にしました。" : "保存を無効にしました。保存済みの履歴は残ります。";
      } else if (action.type === "delete" && ((text(action.gameId) && action.gameId.trim()) || action.all === true)) {
        const removed = next.records.filter(r => action.all || r.gameId === action.gameId);
        // A stale tab may request deletion after another update already evicted
        // that record. Honor the requested ID even when it is no longer listed.
        next.deletedIds = [...new Set([...next.deletedIds, ...removed.map(r => r.gameId), ...(!action.all ? [action.gameId] : [])])];
        next.records = next.records.filter(r => !action.all && r.gameId !== action.gameId);
        message = action.all ? "全履歴を削除しました。削除した対局は再記録しません。" : "履歴を削除しました。この対局は再記録しません。";
      } else if (action.type === "record") {
        if (!state.enabled) return respond("disabled", "保存は無効です。");
        const record = publicRecord(action.snapshot);
        if (!record) return respond("error", "対局IDまたは公開ログを確認できず、保存していません。", action.snapshot?.gameId);
        gameId = record.gameId;
        if (next.deletedIds.includes(gameId)) return respond("deleted", "この対局は削除済みのため、再記録しません。", gameId);
        const previous = next.records.find(r => r.gameId === gameId);
        // Only the last received authoritative log is effective, even if shorter
        // after undo/reconnect. Repeated snapshots do not create new records.
        if (previous && JSON.stringify({ ...previous, createdAt: undefined, updatedAt: undefined }) === JSON.stringify(record)) return respond("saved", "最新の取得ログを端末に保存済みです。", gameId);
        const now = Math.max(this.now(), ...state.records.map(r => r.updatedAt), 0);
        next.records = next.records.filter(r => r.gameId !== gameId);
        next.records.unshift({ ...record, createdAt: previous?.createdAt ?? now, updatedAt: now });
        let evicted = 0;
        while (next.records.length > limits.records || bytes(next) > limits.bytes) {
          if (next.records.length <= 1) return respond("error", "保存上限（2 MiB）を超えるため、今回の更新は保存していません。履歴を削除して再試行してください。1対局だけで上限を超えるログは保存できません。削除済みIDだけで上限に達した場合は、保存を無効にしてください。", gameId);
          next.records.pop(); evicted++;
        }
        message = evicted ? `最新の取得ログを端末に保存しました。上限のため古い履歴を${evicted}件削除しました。` : "最新の取得ログを端末に保存済みです。";
      } else return respond("error", "履歴の操作を確認できませんでした。");
      if (bytes(next) > limits.bytes) return respond("error", "保存上限（2 MiB）を超えたため、変更を保存していません。保存を無効にして履歴を削除してください。", gameId);
      try { await this.storage.set({ [KEY]: next }); }
      catch { return respond("error", "端末への保存に失敗しました。今回の変更は未保存です。履歴を削除して空きを作り、再試行してください。", gameId); }
      state = next;
      return respond(action.type === "record" ? "saved" : "changed", message, gameId);
    }
  }
  ns.history = { KEY, limits, publicRecord, validState, HistoryStore };
})();
