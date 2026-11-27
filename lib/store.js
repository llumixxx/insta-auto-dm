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
