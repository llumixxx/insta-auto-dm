// 인스타 로그인 후 돌아오는 곳 → 토큰 저장 + 댓글 웹훅 구독
import { exchangeCode, me, subscribeComments } from '../lib/ig.js';
import { redis, saveAccount, getAccount } from '../lib/store.js';
import { page, esc } from '../lib/http.js';

export async function GET(request) {
  const u = new URL(request.url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  if (u.searchParams.get('error')) return page('연결이 취소됐어요', '다시 시도하려면 링크를 다시 눌러주세요.', false);
  if (!code || !state || !(await redis.del(`state:${state}`)))
    return page('링크가 만료됐어요', '연결 링크를 다시 눌러서 처음부터 해주세요.', false);
  try {
    const { token, expiresAt } = await exchangeCode(code.replace(/#_$/, ''));
    const info = await me(token);
    const igId = String(info.user_id);
    const prev = await getAccount(igId);
    await saveAccount({
      igId,
      username: info.username,
      picture: info.profile_picture_url || '',
      token,
      expiresAt,
      connectedAt: prev?.connectedAt || Date.now(),
    });
    await subscribeComments(token);
    return page('연결 완료!', `@${esc(info.username)} 계정이 연결됐어요. 이 창은 닫아도 돼요.`);
  } catch (e) {
    return page('연결 실패', esc(e.message), false);
  }
}
