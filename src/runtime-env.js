let runtimeEnv = {};

export function setRuntimeEnv(env = {}) {
  runtimeEnv = env || {};
}

export function getEnv(name) {
  if (Object.prototype.hasOwnProperty.call(runtimeEnv, name)) return runtimeEnv[name];
  if (typeof process !== 'undefined' && process.env) return process.env[name];
  return undefined;
}

export function getStringEnv(name, fallback = '') {
  const value = getEnv(name);
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

export function getNumberEnv(name, fallback) {
  const value = Number(getStringEnv(name, ''));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
