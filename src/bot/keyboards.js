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

export function resultKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔔 Shu yo‘nalishni kuzatish', callback_data: 'watch_last' }],
      [{ text: '🎫 Yangi qidiruv', callback_data: 'new_search' }]
    ]
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
