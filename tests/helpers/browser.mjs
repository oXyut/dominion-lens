import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function chromeExecutable() {
  if (process.env.CHROME_BIN) {
    if (!existsSync(process.env.CHROME_BIN)) throw new Error('CHROME_BIN does not exist');
    return process.env.CHROME_BIN;
  }
  const names = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...String(process.env.PATH || '').split(path.delimiter).flatMap(dir => names.map(name => path.join(dir, name)))
  ].find(file => existsSync(file));
}

// Use a separate process and temporary profile; never connect to an existing browser.
export async function launchBrowser(executable) {
  const profile = await mkdtemp(path.join(tmpdir(), 'dominion-lens-panel-'));
  const child = spawn(executable, [
    '--headless', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--window-size=1280,1000',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  async function close() {
    socket?.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    await rm(profile, { recursive: true, force: true });
  }
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 10000);
      let output = '';
      child.stderr.on('data', data => {
        output = (output + data).slice(-8000);
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited with ${code}: ${output}`)); });
    });
    socket = new WebSocket(endpoint);
    await once(socket, 'open');
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data), request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Chrome disconnected')); }
      pending.clear();
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params) => send(method, params, sessionId);
    await command('Page.enable');
    const evaluate = async expression => {
      const { result, exceptionDetails } = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    };
    const click = async expression => {
      const { x, y } = await evaluate(`(() => { const node = ${expression}; node.scrollIntoView(); const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await evaluate('new Promise(resolve => setTimeout(resolve, 0))');
    };
    const key = async (key, code = key, windowsVirtualKeyCode = 0) => {
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
      await evaluate('new Promise(resolve => setTimeout(resolve, 0))');
    };
    return { evaluate, command, click, key, close };
  } catch (error) {
    await close();
    throw error;
  }
}
