// 메타 웹훅: 댓글 → 키워드 확인 → DM(+대댓글)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAccount, getRules, addLog, claimComment } from '../lib/store.js';
import { privateReply, replyComment } from '../lib/ig.js';
import { VERIFY_TOKEN, APP_SECRET } from '../lib/config.js';

// 웹훅 주소 확인 (메타가 처음 등록할 때 호출)
export async function GET(request) {
  const p = new URL(request.url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === VERIFY_TOKEN())
    return new Response(p.get('hub.challenge'));
  return new Response('forbidden', { status: 403 });
}

function validSig(raw, header) {
  if (!header) return false;
  const expected = 'sha256=' + createHmac('sha256', APP_SECRET()).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export async function POST(request) {
  const raw = await request.text();
  if (!validSig(raw, request.headers.get('x-hub-signature-256'))) return new Response('bad signature', { status: 401 });
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('ok'); }
  if (body.object !== 'instagram') return new Response('ok');

  const jobs = [];
  for (const entry of body.entry || []) {
    const changes = entry.changes || (entry.field ? [{ field: entry.field, value: entry.value }] : []);
    for (const ch of changes) {
      if (ch.field === 'comments') jobs.push(handleComment(String(entry.id), ch.value));
    }
  }
  await Promise.allSettled(jobs);
  return new Response('ok');
}

async function handleComment(igId, v) {
  if (!v?.id) return;
  const acc = await getAccount(igId);
  if (!acc) return;
  if (String(v.from?.id) === igId) return; // 내 계정이 단 댓글(대댓글 포함)은 무시

  const rules = (await getRules(igId)).filter((r) => r.on !== false);
  const text = norm(v.text);
  const mediaId = String(v.media?.id || '');
  const rule = rules.find(
    (r) => (r.mediaId === 'all' || r.mediaId === mediaId) && r.keywords.some((k) => k && text.includes(norm(k)))
  );
  if (!rule) return;
  if (!(await claimComment(v.id))) return; // 이미 처리한 댓글

  const log = { user: v.from?.username || '', text: v.text, rule: rule.name || rule.keywords.join(', '), mediaId };
  try {
    await privateReply(igId, acc.token, v.id, rule.dm);
    log.dm = 'ok';
  } catch (e) {
    log.dm = 'fail: ' + e.message;
  }
  const replies = (rule.replies || []).filter(Boolean);
  if (replies.length) {
    try {
      await replyComment(acc.token, v.id, pick(replies));
      log.reply = 'ok';
    } catch (e) {
      log.reply = 'fail: ' + e.message;
    }
  }
  await addLog(igId, log);
}
