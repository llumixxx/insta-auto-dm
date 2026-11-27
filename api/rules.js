import { getAccount, getRules, setRules } from '../lib/store.js';
import { json, adminGate } from '../lib/http.js';

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
  mode: ['text', 'button', 'two'].includes(r.mode) ? r.mode : (r.btnUrl ? 'button' : 'text'),
  once: r.once !== false,
  dm2: String(r.dm2 || '').slice(0, 640),
  openLabel: String(r.openLabel || '').trim().slice(0, 20),
  btnTitle: String(r.btnTitle || '').trim().slice(0, 20),
  btnUrl: String(r.btnUrl || '').trim().slice(0, 500),
});

export async function GET(request) {
  { const deny = await adminGate(request); if (deny) return deny; }
  const igId = new URL(request.url).searchParams.get('igId');
  return json({ rules: await getRules(igId) });
}

// 저장(추가/수정): body = rule
export async function POST(request) {
  { const deny = await adminGate(request); if (deny) return deny; }
  const igId = new URL(request.url).searchParams.get('igId');
  if (!(await getAccount(igId))) return json({ error: '계정을 찾을 수 없어요' }, 404);
  const r = clean(await request.json());
  if (!r.keywords.length) return json({ error: '키워드를 하나 이상 넣어주세요' }, 400);
  if (!r.dm) return json({ error: 'DM 내용을 넣어주세요' }, 400);
  if (r.mode === 'button' && !r.btnUrl) return json({ error: '버튼 링크를 넣어주세요' }, 400);
  if (r.mode === 'button' && r.dm.length > 640) return json({ error: '버튼 DM은 640자 이하로 줄여주세요' }, 400);
  if (r.mode === 'two' && !r.btnUrl && !r.dm2) return json({ error: '두 번째 DM 내용이나 버튼 링크를 넣어주세요' }, 400);
  const rules = await getRules(igId);
  const i = rules.findIndex((x) => x.id === r.id);
  if (i >= 0) rules[i] = r; else rules.unshift(r);
  await setRules(igId, rules);
  return json({ ok: true, rules });
}

export async function DELETE(request) {
  { const deny = await adminGate(request); if (deny) return deny; }
  const p = new URL(request.url).searchParams;
  const igId = p.get('igId'), id = p.get('id');
  const rules = (await getRules(igId)).filter((x) => x.id !== id);
  await setRules(igId, rules);
  return json({ ok: true, rules });
}
