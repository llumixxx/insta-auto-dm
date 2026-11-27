import { getLogs } from '../lib/store.js';
import { json, adminGate } from '../lib/http.js';

export async function GET(request) {
  { const deny = await adminGate(request); if (deny) return deny; }
  const igId = new URL(request.url).searchParams.get('igId');
  return json({ logs: await getLogs(igId, 100) });
}
