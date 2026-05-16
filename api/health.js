import { config, assertBaseEnv } from '../src/config.js';
import { jsonResponse } from '../src/utils/http.js';

export default async function handler(req, res) {
  try {
    const missing = assertBaseEnv();
    let dbOk = false;
    let dbError = null;

    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      dbError = 'Supabase env is missing';
    } else {
      try {
        const { getSupabase } = await import('../src/supabase.js');
        const supabase = getSupabase();

        if (!supabase) {
          dbError = 'Supabase client was not created';
        } else {
          const { error } = await supabase
            .from('bot_users')
            .select('telegram_id', { count: 'exact', head: true });

          dbOk = !error;
          dbError = error?.message || null;
        }
      } catch (error) {
        dbOk = false;
        dbError = error?.message || String(error);
      }
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
  } catch (error) {
    console.error('[HEALTH:handler]', error);

    return jsonResponse(res, 200, {
      ok: false,
      service: 'uzrailway-ticket-telegram-bot',
      time: new Date().toISOString(),
      error: error?.message || String(error)
    });
  }
}