import { config } from '../config.js';
import { dbGetActiveWatches, dbSetSession, dbUpdateWatchResult, dbLog } from '../supabase.js';
import { sendMessage, notifyAdmins } from '../telegram.js';
import { searchTrains } from './railwayClient.js';
import { trainResultHash, formatSearchResult, getSearchResultPageCount, formatProtectionError } from './formatters.js';
import { resultKeyboard } from '../bot/keyboards.js';
import { escapeHtml } from '../utils/text.js';
import { formatDateUz } from '../utils/date.js';

export async function runMonitor() {
  const watches = await dbGetActiveWatches(config.cronBatchSize);
  const summary = { checked: 0, notified: 0, failed: 0, protection: 0 };
  const resultCache = new Map();

  await mapConcurrent(watches, config.monitorConcurrency, async (watch) => {
    summary.checked += 1;
    try {
      const result = await getCachedSearchResult(watch, resultCache);
      const hash = trainResultHash(result);
      const status = result.hasSeats ? `${result.totalFreeSeats} ta joy bor` : 'joy yo‘q';
      const now = new Date().toISOString();

      const shouldNotify = result.hasSeats && hash !== watch.last_result_hash && canNotify(watch.last_notified_at);
      await dbUpdateWatchResult(watch.id, {
        last_checked_at: now,
        last_status: status,
        last_result_hash: hash,
        last_error: null,
        ...(shouldNotify ? { last_notified_at: now } : {})
      });

      if (shouldNotify) {
        summary.notified += 1;
        await dbSetSession(watch.telegram_id, 'idle', {
          lastSearch: {
            fromStation: result.query.fromStation,
            toStation: result.query.toStation,
            travelDate: result.query.travelDate
          },
          lastResult: result
        }).catch(() => null);
        await sendMessage(watch.telegram_id, `✅ <b>Joy chiqdi!</b>\n\n${formatSearchResult(result, { page: 0 })}`, {
          replyMarkup: resultKeyboard({ page: 0, totalPages: getSearchResultPageCount(result) })
        });
      }
    } catch (error) {
      summary.failed += 1;
      const errorCode = error.code || 'UNKNOWN';
      const previousErrorCode = parseLastErrorCode(watch.last_error);
      if (errorCode === 'RAILWAY_PROTECTION') {
        summary.protection += 1;
        if (previousErrorCode !== errorCode) await notifyAdmins(formatProtectionError(error));
      }
      const lastError = JSON.stringify({ code: errorCode, message: error.message, details: error.details }).slice(0, 2000);
      await dbUpdateWatchResult(watch.id, {
        last_checked_at: new Date().toISOString(),
        last_error: lastError,
        last_status: errorCode === 'RAILWAY_PROTECTION' ? 'sayt himoyasi aniqlandi' : 'vaqtinchalik xatolik, kuzatuv davom etadi'
      });
      if (previousErrorCode !== errorCode) {
        await sendMessage(watch.telegram_id, formatWatchError(watch, errorCode)).catch(() => null);
      }
      await dbLog('ERROR', 'monitor', error.message, { code: errorCode, details: error.details, watchId: watch.id });
    }
  });

  return summary;
}

function getCachedSearchResult(watch, resultCache) {
  const key = [
    watch.from_station_code,
    watch.to_station_code,
    watch.travel_date
  ].join('|');
  if (!resultCache.has(key)) {
    resultCache.set(key, searchTrains({
      fromStation: { code: watch.from_station_code, name: watch.from_station_name },
      toStation: { code: watch.to_station_code, name: watch.to_station_name },
      travelDate: watch.travel_date
    }));
  }
  return resultCache.get(key);
}

async function mapConcurrent(items, concurrency, mapper) {
  let index = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await mapper(item);
    }
  }));
}

function parseLastErrorCode(lastError) {
  if (!lastError) return null;
  try {
    return JSON.parse(lastError).code || null;
  } catch {
    return null;
  }
}

function formatWatchError(watch, code) {
  return [
    '⚠️ <b>Kuzatuv davom etyapti</b>',
    '',
    `<b>${escapeHtml(watch.from_station_name)} → ${escapeHtml(watch.to_station_name)}</b>`,
    `📅 ${formatDateUz(watch.travel_date)}`,
    '',
    code === 'RAILWAY_PROTECTION'
      ? 'Railway saytida vaqtincha himoya yoki blok holati sezildi. Kuzatuvni o‘chirmadim, keyingi daqiqada yana tekshiraman.'
      : 'Tekshiruvda vaqtinchalik xatolik chiqdi. Kuzatuvni o‘chirmadim, keyingi daqiqada yana urinaman.'
  ].join('\n');
}

function canNotify(lastNotifiedAt) {
  if (!lastNotifiedAt) return true;
  const diffMs = Date.now() - new Date(lastNotifiedAt).getTime();
  return diffMs >= config.minNotifyIntervalMinutes * 60 * 1000;
}
