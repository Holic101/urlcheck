// Config file format (JSON):
// {
//   "defaults": { "timeoutMs": 5000, "warnMs": 1000, "expectStatus": [200, 399] },
//   "urls": [
//     "https://example.com",
//     { "url": "https://api.example.com/health", "name": "API", "warnMs": 300, "expectStatus": 204 }
//   ]
// }
// A URL entry is either a bare string or an object; object fields override `defaults`.

export type StatusRange = [min: number, max: number];

export interface Target {
  name: string;
  url: string;
  timeoutMs: number;
  warnMs: number;
  expectStatus: StatusRange;
}

export const DEFAULTS = {
  timeoutMs: 5000,
  warnMs: 1000,
  expectStatus: [200, 399] as StatusRange,
};

export class ConfigError extends Error {
  override name = "ConfigError";
}

type Settings = typeof DEFAULTS;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function positiveInt(v: unknown, field: string, where: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    throw new ConfigError(`${where}: "${field}" must be a positive integer, got ${JSON.stringify(v)}`);
  }
  return v;
}

function statusCode(v: unknown, where: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 100 || v > 599) {
    throw new ConfigError(`${where}: status codes must be integers 100-599, got ${JSON.stringify(v)}`);
  }
  return v;
}

// Accepts 200, [200, 299] or "2xx".
export function parseStatus(v: unknown, where: string): StatusRange {
  if (typeof v === "number") {
    const code = statusCode(v, where);
    return [code, code];
  }
  if (typeof v === "string" && /^[1-5]xx$/i.test(v)) {
    const base = Number(v[0]) * 100;
    return [base, base + 99];
  }
  if (Array.isArray(v) && v.length === 2) {
    const [min, max] = [statusCode(v[0], where), statusCode(v[1], where)];
    if (min > max) throw new ConfigError(`${where}: expectStatus range [${min}, ${max}] is reversed`);
    return [min, max];
  }
  throw new ConfigError(`${where}: "expectStatus" must be a code, a [min, max] pair or "2xx"-style string`);
}

function parseUrl(v: unknown, where: string): string {
  if (typeof v !== "string") throw new ConfigError(`${where}: "url" must be a string`);
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new ConfigError(`${where}: "${v}" is not a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigError(`${where}: only http and https URLs are supported, got "${parsed.protocol}"`);
  }
  return parsed.href;
}

function applySettings(base: Settings, raw: Record<string, unknown>, where: string): Settings {
  const settings = {
    timeoutMs: raw.timeoutMs === undefined ? base.timeoutMs : positiveInt(raw.timeoutMs, "timeoutMs", where),
    warnMs: raw.warnMs === undefined ? base.warnMs : positiveInt(raw.warnMs, "warnMs", where),
    expectStatus: raw.expectStatus === undefined ? base.expectStatus : parseStatus(raw.expectStatus, where),
  };
  if (settings.warnMs >= settings.timeoutMs) {
    throw new ConfigError(`${where}: warnMs (${settings.warnMs}) must be below timeoutMs (${settings.timeoutMs})`);
  }
  return settings;
}

export function parseConfig(text: string): Target[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new ConfigError(`config is not valid JSON: ${(err as Error).message}`);
  }
  if (!isObject(raw)) throw new ConfigError("config must be a JSON object with a \"urls\" array");

  if (raw.defaults !== undefined && !isObject(raw.defaults)) {
    throw new ConfigError("\"defaults\" must be an object");
  }
  const defaults = applySettings(DEFAULTS, raw.defaults ?? {}, "defaults");

  if (!Array.isArray(raw.urls) || raw.urls.length === 0) {
    throw new ConfigError("\"urls\" must be a non-empty array");
  }

  const targets = raw.urls.map((entry, i): Target => {
    const where = `urls[${i}]`;
    if (typeof entry === "string") {
      const url = parseUrl(entry, where);
      return { name: url, url, ...defaults };
    }
    if (!isObject(entry)) throw new ConfigError(`${where}: must be a URL string or an object`);
    const url = parseUrl(entry.url, where);
    if (entry.name !== undefined && typeof entry.name !== "string") {
      throw new ConfigError(`${where}: "name" must be a string`);
    }
    return { name: entry.name ?? url, url, ...applySettings(defaults, entry, where) };
  });

  const seen = new Set<string>();
  for (const t of targets) {
    if (seen.has(t.name)) throw new ConfigError(`duplicate entry name "${t.name}"`);
    seen.add(t.name);
  }
  return targets;
}
