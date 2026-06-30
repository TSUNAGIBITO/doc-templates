// MD（正本） → HTML 変換ビルドスクリプト
// docs/ 配下の *.md を再帰的に読み、frontmatter を解析して dist/ に HTML を出力する。
// Mermaid フェンス（```mermaid）はそのまま <pre class="mermaid"> に変換し、CDN の mermaid.js で描画。
//
// 使い方:
//   node scripts/build.mjs           1回ビルド
//   node scripts/build.mjs --watch   docs/ を監視して自動ビルド

import { readdir, readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { dirname, join, relative, extname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'docs');
const OUT = join(ROOT, 'dist');
const CSS = join(ROOT, 'assets', 'style.css');

const STATUS_LABEL = {
  draft: '作成中',
  review: 'レビュー中',
  approved: '承認済',
};

// YAML が日付を Date 化するため、YYYY-MM-DD に整形して表示する
function fmtVal(v) {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v);
}

// --- Markdown レンダラ -------------------------------------------------------
const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
md.use(anchor, { permalink: anchor.permalink.headerLink(), level: [2, 3] });

// ```mermaid を <pre class="mermaid"> に変換（コードハイライトせず素のテキストを残す）
const defaultFence = md.renderer.rules.fence.bind(md.renderer.rules);
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if ((token.info || '').trim() === 'mermaid') {
    return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

// --- frontmatter 解析 --------------------------------------------------------
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  let meta = {};
  try {
    meta = yaml.load(m[1]) || {};
  } catch (e) {
    console.warn('frontmatter 解析失敗:', e.message);
  }
  return { meta, body: m[2] };
}

// --- TOC 生成（h2/h3 を抽出） ------------------------------------------------
function buildToc(tokens) {
  const items = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open' && (t.tag === 'h2' || t.tag === 'h3')) {
      const inline = tokens[i + 1];
      const text = inline.children
        .filter((c) => c.type === 'text' || c.type === 'code_inline')
        .map((c) => c.content)
        .join('');
      const id = t.attrGet('id');
      items.push({ level: t.tag === 'h2' ? 2 : 3, text, id });
    }
  }
  if (!items.length) return '';
  const lis = items
    .map((it) => `<li class="toc-l${it.level}"><a href="#${it.id}">${md.utils.escapeHtml(it.text)}</a></li>`)
    .join('\n');
  return `<nav class="toc"><div class="toc-title">目次</div><ul>${lis}</ul></nav>`;
}

// --- HTML レイアウト ---------------------------------------------------------
function layout({ meta, contentHtml, toc, cssHref, indexHref }) {
  const status = (meta.status || 'draft').toLowerCase();
  const statusJa = STATUS_LABEL[status] || status;
  const metaRows = [
    ['文書ID', meta.doc_id],
    ['版数', meta.version],
    ['プロジェクト', meta.project],
    ['作成者', meta.author],
    ['レビュー', meta.reviewers],
    ['承認者', meta.approved_by],
    ['作成日', meta.created],
    ['更新日', meta.updated],
  ]
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<div class="meta-item"><span class="meta-k">${k}</span><span class="meta-v">${md.utils.escapeHtml(fmtVal(v))}</span></div>`)
    .join('');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${md.utils.escapeHtml(meta.title || '無題')}</title>
<link rel="stylesheet" href="${cssHref}">
</head>
<body>
<header class="doc-header">
  <div class="doc-header-inner">
    <a class="home-link" href="${indexHref}">← 一覧</a>
    <span class="status status-${status}">${statusJa}</span>
  </div>
  <h1 class="doc-title">${md.utils.escapeHtml(meta.title || '無題')}</h1>
  <div class="meta-grid">${metaRows}</div>
</header>
<div class="layout">
  ${toc}
  <main class="content">
${contentHtml}
  </main>
</div>
<footer class="doc-footer">Generated from Markdown · doc-templates</footer>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' });
</script>
</body>
</html>`;
}

// --- ファイル走査 ------------------------------------------------------------
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (extname(entry.name) === '.md') out.push(p);
  }
  return out;
}

function relHref(fromFile, toFile) {
  const rel = relative(dirname(fromFile), toFile).split(sep).join('/');
  return rel.startsWith('.') ? rel : './' + rel;
}

// --- ビルド本体 --------------------------------------------------------------
async function build() {
  if (!existsSync(SRC)) {
    console.error('docs/ が見つかりません');
    process.exit(1);
  }
  const files = await walk(SRC);
  await mkdir(OUT, { recursive: true });
  await copyFile(CSS, join(OUT, 'style.css'));

  const indexPath = join(OUT, 'index.html');
  const pages = [];

  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const env = {};
    const tokens = md.parse(body, env);
    const toc = buildToc(tokens);
    const contentHtml = md.renderer.render(tokens, md.options, env);

    const rel = relative(SRC, file).replace(/\.md$/, '.html');
    const outFile = join(OUT, rel);
    await mkdir(dirname(outFile), { recursive: true });

    const html = layout({
      meta,
      contentHtml,
      toc,
      cssHref: relHref(outFile, join(OUT, 'style.css')),
      indexHref: relHref(outFile, indexPath),
    });
    await writeFile(outFile, html, 'utf8');

    pages.push({
      title: meta.title || basename(file, '.md'),
      doc_id: meta.doc_id || '',
      status: (meta.status || 'draft').toLowerCase(),
      version: meta.version ? fmtVal(meta.version) : '',
      updated: meta.updated ? fmtVal(meta.updated) : '',
      category: relative(SRC, dirname(file)).split(sep).join(' / '),
      href: rel.split(sep).join('/'),
    });
  }

  await writeFile(indexPath, indexHtml(pages), 'utf8');
  console.log(`✓ ${pages.length} 文書を dist/ に出力しました`);
}

function indexHtml(pages) {
  const byCat = {};
  for (const p of pages) (byCat[p.category] ||= []).push(p);
  const cats = Object.keys(byCat).sort();
  const sections = cats
    .map((cat) => {
      const rows = byCat[cat]
        .sort((a, b) => a.href.localeCompare(b.href))
        .map((p) => {
          const statusJa = STATUS_LABEL[p.status] || p.status;
          return `<tr>
  <td><a href="${p.href}">${md.utils.escapeHtml(p.title)}</a></td>
  <td class="c-id">${md.utils.escapeHtml(p.doc_id)}</td>
  <td><span class="status status-${p.status}">${statusJa}</span></td>
  <td class="c-ver">${md.utils.escapeHtml(p.version)}</td>
  <td class="c-date">${md.utils.escapeHtml(p.updated)}</td>
</tr>`;
        })
        .join('\n');
      return `<section class="cat">
  <h2>${md.utils.escapeHtml(cat)}</h2>
  <table class="index-table">
    <thead><tr><th>文書</th><th>文書ID</th><th>状態</th><th>版</th><th>更新日</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ドキュメント一覧</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="doc-header">
  <h1 class="doc-title">ドキュメント一覧</h1>
  <p class="index-lead">${pages.length} 文書 · Markdown 正本から生成</p>
</header>
<div class="layout layout-index">
  <main class="content">
${sections}
  </main>
</div>
<footer class="doc-footer">Generated from Markdown · doc-templates</footer>
</body>
</html>`;
}

// --- watch -------------------------------------------------------------------
async function main() {
  await build();
  if (process.argv.includes('--watch')) {
    console.log('… docs/ を監視中（Ctrl+C で終了）');
    let timer = null;
    watch(SRC, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => build().catch(console.error), 150);
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
