// 매일 1번: 만료 20일 이내 토큰 자동 연장 (60일짜리)
import { listAccounts, saveAccount, redis, KEEP_MS } from '../lib/store.js';
import { refreshToken } from '../lib/ig.js';
import { json } from '../lib/http.js';
import { isUnified } from '../lib/config.js';
import { processRetries } from './webhook.js';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  // 2년 지난 발송 기록 정리
  for (const a of await listAccounts()) { try { await redis.zremrangebyscore(`log:${a.igId}`, 0, Date.now() - KEEP_MS); } catch {} }
  let retry = null;
  try { retry = await processRetries(); } catch (e) { retry = { error: e.message }; }
  if (isUnified()) return json({ retry, token: '통합 로그인 토큰은 만료가 없어요' });
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
  return json({ retry, refreshed: out });
}
