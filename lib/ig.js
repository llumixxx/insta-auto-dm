// 인스타그램 API
// - 새 메타 앱(2026.10 이후): '통합 로그인'(Facebook Login for Business + 구성 ID), graph.facebook.com, 만료 없는 시스템 사용자 토큰
// - 예전 앱: Instagram 로그인, graph.instagram.com, 60일 토큰
import { BASE_URL, APP_ID, APP_SECRET, LOGIN_CONFIG_ID, isUnified } from './config.js';

export const GV = 'v23.0';
const FB = `https://graph.facebook.com/${GV}`;
const IGH = `https://graph.instagram.com/${GV}`;
const G = () => (isUnified() ? FB : IGH);
const NEVER = Date.now() + 100 * 365 * 864e5;

async function call(url, opts = {}) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const msg = j.error?.error_user_msg || j.error?.message || j.error_message || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return j;
}
const auth = (token, extra = {}) => ({ headers: { Authorization: `Bearer ${token}`, ...extra } });

export const redirectUri = () => `${BASE_URL()}/api/callback`;

export function authUrl(state) {
  if (isUnified()) {
    const p = new URLSearchParams({
      client_id: APP_ID(),
      redirect_uri: redirectUri(),
      config_id: LOGIN_CONFIG_ID(),
      response_type: 'code',
      override_default_response_type: 'true',
      state,
      prompt: 'login',
    });
    return `https://www.facebook.com/dialog/oauth?${p}`;
  }
  const p = new URLSearchParams({
    client_id: APP_ID(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages',
    state,
    enable_fb_login: 'false',
    force_reauth: 'true',
  });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

// 코드 → 토큰 + 연결된 인스타 계정 목록 [{ igId, username, picture }]
export async function connect(code) {
  if (isUnified()) {
    const q = new URLSearchParams({ client_id: APP_ID(), client_secret: APP_SECRET(), redirect_uri: redirectUri(), code });
    const t = await call(`${FB}/oauth/access_token?${q}`);
    const token = t.access_token;
    const j = await call(`${FB}/me/assigned_instagram_accounts?fields=id,username,profile_picture_url`, auth(token));
    const accounts = (j.data || []).map((a) => ({ igId: String(a.id), username: a.username || String(a.id), picture: a.profile_picture_url || '' }));
    if (!accounts.length) throw new Error('허용된 인스타 계정이 없어요. 다시 연결하면서 계정 선택 화면에서 인스타 계정을 체크해주세요.');
    return { token, expiresAt: NEVER, accounts };
  }
  const body = new URLSearchParams({ client_id: APP_ID(), client_secret: APP_SECRET(), grant_type: 'authorization_code', redirect_uri: redirectUri(), code });
  const j = await call('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
  const d = j.data?.[0] || j;
  const long = await call(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET()}&access_token=${d.access_token}`);
  const me = await call(`${IGH}/me?fields=user_id,username,profile_picture_url`, auth(long.access_token));
  return {
    token: long.access_token,
    expiresAt: Date.now() + long.expires_in * 1000,
    accounts: [{ igId: String(me.user_id), username: me.username, picture: me.profile_picture_url || '' }],
  };
}

export async function refreshToken(token) {
  if (isUnified()) return { token, expiresAt: NEVER };
  const j = await call(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
  return { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
}

// 계정별 댓글 웹훅 구독
export const subscribeComments = (igId, token) =>
  call(`${G()}/${igId}/subscribed_apps`, {
    method: 'POST',
    ...auth(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ subscribed_fields: ['comments'] }),
  });

export async function recentMedia(igId, token) {
  const j = await call(
    `${G()}/${igId}/media?fields=id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp&limit=30`,
    auth(token)
  );
  return j.data || [];
}

// 댓글 단 사람에게 비공개 DM (댓글당 1번, 7일 이내)
export const privateReply = (igId, token, commentId, text) =>
  call(`${G()}/${igId}/messages`, {
    method: 'POST',
    ...auth(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
  });

// 댓글에 공개 대댓글
export const replyComment = (token, commentId, text) =>
  call(`${G()}/${commentId}/replies`, {
    method: 'POST',
    ...auth(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message: text }),
  });
