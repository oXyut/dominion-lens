(() => {
  "use strict";
  if (document.getElementById("dominion-lens-host")) return;
  const host = document.createElement("div");
  host.id = "dominion-lens-host";
  document.documentElement.appendChild(host);
  let latest = { status: "waiting" }, saveTimer;
  const panel = new DominionLens.Panel(host, { onChange(settings) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // Persist presentation preferences only, never names, game ids or logs.
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
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "dominion-lens:snapshot:v1" || !DominionLens.validSnapshot(event.data.data)) return;
    latest = event.data.data; panel.update(latest);
  });
  window.postMessage({ channel: "dominion-lens:request:v1" }, location.origin);
})();
