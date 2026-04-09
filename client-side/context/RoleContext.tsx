"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type UserRole = "Owner" | "Cashier" | "Staff";

interface RoleContextType {
  role: UserRole;
  userName: string;
  loading: boolean;
  isOwner: boolean;
  isCashier: boolean;
  isStaff: boolean;
  refresh: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>("Owner");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setRole(data.data?.role || "Owner");
        setUserName(data.data?.name || "");
      }
    } catch {
      // Default to Owner if fetch fails (backward compat)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  return (
    <RoleContext.Provider
      value={{
        role,
        userName,
        loading,
        isOwner: role === "Owner",
        isCashier: role === "Cashier",
        isStaff: role === "Staff",
        refresh: fetchRole,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used inside RoleProvider");
  }
  return context;
}

