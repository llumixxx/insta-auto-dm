// 링크 누른 사람 목록  /api/clickers?igId=…|all&from=YYYYMMDD&to=YYYYMMDD&format=csv
import { listAccounts, getClickers } from '../lib/store.js';
import { json, adminGate } from '../lib/http.js';

const KST = 9 * 3600e3;
const ymd = (s, end) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) - KST + (end ? 864e5 - 1 : 0);
const when = (t) => (t ? new Date(t + KST).toISOString().replace('T', ' ').slice(0, 16) : '');
const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(request) {
  { const deny = await adminGate(request); if (deny) return deny; }
  const p = new URL(request.url).searchParams;
  const ok = (s) => /^\d{8}$/.test(s || '');
  const from = ok(p.get('from')) ? ymd(p.get('from')) : 0;
  const to = ok(p.get('to')) ? ymd(p.get('to'), true) : Date.now();
  const accs = await listAccounts();
  const igId = p.get('igId');
  const list = igId && igId !== 'all' ? accs.filter((a) => a.igId === igId) : accs;
  const rows = [];
  for (const a of list) for (const c of await getClickers(a.igId, from, to)) rows.push({ account: a.username, ...c });
  rows.sort((x, y) => y.last - x.last);
  if (p.get('format') === 'csv') {
    const head = ['인스타 아이디', '프로필 링크', '클릭 수', '처음 클릭', '마지막 클릭', '규칙', '어느 계정 DM'];
    const body = rows.map((r) => [r.username || '(알 수 없음)', r.username ? `https://instagram.com/${r.username}` : '', r.clicks, when(r.first), when(r.last), r.rule, r.account]);
    return new Response('﻿' + [head, ...body].map((x) => x.map(cell).join(',')).join('\r\n'),
      { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  return json({ clickers: rows });
}
