import crypto from 'node:crypto';
import { config } from '../config.js';
import { fetchWithTimeout, AppError } from '../utils/http.js';

const API_PATH = '/api/v3/handbook/trains/list';
const XSRF_CACHE_MS = 10 * 60 * 1000;

let xsrfCache = { cookies: null, expiresAt: 0, inFlight: null };

function parseSetCookie(setCookieHeader) {
  const cookie = {};
  if (!setCookieHeader) return cookie;
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join(',') : String(setCookieHeader);
  // Works with the cookies used by eticket.railway.uz. We only need simple key=value pairs.
  for (const part of raw.split(/,(?=\s*[^;=]+=[^;]+)/)) {
    const [pair] = part.trim().split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) cookie[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
  }
  return cookie;
}

function cookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
}

async function getXsrfCookies({ force = false } = {}) {
  if (!force && xsrfCache.cookies && xsrfCache.expiresAt > Date.now()) return xsrfCache.cookies;
  if (!force && xsrfCache.inFlight) return xsrfCache.inFlight;

  xsrfCache.inFlight = fetchXsrfCookies()
    .then((cookies) => {
      xsrfCache = { cookies, expiresAt: Date.now() + XSRF_CACHE_MS, inFlight: null };
      return cookies;
    })
    .catch((error) => {
      xsrfCache.inFlight = null;
      throw error;
    });

  return xsrfCache.inFlight;
}

async function fetchXsrfCookies() {
  const url = `${config.railway.baseUrl}/${config.railway.lang}/home`;
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    timeoutMs: config.railway.timeoutMs,
    headers: {
      'User-Agent': config.railway.userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': `${config.railway.lang},ru;q=0.9,en;q=0.8`
    }
  });
  const setCookie = response.headers.get('set-cookie');
  const cookies = parseSetCookie(setCookie);
  if (!cookies['XSRF-TOKEN']) {
    // Some deployments accept a random token as long as cookie and header match.
    cookies['XSRF-TOKEN'] = crypto.randomUUID();
  }
  return cookies;
}

function detectProtection(status, contentType, raw) {
  const text = String(raw || '').slice(0, 3000).toLowerCase();
  if ([401, 403, 429, 503].includes(status)) return true;
  if (contentType.includes('text/html') && /captcha|recaptcha|cloudflare|turnstile|verify|access denied|forbidden|ddos|robot/.test(text)) return true;
  if (/captcha|recaptcha|cloudflare|turnstile|robot/.test(text)) return true;
  return false;
}

export async function searchTrains({ fromStation, toStation, travelDate }) {
  let lastError = null;
  for (let attempt = 0; attempt <= config.railway.retries; attempt += 1) {
    try {
      return await searchTrainsOnce({ fromStation, toStation, travelDate, forceFreshCookies: attempt > 0 });
    } catch (error) {
      lastError = error;
      if (error.code === 'RAILWAY_PROTECTION') throw error;
      if (attempt < config.railway.retries) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function searchTrainsOnce({ fromStation, toStation, travelDate, forceFreshCookies = false }) {
  const cookies = await getXsrfCookies({ force: forceFreshCookies });
  const url = `${config.railway.baseUrl}${API_PATH}`;
  const body = {
    directions: {
      forward: {
        date: travelDate,
        depStationCode: String(fromStation.code),
        arvStationCode: String(toStation.code)
      }
    }
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    timeoutMs: config.railway.timeoutMs,
    headers: {
      'User-Agent': config.railway.userAgent,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': `${config.railway.lang},ru;q=0.9,en;q=0.8`,
      'Content-Type': 'application/json',
      Origin: config.railway.baseUrl,
      Referer: `${config.railway.baseUrl}/${config.railway.lang}/home`,
      'X-XSRF-TOKEN': cookies['XSRF-TOKEN'],
      Cookie: cookieHeader(cookies),
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();

  if (detectProtection(response.status, contentType, raw)) {
    throw new AppError('Railway site protection or captcha was detected', {
      code: 'RAILWAY_PROTECTION',
      status: response.status,
      details: { status: response.status, contentType, preview: raw.slice(0, 500) }
    });
  }

  if (!response.ok) {
    throw new AppError('Railway API returned error', {
      code: 'RAILWAY_HTTP_ERROR',
      status: response.status,
      details: { status: response.status, preview: raw.slice(0, 500) }
    });
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new AppError('Railway API returned non-JSON response', {
      code: 'RAILWAY_NON_JSON',
      status: 502,
      details: { contentType, preview: raw.slice(0, 500) },
      cause: error
    });
  }

  return normalizeRailwayResponse(json, { fromStation, toStation, travelDate });
}

function normalizeRailwayResponse(json, query) {
  const direction = json?.data?.directions?.forward || json?.directions?.forward || {};
  const trains = Array.isArray(direction.trains) ? direction.trains : [];
  const normalized = trains.map((train) => {
    const cars = Array.isArray(train.cars) ? train.cars : [];
    const normalizedCars = cars.map((car) => {
      const tariffs = Array.isArray(car.tariffs) ? car.tariffs : [];
      const prices = tariffs
        .map((tariff) => Number(tariff.tariff || tariff.cost || tariff.price))
        .filter((price) => Number.isFinite(price) && price > 0);
      const freeSeats = Number(car.freeSeats ?? car.free_seats ?? car.freeSeatCount ?? 0);
      return {
        type: car.type || car.carType || car.name || 'Vagon',
        number: car.number || car.carNumber || '',
        freeSeats,
        minPrice: prices.length ? Math.min(...prices) : null
      };
    });

    const freeSeats = normalizedCars.reduce((sum, car) => sum + (Number(car.freeSeats) || 0), 0);
    const prices = normalizedCars.map((car) => car.minPrice).filter((price) => Number.isFinite(price));
    return {
      number: train.number || train.trainNumber || '-',
      type: train.type || train.trainType || 'Poyezd',
      route: train.route || train.name || '',
      departureDate: train.departureDate || train.departure || train.fromDate || null,
      arrivalDate: train.arrivalDate || train.arrival || train.toDate || null,
      freeSeats,
      minPrice: prices.length ? Math.min(...prices) : null,
      cars: normalizedCars.filter((car) => car.freeSeats > 0 || car.minPrice)
    };
  });

  const totalFreeSeats = normalized.reduce((sum, train) => sum + train.freeSeats, 0);
  return {
    ok: true,
    query,
    totalTrains: normalized.length,
    totalFreeSeats,
    hasSeats: totalFreeSeats > 0,
    trains: normalized,
    rawStatus: json?.status || json?.success || null
  };
}
