// 通过 CDP 打开页面、收集控制台错误、截图 —— 用于本地验证 3D 页面
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || '9333';
const url = process.argv[2] || 'file:///D:/developing/webdesign/grid-pillars/index.html';
const out = process.argv[3] || 'D:/developing/webdesign/grid-pillars/.dsh/shot.png';
const waitMs = parseInt(process.argv[4] || '5000', 10);
const W = parseInt(process.argv[5] || '1600', 10);
const H = parseInt(process.argv[6] || '900', 10);
const probe = process.argv[7] || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://127.0.0.1:${PORT}`;

async function getJSON(p) {
  const r = await fetch(base + p);
  return await r.json();
}

(async () => {
  let ver = null;
  for (let i = 0; i < 80; i++) {
    try { ver = await getJSON('/json/version'); break; } catch (e) { await sleep(400); }
  }
  if (!ver) { console.error('CDP not reachable on ' + PORT); process.exit(2); }
  console.log('browser: ' + ver['Browser']);

  const t = await (await fetch(base + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
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
      const txt = (m.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ');
      logs.push('[' + m.params.type + '] ' + txt);
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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(waitMs);

  const expression = probe ||
    "JSON.stringify({fatal:(function(){var f=document.querySelector('#fatal');return f&&f.classList.contains('show')?document.querySelector('#fatalMsg').textContent.slice(0,700):null;})(),stats:(document.querySelector('#stats')||{}).textContent,mode:(document.querySelector('#modeNow')||{}).textContent,icons:(document.querySelector('#iconCount')||{}).textContent})";
  const ev = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  console.log('probe: ' + JSON.stringify(ev.result && ev.result.value));
  await sleep(1400);

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('screenshot: ' + out + ' ' + fs.statSync(out).size + ' bytes');

  console.log('--- console (' + logs.length + ') ---');
  logs.slice(0, 50).forEach((l) => console.log(l));
  try { await fetch(base + '/json/close/' + t.id); } catch (e) { /* ignore */ }
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('ERR ' + (e && e.stack || e)); process.exit(1); });
