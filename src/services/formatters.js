import crypto from 'node:crypto';
import { config } from '../config.js';
import { escapeHtml } from '../utils/text.js';
import { formatDateUz } from '../utils/date.js';

export const RESULT_PAGE_SIZE = 4;

export function money(value) {
  if (!Number.isFinite(Number(value))) return 'narx ko‘rsatilmagan';
  return `${Math.round(Number(value)).toLocaleString('ru-RU')} so‘m`;
}

export function trainResultHash(result) {
  const source = JSON.stringify(getVisibleTrains(result).map((train) => ({
    n: train.number,
    fs: train.freeSeats,
    p: train.minPrice,
    c: (train.cars || []).map((car) => [car.type, car.freeSeats, car.minPrice])
  })));
  return crypto.createHash('sha1').update(source).digest('hex');
}

export function getVisibleTrains(result) {
  const trains = result?.trains || [];
  return trains.filter((train) => train.freeSeats > 0);
}

export function getSearchResultPageCount(result, pageSize = RESULT_PAGE_SIZE) {
  return Math.max(1, Math.ceil(getVisibleTrains(result).length / pageSize));
}

export function formatSearchResult(result, options = {}) {
  const page = Math.max(0, Number(options.page || 0));
  const pageSize = Math.max(1, Number(options.pageSize || RESULT_PAGE_SIZE));
  const { fromStation, toStation, travelDate } = result.query;
  const visibleTrains = getVisibleTrains(result);
  const pageCount = getSearchResultPageCount(result, pageSize);
  const safePage = Math.min(page, pageCount - 1);
  const pageTrains = visibleTrains.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const header = [
    `🚆 <b>${escapeHtml(fromStation.name)} → ${escapeHtml(toStation.name)}</b>`,
    `📅 Sana: <b>${formatDateUz(travelDate)}</b>`,
    `🔎 Bo‘sh joyli reyslar: <b>${visibleTrains.length}</b>`,
    `💺 Bo‘sh joylar: <b>${result.totalFreeSeats}</b>`,
    pageCount > 1 ? `📄 Sahifa: <b>${safePage + 1}/${pageCount}</b>` : null
  ].filter(Boolean);

  if (!result.totalTrains) {
    return `${header.join('\n')}\n\n❌ Bu sana/yo‘nalish bo‘yicha poyezd topilmadi.`;
  }

  if (!visibleTrains.length) {
    return `${header.join('\n')}\n\n❌ Hozircha bo‘sh joyli reys ko‘rinmadi.`;
  }

  const lines = pageTrains.map((train, index) => {
    const carLines = (train.cars || [])
      .filter((car) => car.freeSeats > 0)
      .slice(0, 6)
      .map((car) => `   • ${escapeHtml(car.type)} ${car.number ? `№${escapeHtml(car.number)} ` : ''}— ${car.freeSeats} joy${car.minPrice ? `, ${money(car.minPrice)}` : ''}`)
      .join('\n');

    return [
      `<b>${safePage * pageSize + index + 1}) ${escapeHtml(train.type)} ${escapeHtml(train.number)}</b>`,
      train.route ? `📍 ${escapeHtml(train.route)}` : null,
      train.departureDate ? `🕘 Jo‘nash: ${escapeHtml(train.departureDate)}` : null,
      train.arrivalDate ? `🏁 Yetib borish: ${escapeHtml(train.arrivalDate)}` : null,
      `💺 Joy: <b>${train.freeSeats > 0 ? `${train.freeSeats} ta bor ✅` : 'yo‘q ❌'}</b>`,
      train.minPrice ? `💰 Eng arzon: ${money(train.minPrice)}` : null,
      train.freeSeats > 0 ? `🔗 <a href="${escapeHtml(buildBookingUrl(result, train))}">Buyurtma qilish va to‘lov</a>` : null,
      carLines || null
    ].filter(Boolean).join('\n');
  });

  return `${header.join('\n')}\n\n${lines.join('\n\n')}`;
}

export function buildBookingUrl(result, train = null) {
  const { fromStation, toStation, travelDate } = result.query;
  const url = new URL(`/${config.railway.lang}/home`, config.railway.baseUrl);
  url.searchParams.set('from', fromStation.code);
  url.searchParams.set('to', toStation.code);
  url.searchParams.set('date', travelDate);
  if (train?.number) url.searchParams.set('train', train.number);
  return url.toString();
}

export function formatWatchList(watches) {
  if (!watches.length) return '🔕 Sizda aktiv kuzatuv yo‘q.';
  return watches.map((watch, index) => [
    `<b>${index + 1}) ${escapeHtml(watch.from_station_name)} → ${escapeHtml(watch.to_station_name)}</b>`,
    `📅 ${formatDateUz(watch.travel_date)}`,
    `💺 Oxirgi holat: ${escapeHtml(watch.last_status || 'hali tekshirilmagan')}`,
    watch.last_checked_at ? `🕒 Tekshirildi: ${new Date(watch.last_checked_at).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}` : null
  ].filter(Boolean).join('\n')).join('\n\n');
}

export function formatProtectionError(error) {
  return [
    '🛡 <b>Railway saytida himoya yoki blok aniqlandi</b>',
    '',
    `Kod: <code>${escapeHtml(error.code || 'UNKNOWN')}</code>`,
    error.status ? `HTTP: <code>${escapeHtml(error.status)}</code>` : null,
    '',
    'Bot foydalanuvchiga xabar beradi va keyingi cron’da qayta urinadi.'
  ].filter(Boolean).join('\n');
}
