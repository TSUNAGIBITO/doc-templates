// Mermaid 図の描画にはローカルの Google Chrome / Chromium を使うため、
// puppeteer 同梱の Chromium ダウンロードは行わない（CI/Vercel のビルド高速化・失敗回避）。
// 描画時の実行ファイルは scripts/puppeteer-config.json の executablePath を参照。
module.exports = {
  skipDownload: true,
};
