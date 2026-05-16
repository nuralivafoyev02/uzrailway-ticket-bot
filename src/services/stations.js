import { normalizeText } from '../utils/text.js';

export const STATIONS = [
  { code: '2900000', name: 'Toshkent', aliases: ['toshkent', 'tashkent', 'ташкент', 'toshkent central', 'tashkent central'] },
  { code: '2900001', name: 'Toshkent Shimoliy', aliases: ['toshkent shimoliy', 'tashkent north', 'tashkent severny', 'ташкент северный'] },
  { code: '2900002', name: 'Toshkent Janubiy', aliases: ['toshkent janubiy', 'tashkent south', 'tashkent yuzhny', 'ташкент южный'] },
  { code: '2900700', name: 'Samarqand', aliases: ['samarqand', 'samarkand', 'самарканд'] },
  { code: '2900800', name: 'Buxoro', aliases: ['buxoro', 'bukhara', 'бухара'] },
  { code: '2900172', name: 'Xiva', aliases: ['xiva', 'khiva', 'хива'] },
  { code: '2900790', name: 'Urganch', aliases: ['urganch', 'ургенч', 'urgench'] },
  { code: '2900970', name: 'Nukus', aliases: ['nukus', 'нукус'] },
  { code: '2900930', name: 'Navoiy', aliases: ['navoiy', 'navoi', 'наваи'] },
  { code: '2900680', name: 'Andijon', aliases: ['andijon', 'andijan', 'андижан'] },
  { code: '2900750', name: 'Qarshi', aliases: ['qarshi', 'karshi', 'қарши', 'карши'] },
  { code: '2900720', name: 'Jizzax', aliases: ['jizzax', 'jizzakh', 'джизак'] },
  { code: '2900255', name: 'Termiz', aliases: ['termiz', 'termez', 'термез'] },
  { code: '2900850', name: 'Guliston', aliases: ['guliston', 'gulistan', 'гулистан'] },
  { code: '2900880', name: "Qo'qon", aliases: ['qoqon', 'qokon', 'kokand', 'коканд', 'qo qon'] },
  { code: '2900920', name: "Marg'ilon", aliases: ['margilon', 'margilan', 'маргилан'] },
  { code: '2900693', name: 'Pop', aliases: ['pop', 'пап'] },
  { code: '2900940', name: 'Namangan', aliases: ['namangan', 'наманган'] }
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
