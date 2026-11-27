export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

// 관리자 확인 + 비밀번호 틀리면 IP당 15분에 10번까지만
export async function adminGate(request) {
  const { redis } = await import('./store.js');
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'x';
  const key = `fail:${ip}`;
  const fails = Number(await redis.get(key)) || 0;
  if (fails >= 10) return json({ error: '비밀번호를 너무 많이 틀렸어요. 15분 뒤에 다시 해주세요' }, 429);
  const k = request.headers.get('x-admin-key') || '';
  const pw = process.env.ADMIN_PASSWORD || '';
  const { timingSafeEqual } = await import('node:crypto');
  const ok = pw && k.length === pw.length && timingSafeEqual(Buffer.from(k), Buffer.from(pw));
  if (ok) return null;
  await redis.incr(key); await redis.expire(key, 900);
  return json({ error: '비밀번호가 틀렸어요' }, 401);
}

export const page = (title, msg, ok = true) =>
  new Response(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#0e0f12;color:#f2f2f4;padding:24px}
.c{max-width:420px;text-align:center}.i{font-size:56px}h1{font-size:24px;margin:12px 0 8px}p{color:#a0a3ab;line-height:1.6}</style></head>
<body><div class="c"><div class="i">${ok ? '✅' : '⚠️'}</div><h1>${title}</h1><p>${msg}</p></div></body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
