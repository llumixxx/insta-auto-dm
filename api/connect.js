// 모델 연결 링크: /api/connect?code=CONNECT_CODE → 바로 메타 로그인
import { authUrl } from '../lib/ig.js';
import { redis } from '../lib/store.js';
import { page } from '../lib/http.js';
import { CONNECT_CODE, APP_SECRET } from '../lib/config.js';

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const code = q.get('code');
  if (!APP_SECRET() || code !== CONNECT_CODE())
    return page('잘못된 링크예요', '관리자에게 연결 링크를 다시 받아주세요.', false);
  const state = crypto.randomUUID();
  await redis.set(`state:${state}`, 1, { ex: 600 });
  return Response.redirect(authUrl(state), 302);
}

