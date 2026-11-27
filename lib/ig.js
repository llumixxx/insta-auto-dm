// 인스타그램 API (Instagram 로그인 방식, graph.instagram.com)
export const GV = 'v24.0';
const G = `https://graph.instagram.com/${GV}`;
export const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
].join(',');

async function call(url, opts = {}) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const msg = j.error?.error_user_msg || j.error?.message || j.error_message || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return j;
}

import { BASE_URL } from './config.js';
export const redirectUri = () => `${BASE_URL()}/api/callback`;

export function authUrl(state) {
  const p = new URLSearchParams({
    client_id: process.env.IG_APP_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state,
    enable_fb_login: '0',
    force_reauth: 'true',
  });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.IG_APP_ID,
    client_secret: process.env.IG_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(),
    code,
  });
  const j = await call('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
  const d = j.data?.[0] || j;
  // 단기 토큰 → 60일 장기 토큰
  const long = await call(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.IG_APP_SECRET}&access_token=${d.access_token}`
  );
  return { token: long.access_token, expiresAt: Date.now() + long.expires_in * 1000 };
}

export async function refreshToken(token) {
  const j = await call(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
  return { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
}

// user_id = 웹훅 entry.id 와 같은 값
export const me = (token) => call(`${G}/me?fields=user_id,username,profile_picture_url&access_token=${token}`);

export const subscribeComments = (token) =>
  call(`${G}/me/subscribed_apps?subscribed_fields=comments,messages&access_token=${token}`, { method: 'POST' });

export async function recentMedia(igId, token) {
  const j = await call(
    `${G}/${igId}/media?fields=id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp&limit=30&access_token=${token}`
  );
  return j.data || [];
}

// 댓글 단 사람에게 비공개 DM (댓글당 1번, 7일 이내)
export const privateReply = (igId, token, commentId, text) =>
  call(`${G}/${igId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
  });

// 댓글에 공개 대댓글
export const replyComment = (token, commentId, text) =>
  call(`${G}/${commentId}/replies?message=${encodeURIComponent(text)}&access_token=${token}`, { method: 'POST' });
