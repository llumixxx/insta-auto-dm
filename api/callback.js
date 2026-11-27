// 로그인 후 돌아오는 곳 → 토큰 저장 + 댓글 웹훅 구독 (한 번에 여러 계정 허용 가능)
import { connect, subscribeComments } from '../lib/ig.js';
import { redis, saveAccount, getAccount } from '../lib/store.js';
import { page, esc } from '../lib/http.js';
import { CONNECT_CODE } from '../lib/config.js';
const again = () => `<br><br><a href="/api/connect?code=${CONNECT_CODE()}" style="display:inline-block;background:#e1306c;color:#fff;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:700">처음 화면으로</a>`;

export async function GET(request) {
  const u = new URL(request.url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  if (u.searchParams.get('error')) return page('연결이 취소됐어요', '다시 하려면 아래 버튼을 눌러주세요.' + again(), false);
  if (!code || !state || !(await redis.del(`state:${state}`)))
    return page('링크가 만료됐어요', '아래 버튼을 눌러 ②연결하기를 다시 해주세요.' + again(), false);
  try {
    const { token, expiresAt, accounts } = await connect(code.replace(/#_$/, ''));
    const done = [], warn = [];
    for (const a of accounts) {
      const prev = await getAccount(a.igId);
      await saveAccount({ ...a, token, expiresAt, connectedAt: prev?.connectedAt || Date.now(), subV: 3 });
      try { await subscribeComments(a.igId, token); } catch (e) { warn.push(`@${a.username}: ${e.message}`); }
      done.push('@' + a.username);
    }
    return page('연결 완료!', `${esc(done.join(', '))} 계정이 연결됐어요. 이 창은 닫아도 돼요.` +
      (warn.length ? `<br><br><small>웹훅 구독 경고: ${esc(warn.join(' / '))}</small>` : ''));
  } catch (e) {
    const msg = /permission|role|tester|not authorized|190|10\b|200/i.test(e.message)
      ? '①초대 수락을 아직 안 한 것 같아요. ①을 먼저 하고 ②를 다시 눌러주세요.'
      : '잠시 후 다시 해주세요.';
    return page('연결이 안 됐어요', msg + again() + `<br><br><small style="color:#666">${esc(e.message)}</small>`, false);
  }
}
