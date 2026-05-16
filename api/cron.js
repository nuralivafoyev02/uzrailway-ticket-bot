import { config } from '../src/config.js';
import { runMonitor } from '../src/services/monitor.js';
import { jsonResponse, getQueryParam } from '../src/utils/http.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return jsonResponse(res, 405, { ok: false, error: 'Method not allowed' });

  const authorization = req.headers.authorization || '';
  const querySecret = getQueryParam(req, 'secret');
  const hasSecret = Boolean(config.cronSecret);
  const authorized = !hasSecret || authorization === `Bearer ${config.cronSecret}` || querySecret === config.cronSecret;
  if (!authorized) return jsonResponse(res, 401, { ok: false, error: 'Unauthorized cron' });

  try {
    const startedAt = new Date().toISOString();
    const summary = await runMonitor();
    return jsonResponse(res, 200, { ok: true, startedAt, finishedAt: new Date().toISOString(), summary });
  } catch (error) {
    console.error('[CRON:handler]', error);
    return jsonResponse(res, 500, { ok: false, error: error.message, code: error.code || null });
  }
}
