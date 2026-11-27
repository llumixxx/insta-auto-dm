import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 계정: acc:{igId} = { igId, username, token, expiresAt, connectedAt }
export async function saveAccount(acc) {
  await redis.set(`acc:${acc.igId}`, acc);
  await redis.sadd('accounts', acc.igId);
}
export const getAccount = (igId) => redis.get(`acc:${igId}`);
export async function listAccounts() {
  const ids = await redis.smembers('accounts');
  if (!ids.length) return [];
  const accs = await Promise.all(ids.map(getAccount));
  return accs.filter(Boolean);
}
export async function removeAccount(igId) {
  await redis.del(`acc:${igId}`, `rules:${igId}`, `logs:${igId}`);
  await redis.srem('accounts', igId);
}

// 규칙: rules:{igId} = [{ id, mediaId('all'|id), mediaLabel, keywords[], dm, replies[], on }]
export const getRules = async (igId) => (await redis.get(`rules:${igId}`)) || [];
export const setRules = (igId, rules) => redis.set(`rules:${igId}`, rules);

// 로그 (최근 200개)
export async function addLog(igId, log) {
  await redis.lpush(`logs:${igId}`, { ...log, at: Date.now() });
  await redis.ltrim(`logs:${igId}`, 0, 199);
}
export const getLogs = (igId, n = 100) => redis.lrange(`logs:${igId}`, 0, n - 1);

// 중복 방지: 같은 댓글은 한 번만 처리
export async function claimComment(commentId) {
  const ok = await redis.set(`done:${commentId}`, 1, { nx: true, ex: 60 * 60 * 24 * 8 });
  return ok === 'OK';
}

// ── 통계 ──────────────────────────────
// stats:{igId}:d:{YYYYMMDD} = hash { match, dm_ok, dm_fail, reply_ok, click }
// stats:{igId}:r:{ruleId}   = hash { dm_ok, dm_fail, click }
export const dayKey = (t = Date.now()) =>
  new Date(t + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ''); // 한국시간 기준 날짜

export async function bump(igId, ruleId, field) {
  const p = redis.pipeline();
  p.hincrby(`stats:${igId}:d:${dayKey()}`, field, 1);
  p.expire(`stats:${igId}:d:${dayKey()}`, 60 * 60 * 24 * 400);
  if (ruleId) p.hincrby(`stats:${igId}:r:${ruleId}`, field, 1);
  await p.exec();
}

export async function getStats(igId, days = 30) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(Date.now() - i * 864e5));
  const p = redis.pipeline();
  keys.forEach((d) => p.hgetall(`stats:${igId}:d:${d}`));
  const rows = await p.exec();
  const n = (o, k) => Number(o?.[k] || 0);
  const daily = keys.map((d, i) => ({
    day: `${d.slice(4, 6)}/${d.slice(6)}`,
    match: n(rows[i], 'match'), dm_ok: n(rows[i], 'dm_ok'), dm_fail: n(rows[i], 'dm_fail'),
    reply_ok: n(rows[i], 'reply_ok'), click: n(rows[i], 'click'),
  }));
  const rules = await getRules(igId);
  const p2 = redis.pipeline();
  rules.forEach((r) => p2.hgetall(`stats:${igId}:r:${r.id}`));
  const rr = rules.length ? await p2.exec() : [];
  const byRule = rules.map((r, i) => ({
    id: r.id, name: r.name || r.keywords.join(', '), mediaThumb: r.mediaThumb || '', on: r.on !== false,
    dm_ok: n(rr[i], 'dm_ok'), dm_fail: n(rr[i], 'dm_fail'), click: n(rr[i], 'click'),
  }));
  return { daily, byRule };
}
