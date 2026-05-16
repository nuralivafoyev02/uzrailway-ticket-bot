import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

let client = null;

export function getSupabase() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

export async function dbUpsertUser(user) {
  const supabase = getSupabase();
  if (!supabase || !user?.id) return;
  await supabase.from('bot_users').upsert({
    telegram_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    language_code: user.language_code || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'telegram_id' });
}

export async function dbGetSession(telegramId) {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function dbSetSession(telegramId, step, payload = {}) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from('user_sessions').upsert({
    telegram_id: telegramId,
    step,
    payload,
    updated_at: new Date().toISOString()
  }, { onConflict: 'telegram_id' });
  if (error) throw error;
}

export async function dbClearSession(telegramId) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from('user_sessions').delete().eq('telegram_id', telegramId);
  if (error) throw error;
}

export async function dbLog(level, scope, message, payload = {}) {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('bot_logs').insert({ level, scope, message, payload });
}

export async function dbCreateWatch({ telegramId, fromStation, toStation, travelDate, passengers = 1 }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from('ticket_watches')
    .insert({
      telegram_id: telegramId,
      from_station_code: fromStation.code,
      from_station_name: fromStation.name,
      to_station_code: toStation.code,
      to_station_name: toStation.name,
      travel_date: travelDate,
      passengers,
      status: 'active'
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function dbListWatches(telegramId) {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('ticket_watches')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function dbStopWatch(id, telegramId) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from('ticket_watches')
    .update({ status: 'stopped', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('telegram_id', telegramId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function dbGetActiveWatches(limit = 20) {
  const supabase = getSupabase();
  if (!supabase) return [];
  const staleBefore = new Date(Date.now() - config.watchIntervalSeconds * 1000).toISOString();
  const { data, error } = await supabase
    .from('ticket_watches')
    .select('*')
    .eq('status', 'active')
    .or('last_checked_at.is.null,last_checked_at.lt.' + staleBefore)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function dbUpdateWatchResult(id, patch) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from('ticket_watches')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
