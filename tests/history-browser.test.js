import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromeExecutable, launchBrowser } from './helpers/browser.mjs';
import { historyFixture } from './helpers/history-fixture.mjs';

const executable = chromeExecutable();
test('real extension history UI, Chrome storage, page reload and browser restart in an isolated profile', {
  skip: executable ? false : 'Chrome/Chromium unavailable', timeout: 60000
}, async t => {
  const profile = await mkdtemp(path.join(tmpdir(), 'dominion-lens-history-'));
  let browser, extensionId;
  t.after(async () => { await browser?.close(); await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const wait = async (fn, label) => {
    const deadline = Date.now() + 5000;
    do { const result = await fn(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 50)); } while (Date.now() < deadline);
    throw Error(`Timed out: ${label}`);
  };
  async function open() {
    browser = await launchBrowser(executable, { profile, extensionTesting: true });
    ({ id: extensionId } = await browser.browserCommand('Extensions.loadUnpacked', { path: path.resolve(import.meta.dirname, '../extension') }));
    // Serve only a synthetic blank page at the matched origin. No requests reach
    // dominion.games, and no real login, game, tabs or existing profiles are used.
    browser.onEvent('Fetch.requestPaused', params => {
      browser.command('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        body: Buffer.from('<!doctype html><html><head><title>Anonymous history fixture</title></head><body></body></html>').toString('base64') }).catch(() => {});
    });
    await browser.command('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await browser.command('Page.navigate', { url: 'https://dominion.games/' });
    await wait(() => browser.evaluate('!!document.getElementById("dominion-lens-host")?.shadowRoot.querySelector("#tab-history")'), 'content panel');
    await browser.evaluate('window.root = document.getElementById("dominion-lens-host").shadowRoot');
    await wait(() => browser.evaluate('root.querySelector(".history-status")?.textContent.includes("読み込みました")'), 'initial history load');
    await browser.click('root.querySelector("#tab-history")');
  }
  const text = () => browser.evaluate('root.textContent');
  const status = () => browser.evaluate('root.querySelector(".history-status").textContent');
  const post = async snapshot => {
    await browser.evaluate(`window.postMessage({ channel: 'dominion-lens:snapshot:v1', data: ${JSON.stringify(snapshot)} }, location.origin)`);
  };
  const saved = () => wait(async () => /保存済み|保存しました/.test(await status()), 'saved acknowledgement');
  const readStorage = async () => (await browser.command('Extensions.getStorageItems', { id: extensionId, storageArea: 'local' })).data;
  const workerEvaluate = async expression => {
    const worker = await wait(async () => (await browser.browserCommand('Target.getTargets')).targetInfos.find(target => target.url === `chrome-extension://${extensionId}/background.js`), 'worker');
    const { sessionId } = await browser.browserCommand('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
    try {
      const result = await browser.browserCommand('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
      return result.result.value;
    } finally { await browser.browserCommand('Target.detachFromTarget', { sessionId }); }
  };

  await open();
  t.diagnostic(`History browser: ${(await browser.command('Browser.getVersion')).product}`);
  await t.test('history policy keeps its open and closed state across incoming snapshots', async () => {
    await browser.click('root.querySelector(".history-policy summary")');
    assert.equal(await browser.evaluate('root.querySelector(".history-policy").open'), true);
    await post(historyFixture());
    await wait(async () => (await status()).includes('無効'), 'default-off update');
    assert.equal(await browser.evaluate('root.querySelector(".history-policy").open'), true);
    await browser.click('root.querySelector(".history-policy summary")');
    const closedUpdate = historyFixture('sample-policy-match'); closedUpdate.turn = 3;
    await post(closedUpdate);
    await wait(() => browser.evaluate('root.querySelector(".status").textContent.includes("第3ターン")'), 'closed-policy update');
    assert.equal(await browser.evaluate('root.querySelector(".history-policy").open'), false);
    assert.equal((await readStorage()).lensHistory, undefined);
  });
  await t.test('default off, native opt-in, public logs, HTML escape and final waiting state', async () => {
    assert.equal(await browser.evaluate('root.querySelector("[data-key=historyEnabled]").checked'), false);
    const snapshot = historyFixture(); snapshot.players[0].name = '<img src=x onerror="window.unexpected=true">';
    await post(snapshot);
    await wait(async () => (await status()).includes('無効'), 'default off');
    assert.equal((await readStorage()).lensHistory, undefined);
    await browser.click('root.querySelector("[data-key=historyEnabled]")'); await saved();
    await browser.click('root.querySelector("[data-action=history-open]")');
    assert.match(await text(), /第1ターン|第2ターン/); assert.match(await text(), /購入|獲得|廃棄/);
    assert.equal(await browser.evaluate('!!root.querySelector("img") || !!window.unexpected'), false);
    const final = historyFixture(); final.ended = true;
    final.logs.push({ index: 7, type: 'GAIN', player: 0, turn: 2, toPlayer: null, cards: [{ name: 'Estate', count: 1 }] });
    await post(final); await post({ status: 'waiting', message: 'Anonymous match ended' }); await saved();
    assert.match(await browser.evaluate('root.querySelector(".status").textContent'), /開始を待って/);
    assert.match(await text(), /屋敷 × 1/);
    const storage = await readStorage();
    assert.equal(storage.lensHistory.records[0].logs.length, 8);
    assert.equal(storage.lensHistory.records[0].ownZones, undefined);
    if (process.env.HISTORY_QA_IMAGE) {
      const clip = await browser.evaluate('(() => { const r = root.querySelector(".panel").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()');
      const screenshot = await browser.command('Page.captureScreenshot', { format: 'png', clip });
      await writeFile(process.env.HISTORY_QA_IMAGE, Buffer.from(screenshot.data, 'base64'));
    }
  });
  await t.test('reload deduplicates, undo replaces, partial labels and keyboard history navigation', async () => {
    await workerEvaluate('historyStore.storage = { get: async (...args) => { await new Promise(resolve => setTimeout(resolve, 200)); return chrome.storage.local.get(...args); }, set: chrome.storage.local.set.bind(chrome.storage.local) }; true');
    await browser.command('Page.reload');
    await wait(() => browser.evaluate('!!document.getElementById("dominion-lens-host")?.shadowRoot.querySelector("#tab-history")'), 'reloaded content');
    await browser.evaluate('window.root = document.getElementById("dominion-lens-host").shadowRoot');
    const undone = historyFixture(); undone.logs = undone.logs.slice(0, 5); undone.turn = 1;
    // Deliver an authoritative update while the first history read is delayed.
    // The worker's persisted setting, rather than an uninitialized UI flag,
    // decides whether to record, and the late read cannot overwrite its status.
    await post(undone); await saved();
    await workerEvaluate('historyStore.storage = chrome.storage.local; true');
    await browser.click('root.querySelector("#tab-history")');
    assert.equal(await browser.evaluate('root.querySelectorAll(".history-item").length'), 1);
    assert.equal((await readStorage()).lensHistory.records.length, 1);
    await browser.click('root.querySelector("[data-action=history-open]")');
    assert.doesNotMatch(await browser.evaluate('root.querySelector(".history-log").textContent'), /廃棄|屋敷 × 1/);
    const partial = historyFixture('sample-friend-match'); partial.players[1].name = 'Sample B';
    partial.logs = partial.logs.slice(2); await post(partial); await saved();
    await browser.click('root.querySelector("[data-action=history-back]")');
    assert.match(await text(), /途中から記録/);
    await browser.evaluate('root.querySelector("#tab-kingdom").focus()');
    await browser.key('ArrowRight', 'ArrowRight', 39);
    assert.equal(await browser.evaluate('root.activeElement.id'), 'tab-history');
  });
  await t.test('quota failure keeps acknowledged logs, shows unsaved, and retry saves the latest snapshot', async () => {
    const before = (await readStorage()).lensHistory;
    await workerEvaluate('historyStore.storage = { get: chrome.storage.local.get.bind(chrome.storage.local), set: async () => { throw Error("Synthetic quota failure"); } }; true');
    const changed = historyFixture('sample-friend-match'); changed.logs.push({ index: 7, type: 'GAIN', player: 0, toPlayer: null, turn: 2, cards: [{ name: 'Silver', count: 1 }] });
    await post(changed);
    await wait(async () => (await status()).includes('未保存'), 'unsaved status');
    assert.doesNotMatch(await status(), /保存済み/);
    assert.deepEqual((await readStorage()).lensHistory, before);
    await workerEvaluate('historyStore.storage = chrome.storage.local; true');
    await browser.click('root.querySelector("[data-action=history-retry]")'); await saved();
    assert.equal((await readStorage()).lensHistory.records[0].logs.length, 8);
  });
  await t.test('browser restart retains records and deletion cannot be resurrected', async () => {
    await browser.close(); browser = null;
    await open();
    assert.equal(await browser.evaluate('root.querySelectorAll(".history-item").length'), 2);
    await browser.click('root.querySelector("[data-action=history-delete][data-value=sample-match-1]")');
    await browser.click('root.querySelector("[data-action=history-confirm]")');
    await wait(async () => (await status()).includes('履歴を削除'), 'delete acknowledgement');
    await post(historyFixture()); await wait(async () => (await status()).includes('削除済み'), 'delete fence');
    assert.equal((await readStorage()).lensHistory.records.length, 1);
    await browser.click('root.querySelector("[data-action=history-delete-all]")');
    await browser.click('root.querySelector("[data-action=history-confirm]")');
    await wait(async () => (await status()).includes('全履歴を削除'), 'clear acknowledgement');
    await browser.close(); browser = null;
    await open();
    assert.match(await text(), /保存された対局はありません/);
    await post(historyFixture('sample-friend-match')); await wait(async () => (await status()).includes('削除済み'), 'restart delete fence');
    assert.equal((await readStorage()).lensHistory.records.length, 0);
    await browser.click('root.querySelector("[data-key=historyEnabled]")');
    await wait(async () => (await status()).includes('無効'), 'disable acknowledgement');
    await post(historyFixture('sample-new-match')); await wait(async () => (await status()).includes('無効'), 'disabled save');
    assert.equal((await readStorage()).lensHistory.records.length, 0);
    await post({ status: 'rated', message: 'Anonymous rated match' });
    assert.match(await browser.evaluate('root.querySelector(".status").textContent'), /レート戦.*停止/);
    assert.equal((await readStorage()).lensHistory.records.length, 0);
  });
  await t.test('long logs paginate and corrupt stored records stop saving without a UI exception', async () => {
    await browser.click('root.querySelector("[data-key=historyEnabled]")');
    const long = historyFixture('sample-long-match');
    long.logs.push(...Array.from({ length: 110 }, (_, i) => ({ index: i + 7, type: 'GAIN', player: 0, turn: 2, toPlayer: null, cards: [{ name: 'Silver', count: 1 }] })));
    await post(long); await saved();
    await browser.click('root.querySelector("[data-action=history-open]")');
    assert.match(await text(), /1 \/ 2ページ/);
    await browser.click(`root.querySelector('[data-action=history-page][data-value="1"]')`);
    assert.match(await text(), /2 \/ 2ページ/);
    assert.match(await browser.evaluate('root.querySelector(".history-log").textContent'), /ログ #116/);
    await workerEvaluate('chrome.storage.local.set({ lensHistory: { version: 1, enabled: true, records: [null], deletedIds: [] } })');
    await wait(async () => (await status()).includes('履歴の形式を読み取れません'), 'corrupt state guard');
    assert.equal(await browser.evaluate('root.querySelector("[data-key=historyEnabled]").disabled'), true);
    await browser.click('root.querySelector("[data-action=history-retry]")');
    await wait(async () => (await status()).includes('読み込めません'), 'corrupt read refusal');
    assert.deepEqual((await readStorage()).lensHistory.records, [null], 'invalid data must not be overwritten automatically');
  });
});
