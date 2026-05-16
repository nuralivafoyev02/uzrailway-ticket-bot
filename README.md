# UzRailway Ticket Telegram Bot

Telegram bot for checking Uzbekistan Railway ticket availability and monitoring seats.

## Features

- `/start` menu with clean Uzbek UI
- Search ticket availability by route and date
- Save route monitoring and notify user when seats appear
- Detects possible Railway site protection / captcha / block / non-JSON issues
- Sends admin alerts on serious provider errors
- Cloudflare Worker deployment with one-minute Cron Trigger
- Vercel-ready Node.js API routes
- Supabase schema included

## Important note

The bot uses the public web endpoint used by the official e-ticket website:

`POST https://eticket.railway.uz/api/v3/handbook/trains/list`

This can change at any time. If the Railway website changes API format, XSRF handling, captcha, Cloudflare/Turnstile policy, or station codes, the bot will not silently break: users/admins will receive an error notification.

## File structure

```txt
api/
  bot.js          Telegram webhook
  cron.js         Checks active watches
  health.js       Deployment health check
  setWebhook.js   Registers Telegram webhook
src/
  bot/            Bot commands, flow, keyboards
  services/       Railway client, stations, monitor, formatters
  utils/          HTTP, date, text helpers
supabase/
  001_migration.sql
vercel.json       Safe Vercel config for all plans
vercel.pro.json   Optional Vercel Cron every 5 minutes
worker.js         Cloudflare Worker entrypoint
wrangler.jsonc    Cloudflare Worker + every-minute cron config
```

## 1. Create Telegram bot

1. Open `@BotFather`
2. Create bot with `/newbot`
3. Copy token into `BOT_TOKEN`

## 2. Create Supabase tables

Open Supabase SQL Editor and run:

```sql
supabase/001_migration.sql
```

Then copy:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Use service role key only in Vercel environment variables. Do not expose it in frontend.

## 3. Vercel environment variables

Copy `.env.example` values to Vercel Project → Settings → Environment Variables.

Required:

```env
BOT_TOKEN=
WEBHOOK_SECRET=
ADMIN_IDS=
APP_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

`WEBHOOK_SECRET` and `CRON_SECRET` should be long random strings.

## 4. Deploy to Cloudflare Workers

Install dependencies and upload the existing env values as Worker secrets:

```bash
npm install
npx wrangler secret bulk .env.example
npm run cf:deploy
```

The Worker exposes:

```txt
/api/bot
/api/setWebhook?secret=WEBHOOK_SECRET
/api/cron?secret=CRON_SECRET
/api/health
```

`wrangler.jsonc` configures Cloudflare Cron as `* * * * *`, so active watches are checked every minute.

After deployment, call:

```txt
https://your-worker.workers.dev/api/setWebhook?secret=WEBHOOK_SECRET
```

## 5. Deploy to Vercel

```bash
npm install
vercel --prod
```

After deployment, set:

```env
APP_URL=https://your-project.vercel.app
```

Then redeploy once.

## 6. Set Telegram webhook

Open this URL in browser:

```txt
https://your-project.vercel.app/api/setWebhook?secret=WEBHOOK_SECRET
```

Expected response:

```json
{ "ok": true }
```

## 7. Cron / monitoring

The route is ready:

```txt
https://your-project.vercel.app/api/cron?secret=CRON_SECRET
```

### Recommended for Vercel Hobby

Use an external cron service such as cron-job.org, EasyCron, or UptimeRobot to call the URL every 5 minutes.

### Vercel Pro option

If your Vercel plan accepts frequent cron schedules, replace `vercel.json` with `vercel.pro.json` before deploy:

```bash
cp vercel.pro.json vercel.json
vercel --prod
```

## Bot usage

Search:

```txt
/q Toshkent|Samarqand|20.05.2026
```

Watch:

```txt
/watch Toshkent|Samarqand|2026-05-20
```

Stations:

```txt
/stations
```

My watches:

```txt
/my
```

## Main station codes

- Toshkent — `2900000`
- Toshkent Shimoliy — `2900001`
- Toshkent Janubiy — `2900002`
- Samarqand — `2900700`
- Buxoro — `2900800`
- Xiva — `2900172`
- Urganch — `2900790`
- Nukus — `2900970`
- Navoiy — `2900930`
- Andijon — `2900680`
- Qarshi — `2900750`
- Jizzax — `2900720`
- Termiz — `2900255`
- Guliston — `2900850`
- Qo'qon — `2900880`
- Marg'ilon — `2900920`
- Pop — `2900693`
- Namangan — `2900940`

## Troubleshooting

### Bot replies: Railway site protection detected

Possible reasons:

- Railway added captcha / reCAPTCHA / Turnstile
- XSRF token logic changed
- IP was rate-limited
- Website returned HTML instead of JSON

The bot sends admin alert and updates watch status. You can reduce cron frequency or move the checker to a server with a stable residential/Uzbekistan IP if required.

### No notifications

Check:

1. `/api/health`
2. Supabase migration exists
3. External cron is calling `/api/cron?secret=...`
4. `CRON_SECRET` matches
5. User has active watch in `/my`

### Vercel Hobby cron fails deployment

Keep the default `vercel.json` and use external cron. Frequent Vercel Cron can be plan-limited.
