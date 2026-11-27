import { getStats, listAccounts } from '../lib/store.js';
import { json, isAdmin } from '../lib/http.js';

export async function GET(request) {
  if (!isAdmin(request)) return json({ error: '비밀번호가 틀렸어요' }, 401);
  const p = new URL(request.url).searchParams;
  const days = Math.min(Math.max(Number(p.get('days')) || 30, 7), 90);
  const igId = p.get('igId');
  if (igId && igId !== 'all') return json(await getStats(igId, days));

  // 전체 계정 합계 + 계정별 요약
  const accs = await listAccounts();
  const all = await Promise.all(accs.map((a) => getStats(a.igId, days)));
  const daily = all[0]?.daily.map((d, i) => {
    const o = { day: d.day };
    for (const k of ['match', 'dm_ok', 'dm_fail', 'reply_ok', 'click']) o[k] = all.reduce((s, x) => s + x.daily[i][k], 0);
    return o;
  }) || [];
  const byAccount = accs.map((a, i) => {
    const t = (k) => all[i].daily.reduce((s, d) => s + d[k], 0);
    return { igId: a.igId, username: a.username, picture: a.picture, dm_ok: t('dm_ok'), dm_fail: t('dm_fail'), click: t('click') };
  });
  return json({ daily, byAccount });
}
