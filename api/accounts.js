import { listAccounts, removeAccount } from '../lib/store.js';
import { json, isAdmin } from '../lib/http.js';

export async function GET(request) {
  if (!isAdmin(request)) return json({ error: '비밀번호가 틀렸어요' }, 401);
  const accs = await listAccounts();
  const connectUrl = `${process.env.BASE_URL}/api/connect?code=${encodeURIComponent(process.env.CONNECT_CODE || '')}`;
  return json({
    connectUrl,
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
