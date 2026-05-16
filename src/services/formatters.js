import crypto from 'node:crypto';
import { escapeHtml } from '../utils/text.js';
import { formatDateUz } from '../utils/date.js';

export function money(value) {
  if (!Number.isFinite(Number(value))) return 'narx ko‘rsatilmagan';
  return `${Math.round(Number(value)).toLocaleString('ru-RU')} so‘m`;
}

export function trainResultHash(result) {
  const source = JSON.stringify((result.trains || []).map((train) => ({
    n: train.number,
    fs: train.freeSeats,
    p: train.minPrice,
    c: (train.cars || []).map((car) => [car.type, car.freeSeats, car.minPrice])
  })));
  return crypto.createHash('sha1').update(source).digest('hex');
}

export function formatSearchResult(result) {
  const { fromStation, toStation, travelDate } = result.query;
  const header = [
    `🚆 <b>${escapeHtml(fromStation.name)} → ${escapeHtml(toStation.name)}</b>`,
    `📅 Sana: <b>${formatDateUz(travelDate)}</b>`,
    `🔎 Topilgan poyezdlar: <b>${result.totalTrains}</b>`,
    `💺 Bo‘sh joylar: <b>${result.totalFreeSeats}</b>`,
    ''
  ];

  if (!result.totalTrains) {
    return header.join('\n') + '❌ Bu sana/yo‘nalish bo‘yicha poyezd topilmadi.';
  }

  const lines = result.trains.slice(0, 12).map((train, index) => {
    const carLines = (train.cars || [])
      .filter((car) => car.freeSeats > 0)
      .slice(0, 6)
      .map((car) => `   • ${escapeHtml(car.type)} ${car.number ? `№${escapeHtml(car.number)} ` : ''}— ${car.freeSeats} joy${car.minPrice ? `, ${money(car.minPrice)}` : ''}`)
      .join('\n');

    return [
      `<b>${index + 1}) ${escapeHtml(train.type)} ${escapeHtml(train.number)}</b>`,
      train.route ? `📍 ${escapeHtml(train.route)}` : null,
      train.departureDate ? `🕘 Jo‘nash: ${escapeHtml(train.departureDate)}` : null,
      train.arrivalDate ? `🏁 Yetib borish: ${escapeHtml(train.arrivalDate)}` : null,
      `💺 Joy: <b>${train.freeSeats > 0 ? `${train.freeSeats} ta bor ✅` : 'yo‘q ❌'}</b>`,
      train.minPrice ? `💰 Eng arzon: ${money(train.minPrice)}` : null,
      carLines || null
    ].filter(Boolean).join('\n');
  });

  const tail = result.trains.length > 12 ? `\n\n… yana ${result.trains.length - 12} ta poyezd yashirildi.` : '';
  return header.join('\n') + lines.join('\n\n') + tail;
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
