import { createHash } from 'node:crypto';

// 직접 넣는 값: META_APP_SECRET(앱 시크릿 코드), ADMIN_PASSWORD
// META_APP_ID, META_LOGIN_CONFIG_ID 는 비밀값이 아니라서 미리 넣어둠
// (예전 이름 IG_APP_ID / IG_APP_SECRET 도 그대로 동작)
export const APP_ID = () => process.env.META_APP_ID || process.env.IG_APP_ID || '';
export const APP_SECRET = () => process.env.META_APP_SECRET || process.env.IG_APP_SECRET || '';
export const LOGIN_CONFIG_ID = () => (process.env.META_LOGIN_CONFIG_ID || '').trim();
export const isUnified = () => !!LOGIN_CONFIG_ID();

const derive = (label) => createHash('sha256').update(`${APP_SECRET()}:${label}`).digest('hex').slice(0, 20);

export const BASE_URL = () =>
  (process.env.BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');
export const VERIFY_TOKEN = () => process.env.WEBHOOK_VERIFY_TOKEN || derive('verify');
export const CONNECT_CODE = () => process.env.CONNECT_CODE || derive('connect');

// 추적 링크 서명 (우리가 만든 링크만 통과)
export const signLink = (...parts) => createHash('sha256').update(`${APP_SECRET()}:link:${parts.join('|')}`).digest('hex').slice(0, 16);
