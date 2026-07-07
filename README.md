# 公共案件 ドキュメントテンプレート

要件定義書・技術設計書（API設計書・画面設計書・DB設計書ほか）を **Markdown を正本** として作成し、
GitHub で版管理しながら **HTML / Word(.docx) を自動生成** するためのテンプレート集です。
公共・自治体案件で求められる標準的な成果物セットを一通り収録しています。

> このリポジトリは **汎用テンプレートのみ** を収録しています。実案件のデータは含みません。

## 特徴

- **Markdown が正本** — 差分レビュー（PR）しやすく、誰でも編集できる
- **HTML を自動生成** — `npm run build` または GitHub Actions（Pages）で閲覧用 HTML を生成
- **Word(.docx) を自動生成** — 納品形式が Microsoft 365 指定の案件向け（`npm run export:docx`）
- **図は Mermaid** — 画面遷移図・ER図・システム構成図・シーケンス図を MD 内テキストで管理（差分が残る）。`.docx` には画像として自動埋め込み
- **メタ情報を frontmatter で統一** — 文書ID・版数・ステータス・承認者を機械可読に管理
- **改訂履歴を各文書に内蔵** — 公共案件で必須の版管理を文書単位で担保

## 収録テンプレート

| 分類 | 主なテンプレート |
|------|------------------|
| 00 プロジェクト管理 | プロジェクト計画書・WBS・課題管理表・議事録・成果物一覧・リスク管理表 |
| 10 要件定義 | 要件定義書・業務要件定義書・機能一覧・非機能要件定義書・機能要件適合表 |
| 20 基本設計 | 基本設計書・システム構成図・画面設計書・画面遷移図・帳票設計書 |
| 30 詳細設計 | API設計書・DB設計書・データ定義表・バッチ設計書・パラメータ設定表 |
| 40 テスト | テスト計画書・テスト仕様書・脆弱性診断結果報告書 |
| 50 移行・運用 | 移行設計書・運用設計書・運用保守計画書/報告書・障害対応結果報告書・保守要件定義書・データ消去報告書 |
| 60 セキュリティ・公共特有 | セキュリティ要件定義書・個人情報保護対応書・調達/要件適合表 |
| 70 マニュアル・研修 | 操作マニュアル・利用者向け研修資料 |

## ディレクトリ構成

```
doc-templates/
├── docs/templates/          ← テンプレート（コピーして使う正本）
├── scripts/build.mjs        ← MD → HTML 変換
├── scripts/export-docx.mjs  ← MD → Word(.docx) 変換（Mermaid図を画像埋め込み）
├── scripts/render-mermaid.mjs ← Mermaid → PNG 画像化
├── assets/style.css         ← HTML 用スタイル
├── dist/                    ← 生成 HTML（gitignore）
└── .github/workflows/       ← CI（HTML ビルド & GitHub Pages 公開）
```

実案件では `docs/templates/` をコピーして `docs/<案件名>/` を作ると、テンプレートを残したまま運用できます。

## 使い方

```bash
npm install      # 初回のみ
npm run build    # docs/ 配下を dist/ に HTML 出力（dist/index.html が一覧）
npm run watch    # 変更を監視して自動ビルド（任意）
```

### Word(.docx) を生成する

```bash
npm run export:docx                  # 全文書を dist-docx/ に .docx 出力
npm run export:docx -- docs/<サブパス>  # 特定フォルダのみ
```

MD を正本に Git で版管理し（仕様書の「版管理」要件を充足）、納品時に .docx を生成する運用を想定しています。

### Mermaid 図を画像化する（.docx 埋め込み用）

```bash
npm run render:diagrams              # 全 .md の ```mermaid を PNG 化
```

- 描画はローカルの **Google Chrome / Chromium** を使用します。`scripts/puppeteer-config.json` の
  `executablePath` を実行環境に合わせて変更してください。
- `npm run export:docx` は未生成の図を自動描画して .docx に画像として埋め込みます（`--no-diagrams` で無効化）。

### 単一ファイルを .docx 化する（docs/ 外も可）

```bash
npm run docx:one -- <input.md> <output.docx>
```

`docs/` 配下に限定されない汎用変換。提案書・内部メモなど、納品ドキュメント群と分けて管理したいファイルの Word 化に使えます。

### 限定公開する（Basic 認証・任意）

Vercel 等にデプロイして **認証を通した人だけに閲覧**させたい場合、同梱の `middleware.js`（Vercel Edge Middleware）を使います。

- 既定は**無効**（環境変数が無ければ通常公開）。
- Vercel のプロジェクト環境変数に `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` を設定すると Basic 認証が有効化されます。
- 守秘が必要な案件データを、検索・一般公開せず関係者限定で共有する用途に。

## frontmatter 仕様

| キー | 説明 | 例 |
|------|------|----|
| `title` | 文書タイトル | 要件定義書 |
| `doc_id` | 文書ID（一意） | REQ-001 |
| `version` | 版数 | 1.0.0 |
| `status` | draft / review / approved | review |
| `project` | プロジェクト名 | ○○システム再構築 |
| `author` / `reviewers` / `approved_by` | 作成者 / レビュー / 承認者 | — |
| `created` / `updated` | 作成日 / 更新日 | 2026-06-29 |

## ライセンス

MIT
