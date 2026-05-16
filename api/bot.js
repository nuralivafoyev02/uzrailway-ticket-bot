import { config } from '../src/config.js';
import { handleUpdate } from '../src/bot/router.js';
import { jsonResponse, readJsonBody, getQueryParam } from '../src/utils/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { ok: false, error: 'Method not allowed' });

  const querySecret = getQueryParam(req, 'secret');
  const telegramSecret = req.headers['x-telegram-bot-api-secret-token'];
  const authorized = Boolean(
    config.webhookSecret &&
      (querySecret === config.webhookSecret || telegramSecret === config.webhookSecret)
  );

  if (!authorized) return jsonResponse(res, 401, { ok: false, error: 'Unauthorized webhook' });

  try {
    const update = await readJsonBody(req);
    await handleUpdate(update);
    return jsonResponse(res, 200, { ok: true });
  } catch (error) {
    console.error('[BOT:handler]', error);
    return jsonResponse(res, 200, { ok: false, error: error.message });
  }
}
