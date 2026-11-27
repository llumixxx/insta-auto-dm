import { listAccounts, removeAccount, saveAccount } from '../lib/store.js';
import { subscribeComments } from '../lib/ig.js';
import { json, isAdmin } from '../lib/http.js';
import { BASE_URL, VERIFY_TOKEN, CONNECT_CODE, APP_ID, APP_SECRET, isUnified } from '../lib/config.js';

export async function GET(request) {
  if (!isAdmin(request)) return json({ error: '비밀번호가 틀렸어요' }, 401);
  const accs = await listAccounts();
  // 예전에 연결한 계정은 DM 버튼 알림(messages·postback)도 구독하도록 한 번 갱신
  await Promise.allSettled(accs.filter((a) => a.subV !== 2).map(async (a) => {
    await subscribeComments(a.igId, a.token); a.subV = 2; await saveAccount(a);
  }));
  const base = BASE_URL();
  const connectUrl = `${base}/api/connect?code=${CONNECT_CODE()}`;
  return json({
    connectUrl,
    setup: {
      redirectUrl: `${base}/api/callback`,
      webhookUrl: `${base}/api/webhook`,
      verifyToken: VERIFY_TOKEN(),
      privacyUrl: `${base}/privacy.html`,
      hasApp: !!(APP_ID() && APP_SECRET()),
      unified: isUnified(),
      hasDb: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
    },
    accounts: accs
      .map(({ token, ...a }) => a)
      .sort((a, b) => (a.username || '').localeCompare(b.username || '')),
  });
}

export async function DELETE(request) {
  if (!isAdmin(request)) return json({ error: '비밀번호가 틀렸어요' }, 401);
  const igId = new URL(request.url).searchParams.get('igId');
  if (!igId) return json({ error: 'igId 필요' }, 400);
  await removeAccount(igId);
  return json({ ok: true });
}
