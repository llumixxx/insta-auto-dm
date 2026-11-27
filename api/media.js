import { getAccount } from '../lib/store.js';
import { recentMedia } from '../lib/ig.js';
import { json, adminGate } from '../lib/http.js';

export async function GET(request) {
  { const deny = await adminGate(request); if (deny) return deny; }
  const igId = new URL(request.url).searchParams.get('igId');
  const acc = await getAccount(igId);
  if (!acc) return json({ error: '계정을 찾을 수 없어요' }, 404);
  try {
    return json({ media: await recentMedia(igId, acc.token) });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
