import { getStats, getRuleStats, listAccounts, dayKey } from '../lib/store.js';
import { json, isAdmin } from '../lib/http.js';

// /api/stats?igId=…|all&from=YYYYMMDD&to=YYYYMMDD
export async function GET(request) {
  if (!isAdmin(request)) return json({ error: '비밀번호가 틀렸어요' }, 401);
  const p = new URL(request.url).searchParams;
  const ok = (s) => /^\d{8}$/.test(s || '');
  const to = ok(p.get('to')) ? p.get('to') : dayKey();
  const from = ok(p.get('from')) && p.get('from') <= to ? p.get('from') : to;
  const igId = p.get('igId');
  const accs = await listAccounts();
  const ids = igId && igId !== 'all' ? [igId] : accs.map((a) => a.igId);
  const st = await getStats(ids, from, to);
  st.from = from; st.to = to;
  if (igId && igId !== 'all') st.byRule = await getRuleStats(igId);
  else st.byAccount = st.perAccount.map((x) => ({ ...x, username: accs.find((a) => a.igId === x.igId)?.username || x.igId }));
  return json(st);
}
