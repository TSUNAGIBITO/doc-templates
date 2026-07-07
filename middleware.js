// [任意] Vercel Edge Middleware — Basic 認証で「限定公開」する雛形。
//
// 既定では無効（環境変数が未設定なら素通り）。限定公開したい場合のみ、
// Vercel のプロジェクト環境変数に BASIC_AUTH_USER / BASIC_AUTH_PASS を設定すると有効化される。
// （設定しなければ通常どおり誰でも閲覧可能。ローカル開発には影響しない。）

export const config = {
  matcher: '/((?!_next/static|favicon.ico).*)',
};

export default function middleware(request) {
  const USER = process.env.BASIC_AUTH_USER;
  const PASS = process.env.BASIC_AUTH_PASS;

  // 環境変数が未設定なら認証をかけない（＝通常公開）。
  if (!USER || !PASS) return;

  const header = request.headers.get('authorization');
  if (header) {
    const encoded = header.split(' ')[1] || '';
    let decoded = '';
    try { decoded = atob(encoded); } catch (e) { decoded = ''; }
    const idx = decoded.indexOf(':');
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    if (user === USER && pass === PASS) return; // 認証OK
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Docs", charset="UTF-8"' },
  });
}
