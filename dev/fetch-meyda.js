// 从 npm 取 meyda 的浏览器 UMD 包，落到 vendor/（只取 min.js，不装 node_modules）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const VERSION = '5.6.3';
const ENTRY = 'package/dist/web/meyda.min.js';
const OUT_DIR = path.resolve(__dirname, '..', 'vendor');
const OUT = path.join(OUT_DIR, 'meyda.min.js');

function readTarEntries(buf) {
  const entries = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.toString('latin1', off, off + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(buf.toString('latin1', off + 124, off + 136).replace(/\0|\s/g, ''), 8) || 0;
    const dataStart = off + 512;
    entries.push({ name, size, dataStart });
    off = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

(async () => {
  const res = await fetch(`https://registry.npmjs.org/meyda/-/meyda-${VERSION}.tgz`);
  if (!res.ok) throw new Error('registry HTTP ' + res.status);
  const tgz = Buffer.from(await res.arrayBuffer());
  const tar = zlib.gunzipSync(tgz);
  const entry = readTarEntries(tar).find((e) => e.name === ENTRY);
  if (!entry) throw new Error('entry not found: ' + ENTRY);

  const js = tar.subarray(entry.dataStart, entry.dataStart + entry.size);
  const head = js.toString('latin1', 0, 400);
  if (!/Meyda\s*=\s*t\(\)|\.Meyda=/.test(head)) throw new Error('unexpected bundle head');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, js);
  fs.writeFileSync(
    path.join(OUT_DIR, 'README.md'),
    `# vendor/\n\nmeyda ${VERSION} — MIT License — https://github.com/meyda/meyda\n\n` +
    `来源：npm tarball 中的 \`${ENTRY}\`（浏览器 UMD 包，暴露 \`globalThis.Meyda\`）。\n` +
    `只保留这一个文件；不引入 node_modules、不引入构建步骤。\n` +
    `用途：实时音频特征提取（FFT / 幅度谱 / RMS），供「音乐响应」模式使用。\n`
  );
  console.log(`ok: vendor/meyda.min.js  ${(js.length / 1024).toFixed(1)} KB  (meyda ${VERSION})`);
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
