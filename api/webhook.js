// 메타 웹훅: 댓글 → 키워드 확인 → DM(+대댓글)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { redis, getAccount, getRules, addLog, claimComment, bump, firstTime } from '../lib/store.js';
import { send, msgText, msgQuick, msgButton, replyComment } from '../lib/ig.js';
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
function track(text, igId, ruleId, who = '') {
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
    return `${base}/api/r?u=${encodeURIComponent(full)}&a=${igId}&r=${ruleId}${who ? '&c=' + who : ''}` + trail;
  });
}

const fullUrl = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
const trackUrl = (u, igId, ruleId, who) =>
  `${BASE_URL()}/api/r?u=${encodeURIComponent(fullUrl(u))}&a=${igId}&r=${ruleId}${who ? '&c=' + who : ''}`;
export const modeOf = (r) => r.mode || (r.btnUrl ? 'button' : 'text');

// 링크 (추적 켜져 있으면 추적 주소)
const linkFor = (rule, igId, who) =>
  rule.track !== false && BASE_URL() ? trackUrl(rule.btnUrl, igId, rule.id, who) : fullUrl(rule.btnUrl);
const textFor = (text, rule, igId, who) => (rule.track !== false ? track(text, igId, rule.id, who) : text);

// 댓글 단 사람에게 보내는 첫 DM (댓글당 1번만 가능)
async function sendFirst(igId, token, commentId, rule, who) {
  const to = { comment_id: commentId };
  const mode = modeOf(rule);
  if (mode === 'two') {
    // ① 긴 본문 + '링크 받기' 빠른 답장 → 누르면 ② 버튼 DM
    const label = rule.openLabel || '링크 받기';
    try { await send(igId, token, to, msgQuick(textFor(rule.dm, rule, igId, who), label, `R:${rule.id}`)); return '2단계 ①'; } catch {}
    try { await send(igId, token, to, msgButton(rule.dm.slice(0, 640), [{ type: 'postback', title: label, payload: `R:${rule.id}` }])); return '2단계 ①(버튼)'; } catch {}
  }
  if ((mode === 'button' || mode === 'two') && rule.btnUrl) {
    const title = rule.btnTitle || '바로가기';
    const text = (mode === 'two' ? rule.dm2 || rule.dm : rule.dm).slice(0, 640);
    try { await send(igId, token, to, msgButton(text, [{ type: 'web_url', url: linkFor(rule, igId, who), title }])); return '버튼'; } catch {}
    await send(igId, token, to, msgText(`${textFor(rule.dm, rule, igId, who)}\n\n${title}: ${linkFor(rule, igId, who)}`));
    return '글자 링크';
  }
  await send(igId, token, to, msgText(textFor(rule.dm, rule, igId, who)));
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
    for (const m of entry.messaging || []) jobs.push(handleMessaging(String(entry.id), m));
  }
  await Promise.allSettled(jobs);
  return new Response('ok');
}

async function handleComment(igId, v) {
  if (!v?.id) return;
  const acc = await getAccount(igId);
  if (!acc) return;
  const who = String(v.from?.id || '');
  if (who === igId) return; // 내 계정이 단 댓글(대댓글 포함)은 무시

  const rules = (await getRules(igId)).filter((r) => r.on !== false);
  const text = norm(v.text);
  const mediaId = String(v.media?.id || '');
  const rule = rules.find(
    (r) => (r.mediaId === 'all' || r.mediaId === mediaId) && r.keywords.some((k) => k && text.includes(norm(k)))
  );
  if (!rule) return;
  if (!(await claimComment(v.id))) return; // 이미 처리한 댓글

  await bump(igId, rule.id, 'match', who);
  const log = { user: v.from?.username || '', text: v.text, rule: rule.name || rule.keywords.join(', '), mediaId };
  if (rule.once !== false && who && !(await firstTime(igId, rule.id, who))) {
    log.dm = 'skip'; // 같은 사람에게 이미 보냄
  } else {
    try {
      log.mode = await sendFirst(igId, acc.token, v.id, rule, who);
      log.dm = 'ok';
      await bump(igId, rule.id, 'dm_ok', who);
    } catch (e) {
      log.dm = 'fail: ' + e.message;
      await bump(igId, rule.id, 'dm_fail', who);
      if (rule.once !== false && who) await redis.del(`sent:${igId}:${rule.id}:${who}`); // 실패하면 다음에 다시 보낼 수 있게
    }
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

// '링크 받기'를 누르면 → 두 번째 DM(버튼) 보내기
async function handleMessaging(igId, m) {
  if (m.message?.is_echo) return;
  const payload = m.message?.quick_reply?.payload || m.postback?.payload || '';
  if (!payload.startsWith('R:')) return;
  const who = String(m.sender?.id || '');
  const acc = await getAccount(igId);
  if (!acc || !who) return;
  const rule = (await getRules(igId)).find((r) => r.id === payload.slice(2));
  if (!rule) return;
  const first = (await redis.set(`open:${igId}:${rule.id}:${who}`, 1, { nx: true, ex: 86400 })) === 'OK';
  if (first) await bump(igId, rule.id, 'open', who);
  const to = { id: who };
  const log = { user: '(링크 받기 누름)', text: rule.openLabel || '링크 받기', rule: rule.name || rule.keywords.join(', ') };
  try {
    if (rule.btnUrl) {
      const title = rule.btnTitle || '바로가기';
      const text = (rule.dm2 || '아래 버튼을 눌러 확인해주세요 👇').slice(0, 640);
      try { await send(igId, acc.token, to, msgButton(text, [{ type: 'web_url', url: linkFor(rule, igId, who), title }])); log.mode = '2단계 ②버튼'; }
      catch { await send(igId, acc.token, to, msgText(`${text}\n\n${title}: ${linkFor(rule, igId, who)}`)); log.mode = '2단계 ②글자 링크'; }
    } else if (rule.dm2) {
      await send(igId, acc.token, to, msgText(textFor(rule.dm2, rule, igId, who))); log.mode = '2단계 ②';
    }
    log.dm = 'ok';
  } catch (e) {
    log.dm = 'fail: ' + e.message;
  }
  await addLog(igId, log);
}
