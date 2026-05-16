export const config = {
  botToken: process.env.BOT_TOKEN || '',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  cronSecret: process.env.CRON_SECRET || '',
  railway: {
    baseUrl: (process.env.RAILWAY_BASE_URL || 'https://eticket.railway.uz').replace(/\/$/, ''),
    lang: process.env.RAILWAY_LANG || 'uz',
    timeoutMs: Number(process.env.RAILWAY_HTTP_TIMEOUT_MS || 25000),
    retries: Number(process.env.RAILWAY_REQUEST_RETRIES || 2),
    userAgent:
      process.env.RAILWAY_USER_AGENT ||
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  },
  cronBatchSize: Number(process.env.CRON_BATCH_SIZE || 20),
  minNotifyIntervalMinutes: Number(process.env.MIN_NOTIFY_INTERVAL_MINUTES || 10)
};

export function assertBaseEnv() {
  const missing = [];
  if (!config.botToken) missing.push('BOT_TOKEN');
  if (!config.webhookSecret) missing.push('WEBHOOK_SECRET');
  if (!config.appUrl) missing.push('APP_URL');
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}
