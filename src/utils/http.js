export class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.code = options.code || 'APP_ERROR';
    this.status = options.status || 500;
    this.details = options.details || null;
    this.cause = options.cause;
  }
}

export function jsonResponse(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new AppError('Invalid JSON body', { code: 'INVALID_JSON', status: 400, cause: error });
  }
}

export async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = options.timeoutMs || 25000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function getQueryParam(req, key) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `https://${host}`);
  return url.searchParams.get(key);
}
