import { config, assertBaseEnv } from '../src/config.js';
import { telegram } from '../src/telegram.js';
import { jsonResponse, getQueryParam } from '../src/utils/http.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return jsonResponse(res, 405, { ok: false, error: 'Method not allowed' });
  const secret = getQueryParam(req, 'secret');
  if (!config.webhookSecret || secret !== config.webhookSecret) return jsonResponse(res, 401, { ok: false, error: 'Unauthorized' });

  const missing = assertBaseEnv();
  if (missing.length) return jsonResponse(res, 400, { ok: false, missing });

  try {
    const webhookUrl = `${config.appUrl}/api/bot?secret=${encodeURIComponent(config.webhookSecret)}`;
    const result = await telegram('setWebhook', {
      url: webhookUrl,
      secret_token: config.webhookSecret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false
    });
    return jsonResponse(res, 200, { ok: true, webhookUrl, result });
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message, telegram: error.response || null });
  }
}
