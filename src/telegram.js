import { config } from './config.js';
import { chunkText } from './utils/text.js';

export async function telegram(method, payload = {}) {
  if (!config.botToken) throw new Error('BOT_TOKEN is missing');
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    const description = data?.description || `Telegram API error ${response.status}`;
    const error = new Error(description);
    error.response = data;
    throw error;
  }
  return data.result;
}

export async function sendMessage(chatId, text, options = {}) {
  const chunks = chunkText(text);
  let result = null;
  for (const chunk of chunks) {
    result = await telegram('sendMessage', {
      chat_id: chatId,
      text: chunk,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: options.disableWebPagePreview ?? true,
      reply_markup: options.replyMarkup
    });
  }
  return result;
}

export async function editMessageText(chatId, messageId, text, options = {}) {
  return telegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options.parseMode || 'HTML',
    disable_web_page_preview: true,
    reply_markup: options.replyMarkup
  });
}

export async function answerCallbackQuery(callbackQueryId, text = '') {
  return telegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false
  });
}

export async function notifyAdmins(text) {
  const ids = config.adminIds;
  if (!ids.length) return;
  await Promise.allSettled(ids.map((id) => sendMessage(id, text)));
}
