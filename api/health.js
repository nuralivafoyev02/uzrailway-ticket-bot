import { config, assertBaseEnv } from '../src/config.js';
import { getSupabase } from '../src/supabase.js';
import { jsonResponse } from '../src/utils/http.js';

export default async function handler(req, res) {
  const missing = assertBaseEnv();
  const supabase = getSupabase();
  let dbOk = false;
  let dbError = null;
  if (supabase) {
    const { error } = await supabase.from('bot_users').select('telegram_id', { count: 'exact', head: true });
    dbOk = !error;
    dbError = error?.message || null;
  }

  return jsonResponse(res, 200, {
    ok: missing.length === 0 && dbOk,
    service: 'uzrailway-ticket-telegram-bot',
    time: new Date().toISOString(),
    env: {
      has_bot_token: Boolean(config.botToken),
      has_webhook_secret: Boolean(config.webhookSecret),
      has_app_url: Boolean(config.appUrl),
      has_supabase_url: Boolean(config.supabaseUrl),
      has_supabase_service_key: Boolean(config.supabaseServiceRoleKey),
      has_cron_secret: Boolean(config.cronSecret),
      railway_base_url: config.railway.baseUrl
    },
    missing,
    db: { ok: dbOk, error: dbError }
  });
}
