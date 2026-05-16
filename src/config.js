import { getNumberEnv, getStringEnv } from './runtime-env.js';

export const config = {
  get botToken() {
    return getStringEnv('BOT_TOKEN');
  },
  get webhookSecret() {
    return getStringEnv('WEBHOOK_SECRET');
  },
  get appUrl() {
    return getStringEnv('APP_URL').replace(/\/+$/, '');
  },
  get adminIds() {
    return getStringEnv('ADMIN_IDS')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  },
  get supabaseUrl() {
    return getStringEnv('SUPABASE_URL');
  },
  get supabaseServiceRoleKey() {
    return getStringEnv('SUPABASE_SERVICE_ROLE_KEY');
  },
  get cronSecret() {
    return getStringEnv('CRON_SECRET');
  },
  railway: {
    get baseUrl() {
      return getStringEnv('RAILWAY_BASE_URL', 'https://eticket.railway.uz').replace(/\/+$/, '');
    },
    get lang() {
      return getStringEnv('RAILWAY_LANG', 'uz');
    },
    get timeoutMs() {
      return Math.min(getNumberEnv('RAILWAY_HTTP_TIMEOUT_MS', 9000), 9000);
    },
    get retries() {
      return Math.min(getNumberEnv('RAILWAY_REQUEST_RETRIES', 1), 1);
    },
    get userAgent() {
      return getStringEnv(
        'RAILWAY_USER_AGENT',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
      );
    }
  },
  get cronBatchSize() {
    return Math.max(getNumberEnv('CRON_BATCH_SIZE', 50), 50);
  },
  get monitorConcurrency() {
    return getNumberEnv('MONITOR_CONCURRENCY', 4);
  },
  get watchIntervalSeconds() {
    return getNumberEnv('WATCH_INTERVAL_SECONDS', 55);
  },
  get minNotifyIntervalMinutes() {
    return getNumberEnv('MIN_NOTIFY_INTERVAL_MINUTES', 10);
  }
};

export function assertBaseEnv(options = {}) {
  const { appUrl = true, cronSecret = false } = options;
  const missing = [];
  if (!config.botToken) missing.push('BOT_TOKEN');
  if (!config.webhookSecret) missing.push('WEBHOOK_SECRET');
  if (appUrl && !config.appUrl) missing.push('APP_URL');
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (cronSecret && !config.cronSecret) missing.push('CRON_SECRET');
  return missing;
}
