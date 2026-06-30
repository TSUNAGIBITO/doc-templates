// Mermaid 図の画像化（PNG）スクリプト
// docs/ 配下の *.md にある ```mermaid フェンスを抽出し、PNG に描画して dist-assets/diagrams/ に出力する。
// 描画は mermaid-cli(mmdc) が担い、ブラウザはシステムの Google Chrome を使用（scripts/puppeteer-config.json）。
// 出力ファイル名は図ソースの sha1 ハッシュ（決定的）。同じ図は再描画しない。
// docx 変換（export-docx.mjs）がこのハッシュで PNG を参照して図を埋め込む。
//
// 使い方:  npm run render:diagrams [docs/サブパス]

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'docs');
const OUTDIR = join(ROOT, 'dist-assets', 'diagrams');
const PUP = join(__dirname, 'puppeteer-config.json');
const MMDC = join(ROOT, 'node_modules', '.bin', 'mmdc');

export function diagramHash(code) {
  return createHash('sha1').update(code.trim()).digest('hex').slice(0, 16);
}

export function extractMermaid(md) {
  const blocks = [];
  const re = /```mermaid\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md)) !== null) blocks.push(m[1].replace(/\s+$/, ''));
  return blocks;
}

export function pngPathFor(code) {
  return join(OUTDIR, `${diagramHash(code)}.png`);
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (extname(e.name) === '.md') out.push(p);
  }
  return out;
}

export async function ensurePng(code) {
  const out = pngPathFor(code);
  if (existsSync(out)) return { out, cached: true };
  await mkdir(OUTDIR, { recursive: true });
  const tmp = join(OUTDIR, `_${diagramHash(code)}.mmd`);
  await writeFile(tmp, code, 'utf8');
  // -b white: 背景白（docx 貼付向け） / -s 2: 解像度2倍
  await execFileP(MMDC, ['-i', tmp, '-o', out, '-p', PUP, '-b', 'white', '-s', '2'], {
    cwd: ROOT,
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true' },
  });
  return { out, cached: false };
}
const renderOne = ensurePng;

async function main() {
  if (!existsSync(MMDC)) {
    console.error('mmdc が見つかりません。`npm install` を実行してください。');
    process.exit(1);
  }
  const sub = process.argv[2] ? join(ROOT, process.argv[2]) : SRC;
  await mkdir(OUTDIR, { recursive: true });
  const files = await walk(sub);

  let total = 0, rendered = 0, cached = 0, failed = 0;
  for (const file of files) {
    const blocks = extractMermaid(await readFile(file, 'utf8'));
    for (const code of blocks) {
      total++;
      try {
        const r = await renderOne(code);
        r.cached ? cached++ : rendered++;
      } catch (e) {
        failed++;
        console.warn(`✗ 描画失敗 (${file}):`, (e.stderr || e.message || '').toString().split('\n')[0]);
      }
    }
  }
  console.log(`✓ Mermaid図: 合計${total} / 新規描画${rendered} / キャッシュ${cached} / 失敗${failed}`);
  console.log(`  出力先: dist-assets/diagrams/`);
}

// 直接実行された場合のみ描画を走らせる（export-docx.mjs からの import 時は実行しない）
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
