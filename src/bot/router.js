import { config, assertBaseEnv } from '../config.js';
import {
  dbUpsertUser,
  dbGetSession,
  dbSetSession,
  dbClearSession,
  dbCreateWatch,
  dbListWatches,
  dbListUserIds,
  dbStopWatch,
  dbLog
} from '../supabase.js';
import { sendMessage, sendFormattedMessage, editMessageText, copyMessage, answerCallbackQuery, notifyAdmins } from '../telegram.js';
import { mainKeyboard, cancelKeyboard, resultKeyboard, watchKeyboard } from './keyboards.js';
import { resolveStation, stationsListText } from '../services/stations.js';
import { searchTrains } from '../services/railwayClient.js';
import { formatSearchResult, getSearchResultPageCount, formatWatchList, formatProtectionError } from '../services/formatters.js';
import { parseTravelDate, formatDateUz } from '../utils/date.js';
import { escapeHtml } from '../utils/text.js';

export async function handleUpdate(update) {
  const missing = assertBaseEnv({ appUrl: false });
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

  try {
    await dbUpsertUser(user);
    if (!text) return sendMessage(chatId, 'Faqat matnli buyruqlarni qabul qilaman 🙂', { replyMarkup: mainKeyboard() });
    if (['/start', 'start'].includes(text.toLowerCase())) return start(chatId);
    if (['/cancel', '❌ bekor qilish'].includes(text.toLowerCase())) return cancel(chatId);
    if (isMessageCommand(text)) {
      if (isAdmin(user.id)) return broadcastMessage(chatId, message);
      return sendMessage(chatId, 'Tushunmadim 🙂 Bilet qidirish uchun pastdagi tugmani bosing yoki shunday yozing:\n\n<code>/q Toshkent|Samarqand|20.05.2026</code>', {
        replyMarkup: mainKeyboard()
      });
    }
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

  try {
    await dbUpsertUser(callback.from);
    await answerCallbackQuery(callback.id).catch(() => null);
    if (data === 'new_search') return beginSearch(chatId);
    if (data === 'watch_last') return createWatchFromLastSearch(chatId, userId);
    if (data.startsWith('result_page:')) return showResultPage(callback, userId, Number(data.slice('result_page:'.length)));
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
  await dbSetSession(userId, 'idle', { lastSearch: { fromStation, toStation, travelDate }, lastResult: result });
  return sendResultPage(chatId, result, 0);
}

async function sendResultPage(chatId, result, page) {
  const totalPages = getSearchResultPageCount(result);
  return sendMessage(chatId, formatSearchResult(result, { page }), {
    replyMarkup: resultKeyboard({ page, totalPages })
  });
}

async function showResultPage(callback, userId, page) {
  const session = await dbGetSession(userId);
  const result = session?.payload?.lastResult;
  if (!result) return sendMessage(callback.message.chat.id, 'Natija eskirgan. Iltimos, qayta qidiring 🙂', { replyMarkup: mainKeyboard() });
  const totalPages = getSearchResultPageCount(result);
  const safePage = Math.max(0, Math.min(Number.isFinite(page) ? page : 0, totalPages - 1));
  return editMessageText(callback.message.chat.id, callback.message.message_id, formatSearchResult(result, { page: safePage }), {
    replyMarkup: resultKeyboard({ page: safePage, totalPages })
  });
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

function isMessageCommand(text) {
  return /^\/message(?:@\w+)?(?:\s|$)/i.test(text);
}

function isAdmin(userId) {
  return config.adminIds.includes(String(userId));
}

async function broadcastMessage(chatId, message) {
  const users = await dbListUserIds();
  if (!users.length) return sendMessage(chatId, 'Hozircha yuborish uchun foydalanuvchi topilmadi.');

  const replied = message.reply_to_message;
  const commandText = extractMessageCommandText(message);
  if (!replied && !commandText.text) {
    return sendMessage(chatId, [
      'Admin xabar yuborish:',
      '',
      '<code>/message matn</code>',
      '',
      'Yoki yuboriladigan xabarga reply qilib <code>/message</code> yozing.'
    ].join('\n'));
  }

  await sendMessage(chatId, `📨 Xabar yuborish boshlandi. Foydalanuvchilar: <b>${users.length}</b>`);
  const summary = { sent: 0, failed: 0 };
  await mapConcurrent(users, 8, async (telegramId) => {
    try {
      if (replied) {
        await copyMessage(telegramId, chatId, replied.message_id);
      } else {
        await sendFormattedMessage(telegramId, commandText.text, {
          entities: commandText.entities,
          disableWebPagePreview: false
        });
      }
      summary.sent += 1;
    } catch (error) {
      summary.failed += 1;
      await dbLog('WARN', 'broadcast', error.message, { telegramId, code: error.code, response: error.response }).catch(() => null);
    }
  });

  return sendMessage(chatId, `✅ Broadcast tugadi.\n\nYuborildi: <b>${summary.sent}</b>\nXato: <b>${summary.failed}</b>`);
}

function extractMessageCommandText(message) {
  const text = message.text || '';
  const match = text.match(/^\/message(?:@\w+)?\s*/i);
  const start = match ? match[0].length : 0;
  const body = text.slice(start).trimStart();
  const trimShift = text.slice(start).length - body.length;
  const offset = start + trimShift;
  const entities = shiftEntities(message.entities || [], offset, body.length);
  return { text: body, entities };
}

function shiftEntities(entities, offset, textLength) {
  return entities
    .map((entity) => {
      const start = entity.offset;
      const end = entity.offset + entity.length;
      if (end <= offset || start >= offset + textLength) return null;
      const nextStart = Math.max(start, offset) - offset;
      const nextEnd = Math.min(end, offset + textLength) - offset;
      return { ...entity, offset: nextStart, length: nextEnd - nextStart };
    })
    .filter((entity) => entity && entity.length > 0);
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

async function handleBotError(chatId, error, scope) {
  await dbLog('ERROR', scope, error.message, { code: error.code, status: error.status, details: error.details }).catch(() => null);

  if (error.code === 'RAILWAY_PROTECTION') {
    await notifyAdmins(formatProtectionError(error));
    return sendMessage(chatId, [
      '🛡 Railway saytida himoya yoki reCAPTCHA/blok holati sezildi.',
      '',
      'Keyingi urinishda yana tekshiraman.'
    ].join('\n'), { replyMarkup: mainKeyboard() });
  }

  await notifyAdmins(`⚠️ <b>Bot xatoligi</b>\nScope: <code>${escapeHtml(scope)}</code>\nError: <code>${escapeHtml(error.message)}</code>`);
  return sendMessage(chatId, [
    '⚠️ Hozir tekshiruvda vaqtinchalik xatolik chiqdi.',
    '',
    'Men to‘xtab qolmadim va keyingi urinishda yana ishlayman. Iltimos, birozdan keyin qayta urinib ko‘ring.'
  ].join('\n'), { replyMarkup: mainKeyboard() });
}
