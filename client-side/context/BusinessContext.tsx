"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  getAllBusinesses,
  switchBusiness as switchBusinessApi,
  type Business,
} from "@/lib/api/business";

type BusinessContextType = {
  /** The currently active business */
  business: Business | null;
  /** All businesses owned by the user */
  businesses: Business[];
  loading: boolean;
  /** Re-fetch from server */
  refreshBusiness: () => Promise<void>;
  /** Switch active business by ID — triggers re-fetch */
  switchBusiness: (id: string | number) => Promise<void>;
};

const BusinessContext = createContext<BusinessContextType | undefined>(
  undefined,
);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBusiness = useCallback(async () => {
    try {
      const all = await getAllBusinesses();
      setBusinesses(all);

      const activeIdMatch = document.cookie.match(
        /(?:^|;\s*)active_business_id=([^;]*)/,
      );
      const activeId = activeIdMatch
        ? decodeURIComponent(activeIdMatch[1] || "")
        : "";
      const current =
        all.find((b) => String(b.id) === activeId) ?? all[0] ?? null;

      if (current && !activeId) {
        switchBusinessApi(current.id);
      }

      setBusiness(current);
    } catch (error) {
      console.error("Failed to fetch business:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSwitch = useCallback(async (id: string | number) => {
    switchBusinessApi(id);
    // Re-fetch so the context reflects the new active business
    setLoading(true);
    try {
      const all = await getAllBusinesses();
      setBusinesses(all);
      const found = all.find((b) => String(b.id) === String(id));
      setBusiness(found ?? all[0] ?? null);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusiness();
  }, [fetchBusiness]);

  return (
    <BusinessContext.Provider
      value={{
        business,
        businesses,
        loading,
        refreshBusiness: fetchBusiness,
        switchBusiness: handleSwitch,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error("useBusiness must be used inside BusinessProvider");
  }
  return context;
}
