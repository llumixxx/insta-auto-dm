import { getAccount, getRules, setRules } from '../lib/store.js';
import { json, isAdmin } from '../lib/http.js';

const clean = (r) => ({
  id: r.id || crypto.randomUUID(),
  name: String(r.name || '').slice(0, 60),
  mediaId: String(r.mediaId || 'all'),
  mediaLabel: String(r.mediaLabel || '').slice(0, 120),
  mediaThumb: String(r.mediaThumb || '').slice(0, 1000),
  keywords: (r.keywords || []).map((k) => String(k).trim()).filter(Boolean).slice(0, 20),
  dm: String(r.dm || '').slice(0, 1000),
  replies: (r.replies || []).map((k) => String(k).trim()).filter(Boolean).slice(0, 5),
  on: r.on !== false,
  track: r.track !== false,
});

export async function GET(request) {
  if (!isAdmin(request)) return json({ error: '비밀번호가 틀렸어요' }, 401);
  const igId = new URL(request.url).searchParams.get('igId');
  return json({ rules: await getRules(igId) });
}

// 저장(추가/수정): body = rule
export async function POST(request) {
  if (!isAdmin(request)) return json({ error: '비밀번호가 틀렸어요' }, 401);
  const igId = new URL(request.url).searchParams.get('igId');
  if (!(await getAccount(igId))) return json({ error: '계정을 찾을 수 없어요' }, 404);
  const r = clean(await request.json());
  if (!r.keywords.length) return json({ error: '키워드를 하나 이상 넣어주세요' }, 400);
  if (!r.dm) return json({ error: 'DM 내용을 넣어주세요' }, 400);
  const rules = await getRules(igId);
  const i = rules.findIndex((x) => x.id === r.id);
  if (i >= 0) rules[i] = r; else rules.unshift(r);
  await setRules(igId, rules);
  return json({ ok: true, rules });
}

export async function DELETE(request) {
  if (!isAdmin(request)) return json({ error: '비밀번호가 틀렸어요' }, 401);
  const p = new URL(request.url).searchParams;
  const igId = p.get('igId'), id = p.get('id');
  const rules = (await getRules(igId)).filter((x) => x.id !== id);
  await setRules(igId, rules);
  return json({ ok: true, rules });
}
