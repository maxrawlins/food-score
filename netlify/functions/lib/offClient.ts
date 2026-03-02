export type UpstreamSource = "live" | "stale-cache";

export type OffErrorCode = "OFF_RATE_LIMITED" | "OFF_TIMEOUT" | "OFF_UNAVAILABLE" | "OFF_INVALID_RESPONSE";

export class OffError extends Error {
  code: OffErrorCode;
  status?: number;

  constructor(code: OffErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type CacheEntry = {
  data: unknown;
  expiresAt: number;
  staleUntil: number;
};

const USER_AGENT = "FoodScore/1.0 (local dev)";
const cache = new Map<string, CacheEntry>();

const DEFAULT_TIMEOUT_MS = 7000;
const BACKOFF_SCHEDULE_MS = [300, 900, 2100];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number) {
  return ms + Math.floor(Math.random() * 120);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber * 1000);

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return null;
  const diff = dateMs - Date.now();
  return diff > 0 ? diff : null;
}

function classifyFailure(status: number | undefined, cause: unknown): OffError {
  if (status === 429) return new OffError("OFF_RATE_LIMITED", "Open Food Facts rate limited request", status);
  if (typeof status === "number" && status >= 500) {
    return new OffError("OFF_UNAVAILABLE", "Open Food Facts returned server error", status);
  }
  if ((cause instanceof DOMException && cause.name === "AbortError") || (cause instanceof Error && cause.name === "AbortError")) {
    return new OffError("OFF_TIMEOUT", "Open Food Facts request timed out", status);
  }
  if (cause instanceof OffError) return cause;
  return new OffError("OFF_UNAVAILABLE", "Open Food Facts request failed", status);
}

function freshCache<T>(key: string): T | null {
  const found = cache.get(key);
  if (!found) return null;
  if (Date.now() <= found.expiresAt) return found.data as T;
  return null;
}

function staleCache<T>(key: string): T | null {
  const found = cache.get(key);
  if (!found) return null;
  if (Date.now() <= found.staleUntil) return found.data as T;
  return null;
}

function setCache(key: string, data: unknown, ttlMs: number, staleMs: number) {
  const now = Date.now();
  cache.set(key, {
    data,
    expiresAt: now + ttlMs,
    staleUntil: now + ttlMs + staleMs,
  });
}

export async function fetchJsonWithRetry<T>(input: {
  cacheKey: string;
  url: string;
  ttlMs: number;
  staleMs: number;
  timeoutMs?: number;
  retryDelaysMs?: number[];
  maxAttempts?: number;
  fetcher?: typeof fetch;
}): Promise<{ data: T; source: UpstreamSource }> {
  const hit = freshCache<T>(input.cacheKey);
  if (hit !== null) return { data: hit, source: "live" };

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelaysMs = input.retryDelaysMs ?? BACKOFF_SCHEDULE_MS;
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? retryDelaysMs.length + 1, retryDelaysMs.length + 1));
  const fetcher = input.fetcher ?? fetch;
  let lastError: OffError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetcher(input.url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });

      if (!res.ok) {
        const status = res.status;
        const err = classifyFailure(status, undefined);

        if (status === 429 || status >= 500) {
          lastError = err;
          if (attempt < maxAttempts - 1) {
            const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
            const wait = retryAfter ?? jitter(retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)]);
            await sleep(wait);
            continue;
          }
        }

        throw err;
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new OffError("OFF_INVALID_RESPONSE", "Open Food Facts response was not valid JSON", res.status);
      }

      setCache(input.cacheKey, data, input.ttlMs, input.staleMs);
      return { data: data as T, source: "live" };
    } catch (err: unknown) {
      const normalized = classifyFailure(undefined, err);
      lastError = normalized;
      if (attempt < maxAttempts - 1) {
        await sleep(jitter(retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)]));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const stale = staleCache<T>(input.cacheKey);
  if (stale !== null) return { data: stale, source: "stale-cache" };

  throw lastError ?? new OffError("OFF_UNAVAILABLE", "Open Food Facts request failed");
}

export function offErrorToMessage(err: unknown): string {
  if (err instanceof OffError) {
    if (err.code === "OFF_RATE_LIMITED") return "Open Food Facts is rate-limiting requests. Retrying shortly.";
    if (err.code === "OFF_TIMEOUT") return "Open Food Facts timed out. Please try again.";
    if (err.code === "OFF_INVALID_RESPONSE") return "Open Food Facts returned invalid data.";
    return "Failed to reach Open Food Facts.";
  }
  return "Failed to reach Open Food Facts.";
}
