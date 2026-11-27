// DM 속 링크 클릭 추적
//  새 주소: /go/{키}/{받는사람}-{서명}  (vercel.json에서 /api/r?k=&c= 로 연결)
//  예전 주소: /api/r?u=원래주소&a=계정ID&r=규칙ID&c=받는사람&s=서명
import { bump, recordClick, getLink } from '../lib/store.js';
import { signLink } from '../lib/config.js';
import { timingSafeEqual } from 'node:crypto';
import { waitUntil } from '@vercel/functions';

const BOT = /facebookexternalhit|facebot|instagram.*bot|bot|crawler|spider|preview|slack|kakaotalk-scrap|whatsapp|telegram/i;
const eq = (x, y) => x.length === y.length && timingSafeEqual(Buffer.from(x), Buffer.from(y));
const bad = () => new Response('유효하지 않은 링크예요', { status: 400 });

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  let u, a, r, c = '';
  const k = (p.get('k') || '').replace(/[^0-9a-f]/g, '').slice(0, 10);
  if (k) {
    const v = await getLink(k);
    if (!v) return bad();
    ({ u, a, r } = v);
    const [who = '', s = ''] = (p.get('c') || '').split('-');
    if (who && eq(s, signLink(k, who).slice(0, 6))) c = who.replace(/[^\w]/g, '').slice(0, 60);
  } else {
    u = p.get('u') || '';
    a = (p.get('a') || '').replace(/\D/g, '').slice(0, 30);
    r = (p.get('r') || '').replace(/[^\w-]/g, '').slice(0, 60);
    c = (p.get('c') || '').replace(/[^\w-]/g, '').slice(0, 60);
    if (!eq(p.get('s') || '', signLink(u, a, r, c))) return bad(); // 서명 없는 링크는 막아요
  }
  let target;
  try { target = new URL(u); } catch { return bad(); }
  if (!/^https?:$/.test(target.protocol)) return bad();
  const ua = request.headers.get('user-agent') || '';
  // 바로 넘겨주고, 클릭 기록은 뒤에서 (주소가 보이는 시간을 줄여요)
  if (a && !BOT.test(ua)) waitUntil(Promise.all([bump(a, r, 'click', c || null), recordClick(a, c, r)]).catch(() => {}));
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
