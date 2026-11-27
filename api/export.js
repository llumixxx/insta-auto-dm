// 발송 기록 백업 (엑셀에서 바로 열리는 CSV)
// /api/export?igId=…|all&from=YYYYMMDD&to=YYYYMMDD
import { listAccounts, getLogsRange } from '../lib/store.js';
import { adminGate } from '../lib/http.js';

const KST = 9 * 3600e3;
const ymd = (s, end) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) - KST + (end ? 864e5 - 1 : 0);
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // 엑셀 수식 실행 방지
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const when = (t) => new Date(t + KST).toISOString().replace('T', ' ').slice(0, 19);
const dmText = (v) => (!v ? '' : v === 'ok' ? '성공' : v === 'skip' ? '중복이라 안 보냄' : v === 'queued' ? '한도 대기' : String(v).replace(/^fail: /, '실패: '));

export async function GET(request) {
  { const deny = await adminGate(request); if (deny) return deny; }
  const p = new URL(request.url).searchParams;
  const ok = (s) => /^\d{8}$/.test(s || '');
  const from = ok(p.get('from')) ? ymd(p.get('from')) : 0;
  const to = ok(p.get('to')) ? ymd(p.get('to'), true) : Date.now();
  const accs = await listAccounts();
  const igId = p.get('igId');
  const list = igId && igId !== 'all' ? accs.filter((a) => a.igId === igId) : accs;
  const rows = [['시간(한국)', '계정(인스타 아이디)', '댓글 단 사람(인스타 아이디)', '댓글', '규칙', 'DM 결과', '보낸 방식', '대댓글']];
  for (const a of list) {
    for (const l of await getLogsRange(a.igId, from, to)) {
      rows.push([when(l.at), a.username, String(l.user || '').replace(/^@/, ''), l.text, l.rule, dmText(l.dm), l.mode || '', dmText(l.reply)]);
    }
  }
  rows.splice(1, rows.length, ...rows.slice(1).sort((x, y) => x[0].localeCompare(y[0])));
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' } });
}
