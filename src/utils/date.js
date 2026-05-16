const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

export function todayInTashkent() {
  const now = new Date(Date.now() + TASHKENT_OFFSET_MS);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function formatDateISO(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateUz(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function parseTravelDate(input) {
  const value = String(input || '').trim().toLowerCase();
  const today = todayInTashkent();
  if (['bugun', 'сегодня', 'today'].includes(value)) return formatDateISO(today);
  if (['ertaga', 'завтра', 'tomorrow'].includes(value)) {
    const date = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    return formatDateISO(date);
  }

  const iso = value.match(/^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return isValidDate(date) ? formatDateISO(date) : null;
  }

  const dot = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](20\d{2})$/);
  if (dot) {
    const date = new Date(Date.UTC(Number(dot[3]), Number(dot[2]) - 1, Number(dot[1])));
    return isValidDate(date) ? formatDateISO(date) : null;
  }

  const noYear = value.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (noYear) {
    const t = todayInTashkent();
    let date = new Date(Date.UTC(t.getUTCFullYear(), Number(noYear[2]) - 1, Number(noYear[1])));
    if (date < t) date = new Date(Date.UTC(t.getUTCFullYear() + 1, Number(noYear[2]) - 1, Number(noYear[1])));
    return isValidDate(date) ? formatDateISO(date) : null;
  }

  return null;
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}
