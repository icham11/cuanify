import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  invalidateApiCache,
  primeApiCache,
} from "../client";

type SessionStorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  length: number;
};

function createSessionStorageMock(): SessionStorageMock {
  const store = new Map<string, string>();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

describe("apiFetch stale cache fallback", () => {
  beforeEach(() => {
    const sessionStorage = createSessionStorageMock();
    vi.stubGlobal("window", { sessionStorage });
    vi.stubGlobal("document", { cookie: "active_business_id=13" });
  });

  afterEach(() => {
    invalidateApiCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns stale GET cache when the server responds 503", async () => {
    primeApiCache(
      "/api/businesses",
      { success: true, data: [{ id: 13, name: "Crumbella" }] },
      undefined,
      -1,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("db unavailable", { status: 503 })),
    );

    const result = await apiFetch("/api/businesses");

    expect(result).toEqual({
      success: true,
      data: [{ id: 13, name: "Crumbella" }],
    });
  });

  it("drops matching in-flight GET entries after invalidation", async () => {
    let resolveFirst: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          if (!resolveFirst) {
            resolveFirst = resolve;
            return;
          }

          resolve(
            new Response(JSON.stringify({ success: true, data: "fresh" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const firstRequest = apiFetch("/api/bookings/orders?page=1&limit=10");
    invalidateApiCache(/\/api\/bookings\/orders/);
    const secondRequest = apiFetch("/api/bookings/orders?page=1&limit=10");

    resolveFirst?.(
      new Response(JSON.stringify({ success: true, data: "stale" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(firstRequest).resolves.toEqual({
      success: true,
      data: "stale",
    });
    await expect(secondRequest).resolves.toEqual({
      success: true,
      data: "fresh",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
