import { listAccounts, removeAccount } from '../lib/store.js';
import { json, isAdmin } from '../lib/http.js';
import { BASE_URL, VERIFY_TOKEN, CONNECT_CODE } from '../lib/config.js';

export async function GET(request) {
  if (!isAdmin(request)) return json({ error: '비밀번호가 틀렸어요' }, 401);
  const accs = await listAccounts();
  const base = BASE_URL();
  const connectUrl = `${base}/api/connect?code=${CONNECT_CODE()}`;
  return json({
    connectUrl,
    setup: {
      redirectUrl: `${base}/api/callback`,
      webhookUrl: `${base}/api/webhook`,
      verifyToken: VERIFY_TOKEN(),
      privacyUrl: `${base}/privacy.html`,
      hasApp: !!(process.env.IG_APP_ID && process.env.IG_APP_SECRET),
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
