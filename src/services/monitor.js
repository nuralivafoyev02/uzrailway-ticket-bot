import { config } from '../config.js';
import { dbGetActiveWatches, dbUpdateWatchResult, dbLog } from '../supabase.js';
import { sendMessage, notifyAdmins } from '../telegram.js';
import { searchTrains } from './railwayClient.js';
import { trainResultHash, formatSearchResult, formatProtectionError } from './formatters.js';

export async function runMonitor() {
  const watches = await dbGetActiveWatches(config.cronBatchSize);
  const summary = { checked: 0, notified: 0, failed: 0, protection: 0 };

  for (const watch of watches) {
    summary.checked += 1;
    try {
      const result = await searchTrains({
        fromStation: { code: watch.from_station_code, name: watch.from_station_name },
        toStation: { code: watch.to_station_code, name: watch.to_station_name },
        travelDate: watch.travel_date
      });
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
        await sendMessage(watch.telegram_id, `✅ <b>Joy chiqdi!</b>\n\n${formatSearchResult(result)}`);
      }
    } catch (error) {
      summary.failed += 1;
      if (error.code === 'RAILWAY_PROTECTION') {
        summary.protection += 1;
        await notifyAdmins(formatProtectionError(error));
      }
      await dbUpdateWatchResult(watch.id, {
        last_checked_at: new Date().toISOString(),
        last_error: JSON.stringify({ code: error.code, message: error.message, details: error.details }).slice(0, 2000),
        last_status: error.code === 'RAILWAY_PROTECTION' ? 'sayt himoyasi aniqlandi' : 'tekshirishda xatolik'
      });
      await dbLog('ERROR', 'monitor', error.message, { code: error.code, details: error.details, watchId: watch.id });
    }
  }

  return summary;
}

function canNotify(lastNotifiedAt) {
  if (!lastNotifiedAt) return true;
  const diffMs = Date.now() - new Date(lastNotifiedAt).getTime();
  return diffMs >= config.minNotifyIntervalMinutes * 60 * 1000;
}
