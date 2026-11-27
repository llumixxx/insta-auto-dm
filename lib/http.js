export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export function isAdmin(request) {
  const k = request.headers.get('x-admin-key');
  return !!process.env.ADMIN_PASSWORD && k === process.env.ADMIN_PASSWORD;
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
