import { getLogs, countLogs } from '../lib/store.js';
import { json, adminGate } from '../lib/http.js';

// /api/logs?igId=…&before=시각(ms)  → 최신순 100개씩
export async function GET(request) {
  { const deny = await adminGate(request); if (deny) return deny; }
  const p = new URL(request.url).searchParams;
  const igId = p.get('igId');
  const before = Number(p.get('before')) || Date.now() + 1;
  const logs = await getLogs(igId, 100, before);
  return json({ logs, total: Number(await countLogs(igId)) || 0, more: logs.length === 100 });
}
