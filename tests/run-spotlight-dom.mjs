import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const fixtureDir = join(process.cwd(), 'tests/fixtures');
const tempDir = mkdtempSync(join(tmpdir(), 'cityu-spotlight-'));
const bundlePath = join(tempDir, 'spotlight-test.js');
const artifactDir = '/opt/cursor/artifacts';
const screenshotPath = join(artifactDir, 'aims-spotlight.png');
const debugPort = 9333;

await esbuild.build({
  entryPoints: ['tests/spotlight-harness-entry.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  outfile: bundlePath
});

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8']
]);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const filePath = url.pathname === '/spotlight-test.js'
    ? bundlePath
    : join(fixtureDir, decodeURIComponent(url.pathname.replace(/^\//, '')));
  try {
    const body = readFileSync(filePath);
    response.writeHead(200, { 'content-type': types.get(extname(filePath)) ?? 'text/plain; charset=utf-8' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
mkdirSync(artifactDir, { recursive: true });

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=1280,800',
  `--user-data-dir=${join(tempDir, 'chrome-profile')}`,
  `--remote-debugging-port=${debugPort}`,
  `http://127.0.0.1:${port}/aims-page.html`
], { stdio: 'ignore' });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTarget() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error('Chrome DevTools target did not appear');
}

function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(undefined));
    ws.addEventListener('error', () => reject(new Error('DevTools socket failed')));
  });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  });
  return {
    ready: opened,
    send(method, params = {}) {
      const id = ++nextId;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      ws.close();
    }
  };
}

try {
  const target = await waitForTarget();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Runtime.enable');
  await client.send('Page.enable');

  let report = null;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const evaluation = await client.send('Runtime.evaluate', {
      expression: `document.getElementById('result')?.textContent || ''`,
      returnByValue: true
    });
    const text = evaluation.result?.value ?? '';
    if (text.trim().startsWith('{')) {
      report = JSON.parse(text);
      break;
    }
    await sleep(100);
  }

  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));

  if (!report) {
    const debug = await client.send('Runtime.evaluate', {
      expression: `JSON.stringify({ href: location.href, ready: document.readyState, errors: window.__pageErrors || [], text: document.body?.innerText?.slice(0, 800) || '' })`,
      returnByValue: true
    }).catch((error) => ({ result: { value: error.message } }));
    console.error(debug?.result?.value ?? 'Spotlight fixture did not report a result');
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exitCode = 1;
    } else {
      console.log(`Screenshot: ${screenshotPath}`);
    }
  }
  client.close();
} finally {
  chrome.kill();
  server.close();
}
