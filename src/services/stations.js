import { normalizeText } from '../utils/text.js';

export const STATIONS = [
  { code: '2900000', name: 'Toshkent', aliases: ['tas', 'toshkent', 'tashkent', 'ташкент', 'toshkent central', 'tashkent central'] },
  { code: '2900001', name: 'Toshkent Shimoliy', aliases: ['tsn', 'toshkent shimoliy', 'tashkent north', 'tashkent severny', 'ташкент северный'] },
  { code: '2900002', name: 'Toshkent Janubiy', aliases: ['tsj', 'toshkent janubiy', 'tashkent south', 'tashkent yuzhny', 'ташкент южный'] },
  { code: '2900700', name: 'Samarqand', aliases: ['sam', 'samarqand', 'samarkand', 'самарканд'] },
  { code: '2900800', name: 'Buxoro', aliases: ['bux', 'buxoro', 'bukhara', 'бухара'] },
  { code: '2900172', name: 'Xiva', aliases: ['xiv', 'xiva', 'khiva', 'хива'] },
  { code: '2900790', name: 'Urganch', aliases: ['urg', 'urganch', 'ургенч', 'urgench'] },
  { code: '2900970', name: 'Nukus', aliases: ['nuk', 'nukus', 'нукус'] },
  { code: '2900930', name: 'Navoiy', aliases: ['nav', 'navoiy', 'navoi', 'наваи'] },
  { code: '2900680', name: 'Andijon', aliases: ['and', 'andijon', 'andijan', 'андижан'] },
  { code: '2900750', name: 'Qarshi', aliases: ['qar', 'qarshi', 'karshi', 'қарши', 'карши'] },
  { code: '2900720', name: 'Jizzax', aliases: ['jiz', 'jizzax', 'jizzakh', 'джизак'] },
  { code: '2900255', name: 'Termiz', aliases: ['ter', 'termiz', 'termez', 'термез'] },
  { code: '2900850', name: 'Guliston', aliases: ['gul', 'guliston', 'gulistan', 'гулистан'] },
  { code: '2900880', name: "Qo'qon", aliases: ['qoq', 'kok', 'qoqon', 'qokon', 'kokand', 'коканд', 'qo qon'] },
  { code: '2900920', name: "Marg'ilon", aliases: ['mar', 'margilon', 'margilan', 'маргилан'] },
  { code: '2900693', name: 'Pop', aliases: ['pop', 'пап'] },
  { code: '2900940', name: 'Namangan', aliases: ['nam', 'namangan', 'наманган'] }
].map((station) => ({
  ...station,
  norm: normalizeText(station.name),
  aliasNorms: station.aliases.map(normalizeText)
}));

export function resolveStation(input) {
  const value = String(input || '').trim();
  if (!value) return null;
  const asCode = value.match(/^\d{7}$/);
  if (asCode) {
    return STATIONS.find((station) => station.code === value) || { code: value, name: value, aliases: [] };
  }
  const norm = normalizeText(value);
  if (!norm) return null;

  let station = STATIONS.find((item) => item.norm === norm || item.aliasNorms.includes(norm));
  if (station) return station;

  station = STATIONS.find((item) => item.norm.includes(norm) || item.aliasNorms.some((alias) => alias.includes(norm)));
  if (station) return station;

  return null;
}

export function stationsListText() {
  return STATIONS.map((s) => `• ${s.name} — <code>${s.code}</code>`).join('\n');
}
