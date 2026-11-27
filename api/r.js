// DM 속 링크 클릭 추적: /api/r?u=원래주소&a=계정ID&r=규칙ID
import { bump } from '../lib/store.js';

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const u = p.get('u') || '';
  let target;
  try { target = new URL(u); } catch { return new Response('잘못된 링크', { status: 400 }); }
  if (!/^https?:$/.test(target.protocol)) return new Response('잘못된 링크', { status: 400 });
  const a = (p.get('a') || '').replace(/\D/g, '').slice(0, 30);
  const r = (p.get('r') || '').replace(/[^\w-]/g, '').slice(0, 60);
  if (a) { try { await bump(a, r, 'click'); } catch {} }
  return Response.redirect(target.toString(), 302);
}
