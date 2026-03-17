"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { bakeryOrders } from "@/components/bakery/mockData";

export type OrderStatus =
  | "Pending"
  | "Confirmed"
  | "In Production"
  | "Ready"
  | "Delivered";

export type PaymentStatus = "Pending" | "DP" | "Paid";

export interface BakeryOrder {
  id: string;
  resi: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryDate: string;
  cakeType?: string;
  size?: string;
  addOns?: string;
  notes?: string;
  basePrice?: number;
  addOnTotal?: number;
  deliveryFee?: number;
  product: string;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
}

interface OrdersContextValue {
  orders: BakeryOrder[];
  addOrder: (order: Omit<BakeryOrder, "id" | "resi" | "orderStatus">) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  updatePaymentStatus: (id: string, status: PaymentStatus) => void;
  approveOrder: (id: string) => void;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

function normalizeOrders(): BakeryOrder[] {
  return bakeryOrders.map((order) => ({
    ...order,
    resi: order.resi ?? `ORD-${order.id}`,
    orderStatus: order.orderStatus as OrderStatus,
    paymentStatus: order.paymentStatus as PaymentStatus,
  }));
}

const initialOrders = normalizeOrders();
const STORAGE_KEY = "bakeryOrdersState";
const STORAGE_EVENT = "bakeryOrdersUpdated";
const INITIAL_SNAPSHOT = JSON.stringify(initialOrders);
let hasHydrated = false;

function getInitialCounter(orders: BakeryOrder[]) {
  const maxResi = orders.reduce((max, order) => {
    const match = /ORD-(\d+)/.exec(order.resi);
    if (!match) return max;
    const value = Number(match[1]);
    return Number.isNaN(value) ? max : Math.max(max, value);
  }, 9300);
  return maxResi + 1;
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(STORAGE_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(STORAGE_EVENT, handler as EventListener);
  };
}

function getSnapshot() {
  if (typeof window === "undefined") return INITIAL_SNAPSHOT;
  if (!hasHydrated) return INITIAL_SNAPSHOT;
  return window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
}

function getServerSnapshot() {
  return INITIAL_SNAPSHOT;
}

function parseSnapshot(snapshot: string): BakeryOrder[] {
  try {
    const parsed = JSON.parse(snapshot) as BakeryOrder[];
    return Array.isArray(parsed) ? parsed : initialOrders;
  } catch {
    return initialOrders;
  }
}

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const orders = useMemo<BakeryOrder[]>(() => parseSnapshot(snapshot), [snapshot]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasHydrated) {
      hasHydrated = true;
      window.dispatchEvent(new Event(STORAGE_EVENT));
    }
  }, []);

  const persistOrders = useCallback((nextOrders: BakeryOrder[]) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextOrders));
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, []);

  const addOrder = useCallback(
    (order: Omit<BakeryOrder, "id" | "resi" | "orderStatus">) => {
      const sequence = getInitialCounter(orders);
      const id = String(sequence);
      const resi = `ORD-${sequence}`;
      const newOrder: BakeryOrder = {
        ...order,
        id,
        resi,
        orderStatus: "Pending",
      };
      const nextOrders = [newOrder, ...orders];
      persistOrders(nextOrders);
      toast.success(`Booking created. Resi: ${resi}`);
    },
    [orders, persistOrders]
  );

  const updateOrderStatus = useCallback((id: string, status: OrderStatus) => {
    const nextOrders: BakeryOrder[] = orders.map((order) =>
      order.id === id ? { ...order, orderStatus: status } : order
    );
    persistOrders(nextOrders);
    toast.message("Order status updated");
  }, [orders, persistOrders]);

  const updatePaymentStatus = useCallback(
    (id: string, status: PaymentStatus) => {
      const nextOrders: BakeryOrder[] = orders.map((order) =>
        order.id === id ? { ...order, paymentStatus: status } : order
      );
      persistOrders(nextOrders);
      toast.message("Payment status updated");
    },
    [orders, persistOrders]
  );

  const approveOrder = useCallback((id: string) => {
    const nextOrders: BakeryOrder[] = orders.map((order) =>
      order.id === id
        ? {
            ...order,
            resi: order.resi || `ORD-${getInitialCounter(orders)}`,
            orderStatus: "Confirmed",
          }
        : order
    );
    persistOrders(nextOrders);
    toast.success("Order approved and sent to production");
  }, [orders, persistOrders]);

  const value = useMemo(
    () => ({ orders, addOrder, updateOrderStatus, updatePaymentStatus, approveOrder }),
    [orders, addOrder, updateOrderStatus, updatePaymentStatus, approveOrder]
  );

  return (
    <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error("useOrders must be used within OrdersProvider");
  }
  return context;
}
