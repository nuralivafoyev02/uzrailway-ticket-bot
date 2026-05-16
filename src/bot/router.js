import { config, assertBaseEnv } from '../config.js';
import {
  dbUpsertUser,
  dbGetSession,
  dbSetSession,
  dbClearSession,
  dbCreateWatch,
  dbListWatches,
  dbStopWatch,
  dbLog
} from '../supabase.js';
import { sendMessage, answerCallbackQuery, notifyAdmins } from '../telegram.js';
import { mainKeyboard, cancelKeyboard, resultKeyboard, watchKeyboard } from './keyboards.js';
import { resolveStation, stationsListText } from '../services/stations.js';
import { searchTrains } from '../services/railwayClient.js';
import { formatSearchResult, formatWatchList, formatProtectionError } from '../services/formatters.js';
import { parseTravelDate, formatDateUz } from '../utils/date.js';
import { escapeHtml } from '../utils/text.js';

export async function handleUpdate(update) {
  const missing = assertBaseEnv();
  if (missing.length) {
    const chatId = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id;
    if (chatId) await sendMessage(chatId, `⚙️ Bot sozlamalari to‘liq emas: <code>${missing.join(', ')}</code>`);
    return;
  }

  if (update.message) return handleMessage(update.message);
  if (update.callback_query) return handleCallback(update.callback_query);
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const user = message.from;
  const text = (message.text || '').trim();
  await dbUpsertUser(user);

  try {
    if (!text) return sendMessage(chatId, 'Faqat matnli buyruqlarni qabul qilaman 🙂', { replyMarkup: mainKeyboard() });
    if (['/start', 'start'].includes(text.toLowerCase())) return start(chatId);
    if (['/cancel', '❌ bekor qilish'].includes(text.toLowerCase())) return cancel(chatId);
    if (text === '🎫 Bilet qidirish') return beginSearch(chatId);
    if (text === '🔔 Kuzatuvlarim' || text === '/my') return showWatches(chatId);
    if (text === '🚉 Stansiya kodlari' || text === '/stations') return showStations(chatId);
    if (text === 'ℹ️ Yordam' || text === '/help') return help(chatId);

    if (text.startsWith('/q ') || text.startsWith('/search ')) {
      return quickSearch(chatId, text.replace(/^\/(q|search)\s+/i, ''));
    }
    if (text.startsWith('/watch ')) {
      return quickWatch(chatId, text.replace(/^\/watch\s+/i, ''));
    }

    const session = await dbGetSession(user.id);
    if (session?.step?.startsWith('awaiting_')) return continueSearchFlow(chatId, user.id, text, session);

    const parsed = parseQuickSearch(text);
    if (parsed) return performSearch(chatId, user.id, parsed);

    return sendMessage(chatId, 'Tushunmadim 🙂 Bilet qidirish uchun pastdagi tugmani bosing yoki shunday yozing:\n\n<code>/q Toshkent|Samarqand|20.05.2026</code>', {
      replyMarkup: mainKeyboard()
    });
  } catch (error) {
    await handleBotError(chatId, error, 'message');
  }
}

async function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const userId = callback.from.id;
  const data = callback.data || '';
  await dbUpsertUser(callback.from);
  await answerCallbackQuery(callback.id).catch(() => null);

  try {
    if (data === 'new_search') return beginSearch(chatId);
    if (data === 'watch_last') return createWatchFromLastSearch(chatId, userId);
    if (data.startsWith('stop:')) {
      const id = data.slice('stop:'.length);
      const stopped = await dbStopWatch(id, userId);
      if (!stopped) return sendMessage(chatId, 'Bu kuzatuv topilmadi yoki allaqachon to‘xtatilgan.');
      return sendMessage(chatId, '✅ Kuzatuv to‘xtatildi.', { replyMarkup: mainKeyboard() });
    }
  } catch (error) {
    await handleBotError(chatId, error, 'callback');
  }
}

async function start(chatId) {
  await dbClearSession(chatId).catch(() => null);
  return sendMessage(chatId, [
    'Assalomu alaykum! 👋',
    '',
    'Men O‘zbekiston temir yo‘llari bo‘yicha bilet/joy holatini tekshiraman.',
    '',
    'Nimalar qila olaman:',
    '🎫 yo‘nalish va sana bo‘yicha bilet qidirish',
    '🔔 joy chiqsa Telegram orqali xabar berish',
    '🛡 sayt himoyasi yoki reCAPTCHA chiqsa adminlarga xabar yuborish',
    '',
    'Boshlash uchun <b>🎫 Bilet qidirish</b> tugmasini bosing.'
  ].join('\n'), { replyMarkup: mainKeyboard() });
}

async function help(chatId) {
  return sendMessage(chatId, [
    'ℹ️ <b>Yordam</b>',
    '',
    'Qidiruv formati:',
    '<code>/q Toshkent|Samarqand|20.05.2026</code>',
    '',
    'Kuzatuv yaratish:',
    '<code>/watch Toshkent|Samarqand|2026-05-20</code>',
    '',
    'Sana formatlari:',
    '• <code>bugun</code>',
    '• <code>ertaga</code>',
    '• <code>20.05.2026</code>',
    '• <code>2026-05-20</code>',
    '',
    'Stansiya kodlarini ko‘rish: /stations'
  ].join('\n'), { replyMarkup: mainKeyboard() });
}

async function showStations(chatId) {
  return sendMessage(chatId, `🚉 <b>Asosiy stansiya kodlari</b>\n\n${stationsListText()}\n\nKod bilan ham qidirishingiz mumkin: <code>/q 2900000|2900700|2026-05-20</code>`, {
    replyMarkup: mainKeyboard()
  });
}

async function cancel(chatId) {
  await dbClearSession(chatId).catch(() => null);
  return sendMessage(chatId, 'Bekor qilindi ✅', { replyMarkup: mainKeyboard() });
}

async function beginSearch(chatId) {
  await dbSetSession(chatId, 'awaiting_from', {});
  return sendMessage(chatId, 'Qayerdan ketasiz? Masalan: <b>Toshkent</b>', { replyMarkup: cancelKeyboard() });
}

async function continueSearchFlow(chatId, userId, text, session) {
  const payload = session.payload || {};
  if (session.step === 'awaiting_from') {
    const from = resolveStation(text);
    if (!from) return sendMessage(chatId, 'Bu stansiyani topa olmadim. /stations orqali kodlarni ko‘ring yoki aniqroq yozing.' );
    await dbSetSession(userId, 'awaiting_to', { ...payload, from });
    return sendMessage(chatId, `Qayerga borasiz? Masalan: <b>Samarqand</b>\n\nTanlandi: ${escapeHtml(from.name)} → ?`);
  }

  if (session.step === 'awaiting_to') {
    const to = resolveStation(text);
    if (!to) return sendMessage(chatId, 'Bu stansiyani topa olmadim. /stations orqali kodlarni ko‘ring yoki aniqroq yozing.' );
    if (String(to.code) === String(payload.from?.code)) return sendMessage(chatId, 'Jo‘nash va borish stansiyasi bir xil bo‘lmasligi kerak 🙂');
    await dbSetSession(userId, 'awaiting_date', { ...payload, to });
    return sendMessage(chatId, `Qaysi sana? Masalan: <b>ertaga</b> yoki <b>20.05.2026</b>\n\nTanlandi: ${escapeHtml(payload.from.name)} → ${escapeHtml(to.name)}`);
  }

  if (session.step === 'awaiting_date') {
    const travelDate = parseTravelDate(text);
    if (!travelDate) return sendMessage(chatId, 'Sanani tushunmadim. Masalan: <b>ertaga</b>, <b>20.05.2026</b> yoki <b>2026-05-20</b> yozing.');
    return performSearch(chatId, userId, {
      from: payload.from.name,
      to: payload.to.name,
      date: travelDate
    });
  }
}

async function quickSearch(chatId, input) {
  const parsed = parseQuickSearch(input);
  if (!parsed) return sendMessage(chatId, 'Format noto‘g‘ri. To‘g‘ri format: <code>/q Toshkent|Samarqand|20.05.2026</code>');
  return performSearch(chatId, chatId, parsed);
}

async function quickWatch(chatId, input) {
  const parsed = parseQuickSearch(input);
  if (!parsed) return sendMessage(chatId, 'Format noto‘g‘ri. To‘g‘ri format: <code>/watch Toshkent|Samarqand|20.05.2026</code>');
  const fromStation = resolveStation(parsed.from);
  const toStation = resolveStation(parsed.to);
  const travelDate = parseTravelDate(parsed.date);
  if (!fromStation || !toStation || !travelDate) return sendMessage(chatId, 'Stansiya yoki sana topilmadi. /stations orqali kodlarni tekshiring.');
  const watch = await dbCreateWatch({ telegramId: chatId, fromStation, toStation, travelDate });
  return sendMessage(chatId, `🔔 Kuzatuv yaratildi: <b>${escapeHtml(fromStation.name)} → ${escapeHtml(toStation.name)}</b>\n📅 ${formatDateUz(watch.travel_date)}`);
}

function parseQuickSearch(input) {
  const text = String(input || '').trim();
  let parts = text.split('|').map((x) => x.trim()).filter(Boolean);
  if (parts.length === 3) return { from: parts[0], to: parts[1], date: parts[2] };

  const arrow = text.match(/^(.+?)\s*(?:->|→|—|-)\s*(.+?)\s+(\d{1,2}[./-]\d{1,2}(?:[./-]20\d{2})?|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|bugun|ertaga)$/i);
  if (arrow) return { from: arrow[1].trim(), to: arrow[2].trim(), date: arrow[3].trim() };
  return null;
}

async function performSearch(chatId, userId, parsed) {
  const fromStation = resolveStation(parsed.from);
  const toStation = resolveStation(parsed.to);
  const travelDate = parseTravelDate(parsed.date);

  if (!fromStation) return sendMessage(chatId, `Jo‘nash stansiyasini topa olmadim: <b>${escapeHtml(parsed.from)}</b>\n/stations orqali kodlarni ko‘ring.`);
  if (!toStation) return sendMessage(chatId, `Borish stansiyasini topa olmadim: <b>${escapeHtml(parsed.to)}</b>\n/stations orqali kodlarni ko‘ring.`);
  if (String(fromStation.code) === String(toStation.code)) return sendMessage(chatId, 'Jo‘nash va borish stansiyasi bir xil bo‘lmasligi kerak 🙂');
  if (!travelDate) return sendMessage(chatId, 'Sanani tushunmadim. Masalan: <code>20.05.2026</code> yoki <code>ertaga</code> yozing.');

  await sendMessage(chatId, `🔎 Qidiryapman: <b>${escapeHtml(fromStation.name)} → ${escapeHtml(toStation.name)}</b>, ${formatDateUz(travelDate)}...`);

  const result = await searchTrains({ fromStation, toStation, travelDate });
  await dbSetSession(userId, 'idle', { lastSearch: { fromStation, toStation, travelDate } });
  return sendMessage(chatId, formatSearchResult(result), { replyMarkup: resultKeyboard() });
}

async function createWatchFromLastSearch(chatId, userId) {
  const session = await dbGetSession(userId);
  const lastSearch = session?.payload?.lastSearch;
  if (!lastSearch) return sendMessage(chatId, 'Oxirgi qidiruv topilmadi. Avval bilet qidirib oling 🙂');
  const watch = await dbCreateWatch({
    telegramId: userId,
    fromStation: lastSearch.fromStation,
    toStation: lastSearch.toStation,
    travelDate: lastSearch.travelDate
  });
  return sendMessage(chatId, `🔔 Kuzatuv yaratildi!\n\n<b>${escapeHtml(watch.from_station_name)} → ${escapeHtml(watch.to_station_name)}</b>\n📅 ${formatDateUz(watch.travel_date)}\n\nJoy chiqsa, shu yerga xabar yuboraman.`, { replyMarkup: mainKeyboard() });
}

async function showWatches(chatId) {
  const watches = await dbListWatches(chatId);
  return sendMessage(chatId, formatWatchList(watches), {
    replyMarkup: watches.length ? watchKeyboard(watches) : mainKeyboard()
  });
}

async function handleBotError(chatId, error, scope) {
  await dbLog('ERROR', scope, error.message, { code: error.code, status: error.status, details: error.details }).catch(() => null);

  if (error.code === 'RAILWAY_PROTECTION') {
    await notifyAdmins(formatProtectionError(error));
    return sendMessage(chatId, [
      '🛡 Railway saytida himoya yoki reCAPTCHA/blok holati sezildi.',
      '',
      'Men buni adminga yubordim. Keyingi urinishda yana tekshiraman.',
      '',
      'Kod: <code>RAILWAY_PROTECTION</code>'
    ].join('\n'), { replyMarkup: mainKeyboard() });
  }

  await notifyAdmins(`⚠️ <b>Bot xatoligi</b>\nScope: <code>${escapeHtml(scope)}</code>\nError: <code>${escapeHtml(error.message)}</code>`);
  return sendMessage(chatId, '⚠️ Xatolik yuz berdi. Adminlarga xabar yuborildi, keyinroq qayta urinib ko‘ring.', { replyMarkup: mainKeyboard() });
}
