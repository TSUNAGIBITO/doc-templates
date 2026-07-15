// MD（正本） → Word(.docx) 変換スクリプト
// 納品形式が Microsoft 365（Word）指定の案件向け。docs/ 配下の *.md を dist-docx/ に .docx 出力する。
// pandoc 非依存（@turbodocx/html-to-docx を使用）。
//
// 使い方:
//   npm run export:docx                  全文書を変換
//   node scripts/export-docx.mjs docs/babysitterETicket   サブパスのみ変換
//
// 注意: Mermaid 図はテキスト（コードブロック）として出力されます。図の画像化が必要な納品物は
// 別途 PNG 等を貼付してください。

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';
import HTMLtoDOCX from '@turbodocx/html-to-docx';
import { extractMermaid, pngPathFor, ensurePng } from './render-mermaid.mjs';

const NO_DIAGRAMS = process.argv.includes('--no-diagrams');

// 本文中の ```mermaid フェンスを PNG 画像(<img>)に置換する。
// 画像が無ければ描画を試み、失敗時はコードのまま（フォールバック）残す。
async function inlineMermaid(body) {
  const blocks = extractMermaid(body);
  if (!blocks.length || NO_DIAGRAMS) return body;
  let result = body;
  for (const code of blocks) {
    let png = pngPathFor(code);
    try {
      if (!existsSync(png)) await ensurePng(code);
    } catch {
      continue; // 描画失敗 → コードのまま
    }
    if (!existsSync(png)) continue;
    const b64 = (await readFile(png)).toString('base64');
    const img = `\n<p><img src="data:image/png;base64,${b64}" alt="diagram" /></p>\n`;
    // 該当フェンスを1つだけ置換
    const fence = '```mermaid\n' + code;
    const idx = result.indexOf(fence);
    if (idx === -1) continue;
    const end = result.indexOf('```', idx + fence.length);
    if (end === -1) continue;
    result = result.slice(0, idx) + img + result.slice(end + 3);
  }
  return result;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'docs');
const OUT = join(ROOT, 'dist-docx');

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

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (extname(entry.name) === '.md') out.push(p);
  }
  return out;
}

// 本文の表（markdown 由来）に罫線を付ける。th/td/table にインライン枠線を注入。
function borderizeTables(html) {
  return html
    .replace(/<table>/g, '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;">')
    .replace(/<th>/g, '<th style="border:1px solid #555;padding:3px 6px;background:#eef1f6;text-align:left;">')
    .replace(/<th style="/g, '<th style="border:1px solid #555;padding:3px 6px;background:#eef1f6;')
    .replace(/<td>/g, '<td style="border:1px solid #555;padding:3px 6px;vertical-align:top;">')
    .replace(/<td style="/g, '<td style="border:1px solid #555;padding:3px 6px;vertical-align:top;');
}

// 本文中で最大の列数を数える（<tr> 内の <td>/<th> 数の最大）。
function maxColumns(html) {
  let max = 0;
  for (const m of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const c = (m[1].match(/<t[dh][ >]/g) || []).length;
    if (c > max) max = c;
  }
  return max;
}

async function main() {
  const sub = process.argv[2] ? join(ROOT, process.argv[2]) : SRC;
  if (!existsSync(sub)) { console.error('対象が見つかりません:', sub); process.exit(1); }

  const files = await walk(sub);
  let n = 0;
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const title = meta.title || file.split(sep).pop().replace(/\.md$/, '');
    const bodyWithImages = await inlineMermaid(body);
    const rendered = md.render(bodyWithImages);
    const cols = maxColumns(rendered);
    // 列数が多い表を含む文書は横向き＋小さめフォント＋余白縮小（日本語の1文字縦積みを防ぐ）
    const wide = cols >= 6;
    const contentHtml = borderizeTables(rendered);
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<h1>${md.utils.escapeHtml(title)}</h1>
${metaTable(meta)}
${contentHtml}
</body></html>`;

    const buffer = await HTMLtoDOCX(html, null, {
      title,
      orientation: wide ? 'landscape' : 'portrait',
      margins: wide
        ? { top: 720, right: 540, bottom: 720, left: 540 }
        : { top: 1134, right: 1134, bottom: 1134, left: 1134 },
      font: 'Yu Gothic',
      fontSize: wide ? 16 : 20, // half-points（wide=8pt / 通常=10pt）
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    });

    const rel = relative(SRC, file).replace(/\.md$/, '.docx');
    const outFile = join(OUT, rel);
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, buffer);
    n++;
  }
  console.log(`✓ ${n} 文書を dist-docx/ に .docx 出力しました`);
}

main().catch((e) => { console.error(e); process.exit(1); });
