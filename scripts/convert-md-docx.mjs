// 単一の Markdown を Word(.docx) に変換する汎用スクリプト（docs/ 配下に限定しない）。
// 内部提案など、納品ドキュメント群とは独立したファイルの変換に使う。
//
// 使い方:
//   node scripts/convert-md-docx.mjs <input.md> <output.docx>

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';
import HTMLtoDOCX from '@turbodocx/html-to-docx';

const md = new MarkdownIt({ html: true, linkify: true });

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  let meta = {};
  try { meta = yaml.load(m[1]) || {}; } catch { /* noop */ }
  return { meta, body: m[2] };
}

function metaTable(meta) {
  const rows = [
    ['文書ID', meta.doc_id], ['版数', meta.version], ['ステータス', meta.status],
    ['プロジェクト', meta.project], ['作成者', meta.author], ['承認者', meta.approved_by],
    ['作成日', meta.created], ['更新日', meta.updated],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!rows.length) return '';
  const fmt = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
  const trs = rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${md.utils.escapeHtml(fmt(v))}</td></tr>`).join('');
  return `<table border="1" cellpadding="4" style="border-collapse:collapse">${trs}</table>`;
}

async function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) { console.error('使い方: node scripts/convert-md-docx.mjs <input.md> <output.docx>'); process.exit(1); }

  const raw = await readFile(input, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const title = meta.title || basename(input).replace(/\.md$/, '');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<h1>${md.utils.escapeHtml(title)}</h1>
${metaTable(meta)}
${md.render(body)}
</body></html>`;

  const buffer = await HTMLtoDOCX(html, null, {
    title,
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, buffer);
  console.log('✓ 出力:', output);
}

main().catch((e) => { console.error(e); process.exit(1); });
