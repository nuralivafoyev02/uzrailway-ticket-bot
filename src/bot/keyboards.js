export function mainKeyboard() {
  return {
    keyboard: [
      [{ text: '🎫 Bilet qidirish' }, { text: '🔔 Kuzatuvlarim' }],
      [{ text: '🚉 Stansiya kodlari' }, { text: 'ℹ️ Yordam' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

export function resultKeyboard({ page = 0, totalPages = 1 } = {}) {
  const navigation = [];
  if (totalPages > 1 && page > 0) navigation.push({ text: '⬅️ Ortga', callback_data: `result_page:${page - 1}` });
  if (totalPages > 1 && page < totalPages - 1) navigation.push({ text: 'Keyingi ➡️', callback_data: `result_page:${page + 1}` });

  const inline_keyboard = [];
  if (navigation.length) inline_keyboard.push(navigation);
  inline_keyboard.push([{ text: '🔔 Shu yo‘nalishni kuzatish', callback_data: 'watch_last' }]);
  inline_keyboard.push([{ text: '🎫 Yangi qidiruv', callback_data: 'new_search' }]);

  return {
    inline_keyboard
  };
}

export function watchKeyboard(watches) {
  return {
    inline_keyboard: watches.map((watch) => [
      {
        text: `❌ To‘xtatish: ${watch.from_station_name} → ${watch.to_station_name}`,
        callback_data: `stop:${watch.id}`
      }
    ])
  };
}

export function cancelKeyboard() {
  return {
    keyboard: [[{ text: '❌ Bekor qilish' }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}
