// 로그인 후 돌아오는 곳 → 토큰 저장 + 댓글 웹훅 구독 (한 번에 여러 계정 허용 가능)
import { connect, subscribeComments } from '../lib/ig.js';
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
    const { token, expiresAt, accounts } = await connect(code.replace(/#_$/, ''));
    const done = [], warn = [];
    for (const a of accounts) {
      const prev = await getAccount(a.igId);
      await saveAccount({ ...a, token, expiresAt, connectedAt: prev?.connectedAt || Date.now() });
      try { await subscribeComments(a.igId, token); } catch (e) { warn.push(`@${a.username}: ${e.message}`); }
      done.push('@' + a.username);
    }
    return page('연결 완료!', `${esc(done.join(', '))} 계정이 연결됐어요. 이 창은 닫아도 돼요.` +
      (warn.length ? `<br><br><small>웹훅 구독 경고: ${esc(warn.join(' / '))}</small>` : ''));
  } catch (e) {
    return page('연결 실패', esc(e.message), false);
  }
}
