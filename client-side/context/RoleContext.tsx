"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { fetchAuthMe } from "@/lib/auth/auth-me-client";

export type UserRole = "Owner" | "Admin" | "Cashier" | "Staff";

interface RoleContextType {
  role: UserRole;
  userName: string;
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
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
      const data = await fetchAuthMe();
      if (data) {
        setRole(data.role || "Owner");
        setUserName(data.name || "");
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
        isAdmin: role === "Admin",
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

