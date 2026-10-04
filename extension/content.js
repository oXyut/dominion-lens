(() => {
  "use strict";
  if (document.getElementById("dominion-lens-host")) return;
  const host = document.createElement("div");
  host.id = "dominion-lens-host";
  document.documentElement.appendChild(host);
  let latest = { status: "waiting" }, saveTimer, operation = 0;
  async function historyAction(action) {
    const current = ++operation;
    panel.setHistory({ ...panel.history, status: { code: "pending", message: "端末の履歴を更新しています…" } });
    try {
      const result = await chrome.runtime.sendMessage({ channel: "dominion-lens:history:v1", action });
      if (!result?.status) throw new Error("No history response");
      if (current === operation) panel.setHistory(result);
      if (current === operation && ["enabled", "read"].includes(action.type) && result.state?.enabled && result.status.code !== "error" && latest.status === "ready") historyAction({ type: "record", snapshot: latest });
    } catch {
      if (current === operation) panel.setHistory({ ...panel.history, status: { code: "error",
        message: "履歴に接続できません。変更は未保存です。拡張を再読み込みして再試行してください。" } });
    }
  }
  const panel = new DominionLens.Panel(host, { onHistoryAction: historyAction, onChange(settings) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // History has its own serialized store in the extension worker.
      const { minimized, draws, basic } = settings;
      chrome.storage.local.set({ lensSettings: { minimized, draws, basic } }).catch(() => {});
    }, 200);
  } });
  chrome.storage.local.get("lensSettings").then(({ lensSettings }) => {
    if (lensSettings) {
      panel.settings.minimized = lensSettings.minimized === true;
      panel.settings.basic = lensSettings.basic === true;
      panel.settings.draws = Math.min(20, Math.max(1, Number(lensSettings.draws) || 5));
      panel.update(latest);
    }
  }).catch(() => {});
  historyAction({ type: "read" });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.lensHistory) return;
    const state = changes.lensHistory.newValue;
    if (!DominionLens.history.validState(state)) {
      panel.setHistory({ state: null, status: { code: "error", message: "履歴の形式を読み取れません。変更は保存していません。拡張を再読み込みして再試行してください。" } });
      return;
    }
    let status = panel.history.status;
    if (state?.enabled === false) status = { code: "disabled", message: "保存は無効です。保存済みの履歴は閲覧できます。" };
    else if (state?.deletedIds?.includes(latest.gameId)) status = { code: "deleted", message: "この対局は削除済みのため、再記録しません。" };
    panel.setHistory({ state, status });
  });
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "dominion-lens:snapshot:v1" || !DominionLens.validSnapshot(event.data.data)) return;
    latest = event.data.data;
    if (!latest.ended) panel.update(latest);
    if (latest.status === "ready") historyAction({ type: "record", snapshot: latest });
  });
  window.postMessage({ channel: "dominion-lens:request:v1" }, location.origin);
})();
