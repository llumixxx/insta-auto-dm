import { getLogs } from '../lib/store.js';
import { json, isAdmin } from '../lib/http.js';

export async function GET(request) {
  if (!isAdmin(request)) return json({ error: '비밀번호가 틀렸어요' }, 401);
  const igId = new URL(request.url).searchParams.get('igId');
  return json({ logs: await getLogs(igId, 100) });
}
