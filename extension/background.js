/* Serializes local history operations across tabs. No network requests. */
importScripts("lib/protocol.js", "lib/history.js");
const historyStore = new DominionLens.history.HistoryStore(chrome.storage.local);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.channel !== "dominion-lens:history:v1" || sender.id !== chrome.runtime.id) return false;
  let origin;
  try { origin = new URL(sender.url).origin; } catch { return false; }
  if (!["https://dominion.games", "https://www.dominion.games"].includes(origin) || !sender.tab) return false;
  historyStore.run(message.action || {}).then(respond, () => respond({ state: null,
    status: { code: "error", message: "履歴の処理に失敗しました。変更は保存できていません。再試行してください。" } }));
  return true;
});
