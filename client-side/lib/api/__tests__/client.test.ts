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
});
