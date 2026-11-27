// DM 속 링크 클릭 추적: /api/r?u=원래주소&a=계정ID&r=규칙ID&c=받는사람
import { bump, recordClick } from '../lib/store.js';
import { signLink } from '../lib/config.js';
import { timingSafeEqual } from 'node:crypto';

const BOT = /facebookexternalhit|facebot|instagram.*bot|bot|crawler|spider|preview|slack|kakaotalk-scrap|whatsapp|telegram/i;

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  let target;
  try { target = new URL(p.get('u') || ''); } catch { return new Response('잘못된 링크', { status: 400 }); }
  if (!/^https?:$/.test(target.protocol)) return new Response('잘못된 링크', { status: 400 });
  const a = (p.get('a') || '').replace(/\D/g, '').slice(0, 30);
  const r = (p.get('r') || '').replace(/[^\w-]/g, '').slice(0, 60);
  const c = (p.get('c') || '').replace(/[^\w-]/g, '').slice(0, 60);
  const sig = p.get('s') || '', want = signLink(p.get('u') || '', a, r, c);
  const valid = sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
  if (!valid) return new Response('유효하지 않은 링크예요', { status: 400 }); // 서명 없는 링크는 막아요
  const ua = request.headers.get('user-agent') || '';
  // 인스타가 미리보기 만들려고 여는 건 클릭으로 안 셈
  if (a && !BOT.test(ua)) { try { await bump(a, r, 'click', c || null); await recordClick(a, c, r); } catch {} }
  return Response.redirect(target.toString(), 302);
}
