"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_CATALOG_ADMIN_STATE,
  buildEffectiveAddOnCatalog,
  buildEffectiveProductCatalog,
  makeAddOnKey,
  makeProductKey,
  makeVariantKey,
  normalizeCatalogAdminState,
  type CatalogAdminState,
  type CustomAddOnEntry,
  type CustomProductEntry,
} from "@/lib/bookings/catalog-state";

export {
  makeAddOnKey,
  makeProductKey,
  makeVariantKey,
  type CatalogAdminState,
  type CustomAddOnEntry,
  type CustomProductEntry,
};

export type CatalogSyncStatus = "idle" | "syncing" | "synced" | "error";

const STORAGE_KEY = "bakeryCatalogAdminState";
const STORAGE_EVENT = "bakeryCatalogAdminUpdated";
const CATALOG_CONFIG_API = "/api/bookings/catalog-config";
const SERVER_REVALIDATE_INTERVAL_MS = 10000;
const SERVER_REVALIDATE_STALE_GUARD_MS = 3000;

const EMPTY_STATE = EMPTY_CATALOG_ADMIN_STATE;

function readStateFromStorage(): CatalogAdminState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    return normalizeCatalogAdminState(JSON.parse(raw));
  } catch {
    return EMPTY_STATE;
  }
}

function writeStateToStorage(next: CatalogAdminState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function isCatalogStateEqual(
  left: CatalogAdminState,
  right: CatalogAdminState,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function loadStateFromServer(): Promise<CatalogAdminState | null> {
  try {
    const response = await fetch(CATALOG_CONFIG_API, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      success?: boolean;
      data?: CatalogAdminState | null;
    };

    if (!payload.success || !payload.data) return null;
    return payload.data;
  } catch {
    return null;
  }
}

async function saveStateToServer(next: CatalogAdminState) {
  const response = await fetch(CATALOG_CONFIG_API, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(next),
  });

  if (!response.ok) {
    throw new Error("Failed to save catalog config to server.");
  }
}

export function useCatalogAdminState() {
  const [state, setState] = useState<CatalogAdminState>(() =>
    readStateFromStorage(),
  );
  const [syncStatus, setSyncStatus] = useState<CatalogSyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const saveInFlightRef = useRef(false);
  const lastLocalWriteAtRef = useRef(0);

  const hydrateFromServer = useCallback(
    async (options?: { silent?: boolean; force?: boolean }) => {
      const force = options?.force ?? false;
      const silent = options?.silent ?? false;

      if (!silent) {
        setSyncStatus("syncing");
      }

      if (saveInFlightRef.current && !force) {
        if (!silent) {
          setSyncStatus("synced");
        }
        return;
      }

      if (
        !force &&
        Date.now() - lastLocalWriteAtRef.current <
          SERVER_REVALIDATE_STALE_GUARD_MS
      ) {
        if (!silent) {
          setSyncStatus("synced");
        }
        return;
      }

      const fromServer = await loadStateFromServer();
      if (!fromServer) {
        if (!silent) {
          setSyncStatus("error");
        }
        return;
      }

      let hasChanged = false;
      setState((prev) => {
        if (isCatalogStateEqual(prev, fromServer)) {
          return prev;
        }

        hasChanged = true;
        return fromServer;
      });

      if (hasChanged) {
        writeStateToStorage(fromServer);
      }

      setSyncStatus("synced");
      setLastSyncedAt(new Date().toISOString());
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      await hydrateFromServer({ force: true });
      if (!isMounted) return;
    })();

    const onStorage = () => setState(readStateFromStorage());
    const onFocus = () => {
      void hydrateFromServer({ silent: true });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void hydrateFromServer({ silent: true });
      }
    };

    const intervalId = window.setInterval(() => {
      void hydrateFromServer({ silent: true });
    }, SERVER_REVALIDATE_INTERVAL_MS);

    window.addEventListener("storage", onStorage);
    window.addEventListener(STORAGE_EVENT, onStorage as EventListener);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(STORAGE_EVENT, onStorage as EventListener);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hydrateFromServer]);

  const productCatalog = useMemo(
    () => buildEffectiveProductCatalog(state),
    [state],
  );

  const addOnCatalog = useMemo(
    () => buildEffectiveAddOnCatalog(state),
    [state],
  );

  const setCatalogAdminState = (
    updater: (prev: CatalogAdminState) => CatalogAdminState,
  ) => {
    setState((prev) => {
      const next = updater(prev);
      writeStateToStorage(next);
      lastLocalWriteAtRef.current = Date.now();
      setSyncStatus("syncing");
      saveInFlightRef.current = true;
      void (async () => {
        try {
          await saveStateToServer(next);
          setSyncStatus("synced");
          setLastSyncedAt(new Date().toISOString());
        } catch {
          setSyncStatus("error");
        } finally {
          saveInFlightRef.current = false;
        }
      })();
      return next;
    });
  };

  const resetCatalogAdminState = () => {
    setState(EMPTY_STATE);
    writeStateToStorage(EMPTY_STATE);
    lastLocalWriteAtRef.current = Date.now();
    setSyncStatus("syncing");
    saveInFlightRef.current = true;
    void (async () => {
      try {
        await saveStateToServer(EMPTY_STATE);
        setSyncStatus("synced");
        setLastSyncedAt(new Date().toISOString());
      } catch {
        setSyncStatus("error");
      } finally {
        saveInFlightRef.current = false;
      }
    })();
  };

  const retrySync = () => {
    lastLocalWriteAtRef.current = Date.now();
    setSyncStatus("syncing");
    saveInFlightRef.current = true;
    void (async () => {
      try {
        await saveStateToServer(state);
        setSyncStatus("synced");
        setLastSyncedAt(new Date().toISOString());
      } catch {
        setSyncStatus("error");
      } finally {
        saveInFlightRef.current = false;
      }
    })();
  };

  return {
    state,
    productCatalog,
    addOnCatalog,
    syncStatus,
    lastSyncedAt,
    setCatalogAdminState,
    resetCatalogAdminState,
    retrySync,
  };
}
