import { describe, expect, it, vi } from "vitest";
import { fetchJsonWithRetry } from "../offClient";

describe("fetchJsonWithRetry", () => {
  it("retries on 429 and succeeds", async () => {
    let attempts = 0;

    const fetcher: typeof fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("{}", { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const res = await fetchJsonWithRetry<{ ok: boolean }>({
      cacheKey: `test-retry-${Date.now()}`,
      url: "https://example.com",
      ttlMs: 10,
      staleMs: 50,
      retryDelaysMs: [0],
      fetcher,
    });

    expect(attempts).toBe(2);
    expect(res.data.ok).toBe(true);
    expect(res.source).toBe("live");
  });

  it("returns stale cache when fetch fails", async () => {
    const key = `test-stale-${Date.now()}`;

    const successFetcher: typeof fetch = async () =>
      new Response(JSON.stringify({ value: 42 }), { status: 200, headers: { "content-type": "application/json" } });

    await fetchJsonWithRetry<{ value: number }>({
      cacheKey: key,
      url: "https://example.com/stale",
      ttlMs: 1,
      staleMs: 1000,
      retryDelaysMs: [0],
      fetcher: successFetcher,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const failFetcher: typeof fetch = vi.fn(async () => {
      throw new Error("network");
    });

    const res = await fetchJsonWithRetry<{ value: number }>({
      cacheKey: key,
      url: "https://example.com/stale",
      ttlMs: 1,
      staleMs: 1000,
      retryDelaysMs: [0],
      fetcher: failFetcher,
    });

    expect(res.source).toBe("stale-cache");
    expect(res.data.value).toBe(42);
  });
});
