import { setRuntimeEnv } from './src/runtime-env.js';
import { config, assertBaseEnv } from './src/config.js';
import { handleUpdate } from './src/bot/router.js';
import { runMonitor } from './src/services/monitor.js';
import { telegram } from './src/telegram.js';
import { getSupabase } from './src/supabase.js';

export default {
  async fetch(request, env, ctx) {
    setRuntimeEnv(env);
    const url = new URL(request.url);

    if (url.pathname === '/api/bot') return handleBotWebhook(request, url, ctx);
    if (url.pathname === '/api/setWebhook') return handleSetWebhook(request, url);
    if (url.pathname === '/api/cron') return handleCron(request, url);
    if (url.pathname === '/api/health') return handleHealth();

    return json({ ok: false, error: 'Not found' }, 404);
  },

  async scheduled(controller, env, ctx) {
    setRuntimeEnv(env);
    ctx.waitUntil(runScheduledMonitor(controller));
  }
};

async function handleBotWebhook(request, url, ctx) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const querySecret = url.searchParams.get('secret');
  const telegramSecret = request.headers.get('x-telegram-bot-api-secret-token');
  const authorized = Boolean(
    config.webhookSecret &&
      (querySecret === config.webhookSecret || telegramSecret === config.webhookSecret)
  );

  if (!authorized) return json({ ok: false, error: 'Unauthorized webhook' }, 401);

  let update;
  try {
    update = await request.json();
  } catch (error) {
    return json({ ok: false, error: 'Invalid JSON body', details: error.message }, 400);
  }

  ctx.waitUntil(handleUpdate(update).catch((error) => {
    console.error('[BOT:worker]', error);
  }));

  return json({ ok: true });
}

async function handleSetWebhook(request, url) {
  if (!['GET', 'POST'].includes(request.method)) return json({ ok: false, error: 'Method not allowed' }, 405);
  const secret = url.searchParams.get('secret');
  if (!config.webhookSecret || secret !== config.webhookSecret) return json({ ok: false, error: 'Unauthorized' }, 401);

  const missing = assertBaseEnv({ appUrl: false });
  if (missing.length) return json({ ok: false, missing }, 400);

  try {
    const appUrl = url.origin;
    const webhookUrl = `${appUrl}/api/bot?secret=${encodeURIComponent(config.webhookSecret)}`;
    const result = await telegram('setWebhook', {
      url: webhookUrl,
      secret_token: config.webhookSecret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false
    });
    return json({ ok: true, webhookUrl, result });
  } catch (error) {
    return json({ ok: false, error: error.message, telegram: error.response || null }, 500);
  }
}

async function handleCron(request, url) {
  if (!['GET', 'POST'].includes(request.method)) return json({ ok: false, error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('authorization') || '';
  const querySecret = url.searchParams.get('secret');
  const hasSecret = Boolean(config.cronSecret);
  const authorized = !hasSecret || authorization === `Bearer ${config.cronSecret}` || querySecret === config.cronSecret;
  if (!authorized) return json({ ok: false, error: 'Unauthorized cron' }, 401);

  try {
    const startedAt = new Date().toISOString();
    const summary = await runMonitor();
    return json({ ok: true, startedAt, finishedAt: new Date().toISOString(), summary });
  } catch (error) {
    console.error('[CRON:worker]', error);
    return json({ ok: false, error: error.message, code: error.code || null }, 500);
  }
}

async function handleHealth() {
  const missing = assertBaseEnv({ appUrl: false });
  let dbOk = false;
  let dbError = null;

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    dbError = 'Supabase env is missing';
  } else {
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('bot_users')
        .select('telegram_id', { count: 'exact', head: true });

      dbOk = !error;
      dbError = error?.message || null;
    } catch (error) {
      dbError = error?.message || String(error);
    }
  }

  return json({
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
      railway_base_url: config.railway.baseUrl,
      watch_interval_seconds: config.watchIntervalSeconds
    },
    missing,
    db: { ok: dbOk, error: dbError }
  });
}

async function runScheduledMonitor(controller) {
  try {
    const summary = await runMonitor();
    console.log('[SCHEDULED:worker]', JSON.stringify({
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
      summary
    }));
  } catch (error) {
    console.error('[SCHEDULED:worker]', error);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
