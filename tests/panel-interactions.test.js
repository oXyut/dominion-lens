import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromeExecutable, launchBrowser } from './helpers/browser.mjs';

const executable = chromeExecutable();
test('Panel number input operations in an isolated real browser', {
  skip: executable ? false : 'Chrome/Chromium unavailable; set CHROME_BIN to run Panel operation tests', timeout: 60000
}, async t => {
  const browser = await launchBrowser(executable);
  t.after(() => browser.close());
  t.diagnostic(`Panel browser: ${(await browser.command('Browser.getVersion')).product}`);
  for (const file of ['catalog', 'analysis', 'view']) {
    await browser.evaluate(await readFile(new URL(`../extension/lib/${file}.js`, import.meta.url), 'utf8'));
  }
  await browser.evaluate(`
    document.body.innerHTML = '<button id="outside">Outside the panel</button><div id="host"></div>';
    window.fixture = (turn = 1) => ({ status: 'ready', turn,
      players: [{ index: 0, name: 'Sample player', isMe: true }],
      logs: [
        { index: 0, type: 'STARTS_WITH', player: 0, cards: [{ name: 'Copper', count: 7 }] },
        { index: 1, type: 'STARTS_WITH', player: 0, cards: [{ name: 'Estate', count: 3 }] },
        ...Array.from({ length: turn - 1 }, (_, i) => ({ index: i + 2, type: 'GAIN', player: 0, cards: [{ name: 'Silver', count: 1 }] }))
      ],
      supply: ['Chapel', 'Village', 'Smithy', 'Witch'].map(name => ({ ...DominionLens.card(name), remaining: 11 - turn })),
      metadata: {}
    });
    window.resetPanel = (key, value = 5) => {
      document.getElementById('host').remove();
      const host = document.createElement('div'); host.id = 'host'; document.body.append(host);
      window.changes = [];
      window.panel = new DominionLens.Panel(host, { settings: { tab: key === 'budget' ? 'kingdom' : 'deck', [key]: value },
        onChange: settings => changes.push(structuredClone(settings)) });
      panel.update(fixture()); window.root = panel.root;
      window.input = root.querySelector('[data-key="' + key + '"]'); input.focus();
    };
    window.inspect = () => ({
      status: root.querySelector('.status').textContent,
      text: root.querySelector('main').textContent,
      value: root.querySelector('input[type="number"]')?.value,
      sameInput: root.querySelector('input[type="number"]') === input,
      active: root.activeElement === input,
      owned: root.querySelector('.stat.primary .number')?.textContent,
      chance: [...root.querySelectorAll('.card-row')].find(row => row.textContent.includes('Silver'))?.querySelector('.chance').textContent,
      settings: structuredClone(panel.settings), changes: changes.length
    });
  `);

  for (const key of ['budget', 'draws']) {
    await t.test(`${key}: unchanged blur immediately displays a single received snapshot`, async () => {
      await browser.evaluate(`resetPanel('${key}'); panel.update(fixture(2));`);
      const editing = await browser.evaluate('inspect()');
      assert.match(editing.status, /第1ターン/);
      assert.equal(editing.sameInput, true);
      assert.equal(editing.active, true);
      assert.equal(editing.value, '5');
      await browser.click('document.getElementById("outside")');
      const finished = await browser.evaluate('inspect()');
      assert.match(finished.status, /第2ターン/);
      assert.equal(finished.changes, 0, 'blur without a setting change must not save settings');
      if (key === 'budget') assert.match(finished.text, /残り9枚/);
      else { assert.equal(finished.owned, '11枚'); assert.equal(finished.chance, '45.5%'); }
    });

    await t.test(`${key}: multiple pending snapshots coalesce to the latest`, async () => {
      await browser.evaluate(`resetPanel('${key}'); panel.update(fixture(2)); panel.update(fixture(3));`);
      assert.match((await browser.evaluate('inspect()')).status, /第1ターン/);
      await browser.click('document.getElementById("outside")');
      const finished = await browser.evaluate('inspect()');
      assert.match(finished.status, /第3ターン/);
      if (key === 'budget') { assert.match(finished.text, /残り8枚/); assert.doesNotMatch(finished.text, /残り9枚/); }
      else { assert.equal(finished.owned, '12枚'); assert.equal(finished.chance, '68.2%'); }
    });

    await t.test(`${key}: native typing, cursor movement and changed blur keep the setting and latest data`, async () => {
      await browser.evaluate(`resetPanel('${key}'); input.select();`);
      await browser.command('Input.insertText', { text: '1' });
      await browser.evaluate('panel.update(fixture(2));');
      await browser.key('ArrowLeft', 'ArrowLeft', 37);
      await browser.command('Input.insertText', { text: '2' });
      await browser.evaluate('panel.update(fixture(3));');
      const editing = await browser.evaluate('inspect()');
      assert.equal(editing.value, '21');
      assert.equal(editing.sameInput, true);
      assert.equal(editing.active, true);
      assert.match(editing.status, /第1ターン/);
      await browser.click('document.getElementById("outside")');
      const finished = await browser.evaluate('inspect()');
      assert.equal(finished.settings[key], key === 'draws' ? 20 : 21);
      assert.equal(finished.value, key === 'draws' ? '20' : '21');
      assert.equal(finished.changes, 1);
      assert.match(finished.status, /第3ターン/);
    });

    await t.test(`${key}: keyboard Tab commits a changed value with pending data`, async () => {
      await browser.evaluate(`resetPanel('${key}'); input.select();`);
      await browser.command('Input.insertText', { text: '2' });
      await browser.evaluate('panel.update(fixture(2));');
      await browser.key('Tab', 'Tab', 9);
      const result = await browser.evaluate('inspect()');
      assert.equal(result.settings[key], 2);
      assert.match(result.status, /第2ターン/);
      assert.equal(result.changes, 1);
      if (key === 'budget') { assert.match(result.text, /Chapel/); assert.doesNotMatch(result.text, /Village/); }
      else assert.equal(result.chance, '18.2%');
    });

    await t.test(`${key}: clearing the field applies the existing empty value rules`, async () => {
      await browser.evaluate(`resetPanel('${key}'); input.select();`);
      await browser.key('Backspace', 'Backspace', 8);
      await browser.evaluate('panel.update(fixture(2));');
      assert.equal((await browser.evaluate('inspect()')).value, '');
      await browser.click('document.getElementById("outside")');
      const result = await browser.evaluate('inspect()');
      assert.equal(result.settings[key], key === 'budget' ? '' : 5);
      assert.match(result.status, /第2ターン/);
    });

    await t.test(`${key}: rated, waiting and error states interrupt editing and discard pending ready data`, async () => {
      for (const status of ['rated', 'waiting', 'error']) {
        await browser.evaluate(`resetPanel('${key}'); panel.update(fixture(3)); panel.update({ status: '${status}', message: 'Sample ${status}' });`);
        const result = await browser.evaluate('inspect()');
        assert.equal(result.value, undefined);
        assert.doesNotMatch(result.status, /第[13]ターン/);
        assert.doesNotMatch(result.text, /所有カード.*10枚|残り[89]枚/);
        assert.match(result.text, new RegExp(`Sample ${status}`));
        await browser.click('document.getElementById("outside")');
        assert.deepEqual(await browser.evaluate('inspect()'), result);
        await browser.evaluate('panel.update(fixture(2));');
        assert.match((await browser.evaluate('inspect()')).status, /第2ターン/);
      }
    });
  }

  await t.test('unchanged keyboard Tab flushes pending data and repeated updates continue normally', async () => {
    await browser.evaluate("resetPanel('budget'); panel.update(fixture(2));");
    await browser.key('Tab', 'Tab', 9);
    assert.match((await browser.evaluate('inspect()')).status, /第2ターン/);
    await browser.evaluate('panel.update(fixture(3));');
    assert.match((await browser.evaluate('inspect()')).status, /第3ターン/);
    await browser.evaluate("input = root.querySelector('[data-key=budget]'); input.focus(); panel.update(fixture(4));");
    await browser.click('document.getElementById("outside")');
    assert.match((await browser.evaluate('inspect()')).status, /第4ターン/);
  });

  await t.test('panel tab clicks preserve both unchanged and changed input settings', async () => {
    for (const changed of [false, true]) {
      await browser.evaluate("resetPanel('budget'); panel.update(fixture(2));");
      if (changed) {
        await browser.evaluate('input.select();');
        await browser.command('Input.insertText', { text: '2' });
      }
      await browser.click('root.querySelector("#tab-deck")');
      const result = await browser.evaluate('inspect()');
      assert.equal(result.settings.tab, 'deck');
      assert.equal(result.settings.budget, changed ? 2 : 5);
      assert.match(result.status, /第2ターン/);
      assert.equal(result.owned, '11枚');
    }
  });

  await t.test('checkbox clicks leaving the number input apply the filter with the latest data', async () => {
    await browser.evaluate("resetPanel('budget'); panel.update(fixture(2));");
    await browser.click('root.querySelector("[data-key=basic]")');
    const result = await browser.evaluate('inspect()');
    assert.equal(result.settings.basic, true);
    assert.match(result.status, /第2ターン/);
  });

  await t.test('an update during a pressed panel button waits for its action, and a canceled click flushes on release', async () => {
    for (const canceled of [false, true]) {
      await browser.evaluate("resetPanel('budget'); panel.update(fixture(2));");
      const point = await browser.evaluate("(() => { const r = root.querySelector('#tab-deck').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
      await browser.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await browser.evaluate('panel.update(fixture(3));');
      assert.match((await browser.evaluate('inspect()')).status, /第1ターン/);
      await browser.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...(canceled ? { x: 300, y: 150 } : point), button: 'left', clickCount: 1 });
      await browser.evaluate('new Promise(resolve => setTimeout(resolve, 0))');
      const result = await browser.evaluate('inspect()');
      assert.match(result.status, /第3ターン/);
      assert.equal(result.settings.tab, canceled ? 'kingdom' : 'deck');
    }
  });

  await t.test('keyboard focus on a panel control survives the deferred render', async () => {
    await browser.evaluate("resetPanel('draws'); panel.update(fixture(2));");
    await browser.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
    await browser.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
    await browser.evaluate('new Promise(resolve => setTimeout(resolve, 0))');
    assert.deepEqual(await browser.evaluate("({ turn: root.querySelector('.status').textContent, zone: root.activeElement?.dataset.value })"), { turn: '友達・CPU戦 · 第2ターン', zone: 'discard' });
  });
});
