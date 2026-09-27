// 开发用自检：抽出 index.html 里的内联脚本做语法检查（只编译不执行）
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || 'index.html';
const html = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if (!blocks.length) {
  console.log('no inline script found');
  process.exit(1);
}
let bad = 0;
blocks.forEach((m, i) => {
  const code = m[1];
  try {
    // eslint-disable-next-line no-new-func
    new Function(code);
    console.log(`script#${i + 1} OK  (${code.length} chars, ${code.split('\n').length} lines)`);
  } catch (e) {
    bad++;
    console.log(`script#${i + 1} SYNTAX ERROR: ${e.message}`);
  }
});

// 括号/反引号平衡的粗检（辅助定位）
const js = blocks.map(b => b[1]).join('\n');
const count = (s, ch) => s.split(ch).length - 1;
console.log(`braces {}: ${count(js, '{')}/${count(js, '}')}  parens (): ${count(js, '(')}/${count(js, ')')}  backtick: ${count(js, '`')}`);

process.exit(bad ? 1 : 0);
