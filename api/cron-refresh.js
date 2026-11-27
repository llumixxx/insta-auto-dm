// 매일 1번: 만료 20일 이내 토큰 자동 연장 (60일짜리)
import { listAccounts, saveAccount } from '../lib/store.js';
import { refreshToken } from '../lib/ig.js';
import { json } from '../lib/http.js';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  const out = [];
  for (const acc of await listAccounts()) {
    if (acc.expiresAt - Date.now() > 20 * 864e5) { out.push({ u: acc.username, skip: true }); continue; }
    try {
      const t = await refreshToken(acc.token);
      await saveAccount({ ...acc, ...t, refreshError: '' });
      out.push({ u: acc.username, ok: true });
    } catch (e) {
      await saveAccount({ ...acc, refreshError: e.message });
      out.push({ u: acc.username, error: e.message });
    }
  }
  return json({ refreshed: out });
}
