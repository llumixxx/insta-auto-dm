// 메타 웹훅: 댓글 → 키워드 확인 → DM(+대댓글)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAccount, getRules, addLog, claimComment, bump } from '../lib/store.js';
import { privateReply, privateReplyButton, replyComment } from '../lib/ig.js';
import { VERIFY_TOKEN, APP_SECRET, BASE_URL } from '../lib/config.js';

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

// DM 안의 링크를 클릭 추적 링크로 바꿔요 (규칙에서 끄면 원래 링크 그대로)
function track(text, igId, ruleId) {
  const base = BASE_URL();
  if (!base) return text;
  // https://… 또는 www.… 또는 도메인.com/.kr 등 (뒤에 붙은 한글·문장부호는 제외)
  const re = /(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+|\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:com|co\.kr|kr|net|org|me|io|shop|store|site|ly|gl|link|page)(?:\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]*)?/g;
  return text.replace(re, (m, off) => {
    if (text[off - 1] === '@' || /[A-Za-z0-9._%+-]/.test(text[off - 1] || '')) return m; // 이메일·단어 중간은 그대로
    const trail = (m.match(/[.,!?;:)\]]+$/) || [''])[0];
    const u = trail ? m.slice(0, -trail.length) : m;
    if (u.startsWith(base)) return m; // 이미 추적 주소
    const full = /^https?:\/\//.test(u) ? u : 'https://' + u;
    return `${base}/api/r?u=${encodeURIComponent(full)}&a=${igId}&r=${ruleId}` + trail;
  });
}

const fullUrl = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
const trackUrl = (u, igId, ruleId) => `${BASE_URL()}/api/r?u=${encodeURIComponent(fullUrl(u))}&a=${igId}&r=${ruleId}`;

async function sendDm(igId, token, commentId, rule) {
  const tracking = rule.track !== false && !!BASE_URL();
  if (rule.btnUrl) {
    const url = tracking ? trackUrl(rule.btnUrl, igId, rule.id) : fullUrl(rule.btnUrl);
    const title = rule.btnTitle || '바로가기';
    if (rule.dm.length <= 640) {
      try { await privateReplyButton(igId, token, commentId, rule.dm, url, title); return '버튼'; }
      catch (e) { /* 버튼이 안 되면 아래에서 글자 링크로 다시 보내요 */ }
    }
    const text = `${rule.dm}\n\n${title}: ${tracking ? url : fullUrl(rule.btnUrl)}`;
    await privateReply(igId, token, commentId, text);
    return '글자 링크';
  }
  await privateReply(igId, token, commentId, tracking ? track(rule.dm, igId, rule.id) : rule.dm);
  return '';
}

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

  await bump(igId, rule.id, 'match');
  const log = { user: v.from?.username || '', text: v.text, rule: rule.name || rule.keywords.join(', '), mediaId };
  try {
    log.mode = await sendDm(igId, acc.token, v.id, rule);
    log.dm = 'ok';
    await bump(igId, rule.id, 'dm_ok');
  } catch (e) {
    log.dm = 'fail: ' + e.message;
    await bump(igId, rule.id, 'dm_fail');
  }
  const replies = (rule.replies || []).filter(Boolean);
  if (replies.length) {
    try {
      await replyComment(acc.token, v.id, pick(replies));
      log.reply = 'ok';
      await bump(igId, rule.id, 'reply_ok');
    } catch (e) {
      log.reply = 'fail: ' + e.message;
    }
  }
  await addLog(igId, log);
}
