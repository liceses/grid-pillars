// 复用同一个浏览器实例跑探针：不新开浏览器、不新开 profile、用完浏览器还活着
// 用法: node dev/probe.js <url> <probeFile> [outPng] [waitMs]
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || '9333';
const url = process.argv[2];
const probeFile = process.argv[3];
const outPng = process.argv[4] || '';
const waitMs = parseInt(process.argv[5] || '6000', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://127.0.0.1:${PORT}`;

(async () => {
  let ver;
  try { ver = await (await fetch(base + '/json/version')).json(); }
  catch (e) { console.error('NO-BROWSER: 先跑 dev/live.ps1'); process.exit(2); }
  console.log('browser: ' + ver.Browser);

  const list = await (await fetch(base + '/json/list')).json();
  let target = list.find((t) => t.type === 'page');
  if (!target) target = await (await fetch(base + '/json/new?about:blank', { method: 'PUT' })).json();

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const logs = [];
  const send = (method, params) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push('[' + m.params.type + '] ' + (m.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push('[exception] ' + ((d.exception && d.exception.description) || d.text));
    } else if (m.method === 'Log.entryAdded') {
      logs.push('[' + m.params.entry.level + '] ' + m.params.entry.text);
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: url.startsWith('http') ? url : 'file:///' + url.replace(/\\/g, '/') });
  await sleep(waitMs);

  const expr = fs.readFileSync(probeFile, 'utf8');
  const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (ev.exceptionDetails) {
    const d = ev.exceptionDetails;
    console.log('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text));
  } else {
    console.log('probe: ' + JSON.stringify(ev.result && ev.result.value));
  }
  if (outPng) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(outPng), { recursive: true });
    fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
    console.log('shot: ' + outPng + ' ' + fs.statSync(outPng).size + ' bytes');
  }
  if (logs.length) { console.log('--- console (' + logs.length + ') ---'); logs.slice(0, 20).forEach((l) => console.log(l)); }
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('ERR ' + (e && e.stack || e)); process.exit(1); });
