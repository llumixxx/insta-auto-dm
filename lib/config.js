import { createHash } from 'node:crypto';

// 직접 넣는 값은 IG_APP_ID, IG_APP_SECRET, ADMIN_PASSWORD 3개뿐.
// 나머지는 자동으로 만들어요 (환경변수로 직접 넣으면 그 값이 우선).
const derive = (label) =>
  createHash('sha256').update(`${process.env.IG_APP_SECRET || ''}:${label}`).digest('hex').slice(0, 20);

export const BASE_URL = () =>
  (process.env.BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');
export const VERIFY_TOKEN = () => process.env.WEBHOOK_VERIFY_TOKEN || derive('verify');
export const CONNECT_CODE = () => process.env.CONNECT_CODE || derive('connect');
