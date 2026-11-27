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
  await redis.del(`acc:${igId}`, `rules:${igId}`, `logs:${igId}`, `log:${igId}`);
  await redis.srem('accounts', igId);
}

// 규칙: rules:{igId} = [{ id, mediaId('all'|id), mediaLabel, keywords[], dm, replies[], on }]
export const getRules = async (igId) => (await redis.get(`rules:${igId}`)) || [];
export const setRules = (igId, rules) => redis.set(`rules:${igId}`, rules);

// ── 발송 기록: 기간 제한 없이 보관, 2년 지난 건 자동 삭제 ──
// log:{igId} (sorted set) score = 시각(ms), member = JSON
export const KEEP_MS = 730 * 864e5; // 2년
async function migrateOldLogs(igId) {
  // 예전 방식(logs:{igId} 리스트)에 남은 기록을 새 방식으로 옮겨요
  const old = await redis.lrange(`logs:${igId}`, 0, -1);
  if (!old?.length) return;
  const p = redis.pipeline();
  for (const l of old) {
    const o = typeof l === 'string' ? JSON.parse(l) : l;
    p.zadd(`log:${igId}`, { score: o.at || Date.now(), member: JSON.stringify({ id: crypto.randomUUID().slice(0, 8), ...o }) });
  }
  p.del(`logs:${igId}`);
  await p.exec();
}
export async function addLog(igId, log) {
  const at = Date.now();
  const p = redis.pipeline();
  p.zadd(`log:${igId}`, { score: at, member: JSON.stringify({ id: crypto.randomUUID().slice(0, 8), ...log, at }) });
  p.zremrangebyscore(`log:${igId}`, 0, at - KEEP_MS);
  await p.exec();
}
const parse = (arr) => (arr || []).map((m) => (typeof m === 'string' ? JSON.parse(m) : m));
// 최신순 n개 (before 이전)
export async function getLogs(igId, n = 100, before = Date.now() + 1) {
  await migrateOldLogs(igId);
  return parse(await redis.zrange(`log:${igId}`, before - 1, 0, { byScore: true, rev: true, offset: 0, count: n }));
}
// 기간 전체 (백업용, 오래된 순)
export async function getLogsRange(igId, from, to) {
  await migrateOldLogs(igId);
  return parse(await redis.zrange(`log:${igId}`, from, to, { byScore: true }));
}
export const countLogs = (igId) => redis.zcard(`log:${igId}`);

// 중복 방지: 같은 댓글은 한 번만 처리
export async function claimComment(commentId) {
  const ok = await redis.set(`done:${commentId}`, 1, { nx: true, ex: 60 * 60 * 24 * 8 });
  return ok === 'OK';
}

// ── 통계 ──────────────────────────────
// stats:{igId}:d:{YYYYMMDD}   = hash { match, dm_ok, dm_fail, reply_ok, open, click }  (일별 횟수)
// stats:{igId}:h:{YYYYMMDDHH} = 같은 내용, 시간별 (40일 보관)
// stats:{igId}:r:{ruleId}     = 규칙별 누적 횟수
// u:{igId}:d:{day}:{field}    = HyperLogLog (일별 '사람 수')
// u:{igId}:r:{ruleId}:{field} = HyperLogLog (규칙별 누적 '사람 수')
const KST = 9 * 3600e3;
export const dayKey = (t = Date.now()) => new Date(t + KST).toISOString().slice(0, 10).replace(/-/g, '');
const hourKey = (t = Date.now()) => new Date(t + KST).toISOString().slice(0, 13).replace(/[-T]/g, '');

export async function bump(igId, ruleId, field, who) {
  const d = dayKey(), h = hourKey(), p = redis.pipeline();
  p.hincrby(`stats:${igId}:d:${d}`, field, 1); p.expire(`stats:${igId}:d:${d}`, 730 * 86400);
  p.hincrby(`stats:${igId}:h:${h}`, field, 1); p.expire(`stats:${igId}:h:${h}`, 40 * 86400);
  if (ruleId) p.hincrby(`stats:${igId}:r:${ruleId}`, field, 1);
  if (who) {
    p.pfadd(`u:${igId}:d:${d}:${field}`, String(who)); p.expire(`u:${igId}:d:${d}:${field}`, 730 * 86400);
    if (ruleId) { p.pfadd(`u:${igId}:r:${ruleId}:${field}`, String(who)); p.expire(`u:${igId}:r:${ruleId}:${field}`, 730 * 86400); }
  }
  await p.exec();
}

// 같은 사람에게 같은 규칙 DM은 한 번만 (true = 처음)
export async function firstTime(igId, ruleId, who) {
  return (await redis.set(`sent:${igId}:${ruleId}:${who}`, 1, { nx: true, ex: 730 * 86400 })) === 'OK';
}

const FIELDS = ['match', 'dm_ok', 'dm_fail', 'reply_ok', 'open', 'click'];
const UFIELDS = ['match', 'dm_ok', 'open', 'click'];
const ymd = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) - KST;

// from, to = 'YYYYMMDD' (한국 날짜). 하루면 시간별, 아니면 일별.
export async function getStats(igIds, from, to) {
  const days = [];
  for (let t = ymd(from); t <= ymd(to) && days.length < 366; t += 864e5) days.push(dayKey(t + 3600e3));
  const hourly = days.length === 1;
  const buckets = hourly ? [...Array(24)].map((_, i) => days[0] + String(i).padStart(2, '0')) : days;
  const p = redis.pipeline();
  for (const b of buckets) for (const id of igIds) p.hgetall(`stats:${id}:${hourly ? 'h' : 'd'}:${b}`);
  for (const f of UFIELDS) p.pfcount(...igIds.flatMap((id) => days.map((d) => `u:${id}:d:${d}:${f}`)));
  for (const id of igIds) for (const f of UFIELDS) p.pfcount(...days.map((d) => `u:${id}:d:${d}:${f}`));
  const res = igIds.length ? await p.exec() : [];
  const n = (o, k) => Number(o?.[k] || 0);
  let i = 0;
  const series = buckets.map((b) => {
    const o = { label: hourly ? `${+b.slice(8)}시` : `${b.slice(4, 6)}/${b.slice(6)}` };
    FIELDS.forEach((f) => (o[f] = 0));
    for (const _ of igIds) { const h = res[i++]; FIELDS.forEach((f) => (o[f] += n(h, f))); }
    return o;
  });
  const total = {}; FIELDS.forEach((f) => (total[f] = series.reduce((s, x) => s + x[f], 0)));
  const people = {}; UFIELDS.forEach((f) => (people[f] = Number(res[i++] || 0)));
  const perAccount = igIds.map((id) => {
    const t = { igId: id }; UFIELDS.forEach((f) => (t['u_' + f] = Number(res[i++] || 0))); return t;
  });
  return { hourly, series, total, people, perAccount };
}

export async function getRuleStats(igId) {
  const rules = await getRules(igId);
  if (!rules.length) return [];
  const p = redis.pipeline();
  rules.forEach((r) => { p.hgetall(`stats:${igId}:r:${r.id}`); UFIELDS.forEach((f) => p.pfcount(`u:${igId}:r:${r.id}:${f}`)); });
  const res = await p.exec();
  const n = (o, k) => Number(o?.[k] || 0);
  return rules.map((r, k) => {
    const base = k * (1 + UFIELDS.length), h = res[base];
    const o = { id: r.id, name: r.name || r.keywords.join(', '), on: r.on !== false, mode: r.mode || (r.btnUrl ? 'button' : 'text') };
    FIELDS.forEach((f) => (o[f] = n(h, f)));
    UFIELDS.forEach((f, j) => (o['u_' + f] = Number(res[base + 1 + j] || 0)));
    return o;
  });
}

// ── 한도 걸린 DM 재전송 대기열 ──────────────
// retry (sorted set): score = 다음 시도 시각, member = JSON
export async function enqueueRetry(job) {
  await redis.zadd('retry', { score: job.next, member: JSON.stringify(job) });
}
export async function dueRetries(limit = 25) {
  const items = await redis.zrange('retry', 0, Date.now(), { byScore: true, offset: 0, count: limit });
  return items.map((m) => ({ raw: typeof m === 'string' ? m : JSON.stringify(m), job: typeof m === 'string' ? JSON.parse(m) : m }));
}
export const removeRetry = (raw) => redis.zrem('retry', raw);
export const retryCount = () => redis.zcard('retry');
// 너무 자주 돌지 않게 (1분에 1번)
export async function retryLock() {
  return (await redis.set('retry:lock', 1, { nx: true, ex: 60 })) === 'OK';
}

// ── 링크 누른 사람 목록 ──────────────
// clickers:{igId} (sorted set) member = 인스타 내부ID, score = 마지막 클릭 시각
// clk:{igId}:{id} (hash) { n: 클릭 수, first, last, rule }
// uname:{igId}:{id} = 인스타 아이디 (댓글 달 때 저장)
export async function recordClick(igId, who, ruleId) {
  if (!who) return;
  const now = Date.now(), k = `clk:${igId}:${who}`, p = redis.pipeline();
  p.zadd(`clickers:${igId}`, { score: now, member: String(who) });
  p.zremrangebyscore(`clickers:${igId}`, 0, now - KEEP_MS);
  p.hincrby(k, 'n', 1);
  p.hsetnx(k, 'first', now);
  p.hset(k, { last: now, rule: ruleId || '' });
  p.expire(k, 730 * 86400);
  await p.exec();
}

export async function getClickers(igId, from = 0, to = Date.now()) {
  const ids = await redis.zrange(`clickers:${igId}`, to, from, { byScore: true, rev: true });
  if (!ids?.length) return [];
  const p = redis.pipeline();
  ids.forEach((id) => { p.hgetall(`clk:${igId}:${id}`); p.get(`uname:${igId}:${id}`); });
  const res = await p.exec();
  const rules = await getRules(igId);
  return ids.map((id, i) => {
    const h = res[i * 2] || {}, u = res[i * 2 + 1];
    return {
      username: u || '', clicks: Number(h.n || 0), first: Number(h.first || 0), last: Number(h.last || 0),
      rule: rules.find((r) => r.id === h.rule)?.name || '',
    };
  });
}
