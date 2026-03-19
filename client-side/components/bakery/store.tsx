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
  | "Inquiry"
  | "Quoted"
  | "DP Paid"
  | "Confirmed"
  | "In Production"
  | "Ready"
  | "Completed"
  | "Cancelled"
  | "Delivered";

export type PaymentStatus = "Pending" | "DP Paid" | "Paid";

export interface OrderStatusLog {
  id: string;
  status: OrderStatus;
  timestamp: string;
  note: string;
}

export interface OrderItem {
  id: string;
  category: string;
  subcategory: string;
  productName: string;
  size: string;
  quantity: number;
  basePrice: number;
  addOns: string[];
  addOnTotal: number;
  notes?: string;
}

export interface DeliveryAddress {
  id: string;
  label: string;
  area: string;
  addressLine: string;
}

export interface BakeryOrder {
  id: string;
  resi: string;
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryDate: string;
  deliverySlot: string;
  cakeType?: string;
  size?: string;
  addOns?: string;
  notes?: string;
  basePrice?: number;
  addOnTotal?: number;
  deliveryFee?: number;
  manualAdjustment?: number;
  downPaymentAmount?: number;
  remainingBalance?: number;
  items: OrderItem[];
  deliveryAddresses: DeliveryAddress[];
  product: string;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  statusHistory: OrderStatusLog[];
  simulations?: {
    whatsappSent: boolean;
    calendarEventCreated: boolean;
  };
}

export interface NewOrderInput {
  customerName: string;
  customerPhone: string;
  deliveryDate: string;
  deliverySlot: string;
  notes?: string;
  items: OrderItem[];
  deliveryAddresses: DeliveryAddress[];
  basePrice: number;
  addOnTotal: number;
  deliveryFee: number;
  manualAdjustment: number;
  totalPrice: number;
  downPaymentAmount: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
}

interface OrdersContextValue {
  orders: BakeryOrder[];
  addOrder: (order: NewOrderInput) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  updatePaymentStatus: (id: string, status: PaymentStatus) => void;
  updateOrderSchedule: (id: string, deliveryDate: string, deliverySlot: string) => void;
  approveOrder: (id: string) => void;
  getCustomerMessagePreview: (id: string) => string;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

function normalizeOrders(): BakeryOrder[] {
  type LegacyOrder = {
    id: string;
    resi?: string;
    customerName: string;
    deliveryDate: string;
    product: string;
    totalPrice: number;
    paymentStatus: string;
    orderStatus: string;
  } & Partial<BakeryOrder>;

  const normalizeStatus = (value: string): OrderStatus => {
    if (value === "Pending") return "Inquiry";
    if (value === "DP") return "DP Paid";
    if (value === "Paid") return "Completed";
    if (value === "Delivered") return "Delivered";
    const allowed: OrderStatus[] = [
      "Inquiry",
      "Quoted",
      "DP Paid",
      "Confirmed",
      "In Production",
      "Ready",
      "Completed",
      "Cancelled",
      "Delivered",
    ];
    return allowed.includes(value as OrderStatus)
      ? (value as OrderStatus)
      : "Inquiry";
  };

  const normalizePayment = (value: string): PaymentStatus => {
    if (value === "Pending") return "Pending";
    if (value === "DP") return "DP Paid";
    if (value === "Paid") return "Paid";
    return value === "DP Paid" ? "DP Paid" : value === "Paid" ? "Paid" : "Pending";
  };

  return bakeryOrders.map((legacyOrder) => {
    const order = legacyOrder as LegacyOrder;
    return {
    ...order,
    resi: order.resi ?? "",
    bookingCode: order.resi ?? "",
    customerPhone: order.customerPhone ?? "",
    customerAddress: order.customerAddress ?? "",
    deliverySlot: order.deliverySlot ?? "09:00",
    basePrice: order.basePrice ?? order.totalPrice,
    addOnTotal: order.addOnTotal ?? 0,
    deliveryFee: order.deliveryFee ?? 0,
    manualAdjustment: order.manualAdjustment ?? 0,
    downPaymentAmount:
      order.downPaymentAmount ?? Math.round((order.totalPrice ?? 0) * 0.5),
    remainingBalance:
      order.remainingBalance ??
      Math.max(0, (order.totalPrice ?? 0) - Math.round((order.totalPrice ?? 0) * 0.5)),
    items: order.items ?? [
      {
        id: `item-${order.id}`,
        category: "Cake",
        subcategory: "Custom",
        productName: order.product,
        size: order.size ?? "8 inch",
        quantity: 1,
        basePrice: order.basePrice ?? order.totalPrice,
        addOns: order.addOns ? order.addOns.split(", ") : [],
        addOnTotal: order.addOnTotal ?? 0,
      },
    ],
    deliveryAddresses: order.deliveryAddresses ?? [
      {
        id: `addr-${order.id}`,
        label: "Primary",
        area: order.customerAddress ?? "Central City",
        addressLine: order.customerAddress ?? "Not specified",
      },
    ],
    orderStatus: normalizeStatus(order.orderStatus),
    paymentStatus: normalizePayment(order.paymentStatus),
    statusHistory: order.statusHistory ?? [
      {
        id: `log-${order.id}-created`,
        status: normalizeStatus(order.orderStatus),
        timestamp: `${order.deliveryDate}T09:00:00.000Z`,
        note: "Booking created",
      },
    ],
    simulations: order.simulations ?? {
      whatsappSent: false,
      calendarEventCreated: false,
    },
  };
  });
}

const initialOrders = normalizeOrders();
const STORAGE_KEY = "bakeryOrdersState";
const STORAGE_EVENT = "bakeryOrdersUpdated";
const INITIAL_SNAPSHOT = JSON.stringify(initialOrders);
let hasHydrated = false;

function getInitialCounter(orders: BakeryOrder[]) {
  const maxResi = orders.reduce((max, order) => {
    const source = order.resi || order.id;
    const match = /(\d+)/.exec(source);
    if (!match) return max;
    const value = Number(match[1]);
    return Number.isNaN(value) ? max : Math.max(max, value);
  }, 9300);
  return maxResi + 1;
}

function generateBookingCode(
  customerName: string,
  customerPhone: string,
  deliveryDate: string,
  sequence: number
) {
  const initials = customerName
    .replace(/[^a-zA-Z\s]/g, "")
    .trim()
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, "X");
  const phoneDigits = customerPhone.replace(/\D/g, "");
  const lastThree = phoneDigits.slice(-3).padStart(3, "0");
  const datePart = deliveryDate.replace(/-/g, "").slice(0, 8);
  const sequencePart = String(sequence).padStart(3, "0");
  return `${initials}${lastThree}${datePart}${sequencePart}`;
}

function appendStatusLog(
  history: OrderStatusLog[] | undefined,
  status: OrderStatus,
  note: string
) {
  return [
    ...(history ?? []),
    {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      status,
      timestamp: new Date().toISOString(),
      note,
    },
  ];
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
    (order: NewOrderInput) => {
      const sequence = getInitialCounter(orders);
      const id = String(sequence);
      const bookingCode = generateBookingCode(
        order.customerName,
        order.customerPhone,
        order.deliveryDate,
        sequence
      );
      const newOrder: BakeryOrder = {
        id,
        resi: "",
        bookingCode: "",
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerAddress: order.deliveryAddresses[0]?.addressLine ?? "",
        deliveryDate: order.deliveryDate,
        deliverySlot: order.deliverySlot,
        notes: order.notes,
        basePrice: order.basePrice,
        addOnTotal: order.addOnTotal,
        deliveryFee: order.deliveryFee,
        manualAdjustment: order.manualAdjustment,
        downPaymentAmount: order.downPaymentAmount,
        remainingBalance: order.remainingBalance,
        items: order.items,
        deliveryAddresses: order.deliveryAddresses,
        cakeType: order.items[0]?.subcategory,
        size: order.items[0]?.size,
        addOns: order.items
          .flatMap((item) => item.addOns)
          .join(", "),
        product: `${order.items.length} item(s)`,
        totalPrice: order.totalPrice,
        paymentStatus: order.paymentStatus,
        orderStatus: "Inquiry",
        statusHistory: [
          {
            id: `log-${id}-created`,
            status: "Inquiry",
            timestamp: new Date().toISOString(),
            note: "Booking created",
          },
        ],
        simulations: {
          whatsappSent: false,
          calendarEventCreated: false,
        },
      };
      const nextOrders = [newOrder, ...orders];
      persistOrders(nextOrders);
      toast.success(`Draft booking created: ${bookingCode}`);
    },
    [orders, persistOrders]
  );

  const updateOrderStatus = useCallback((id: string, status: OrderStatus) => {
    const nextOrders: BakeryOrder[] = orders.map((order) => {
      if (order.id !== id || order.orderStatus === status) return order;
      return {
        ...order,
        orderStatus: status,
        statusHistory: appendStatusLog(order.statusHistory, status, `Status changed to ${status}`),
      };
    });
    persistOrders(nextOrders);
    toast.message("Order status updated");
  }, [orders, persistOrders]);

  const updatePaymentStatus = useCallback(
    (id: string, status: PaymentStatus) => {
      const nextOrders: BakeryOrder[] = orders.map((order) => {
        if (order.id !== id) return order;
        const downPaymentAmount = order.downPaymentAmount ?? Math.round((order.totalPrice ?? 0) * 0.5);
        const remainingBalance =
          status === "Paid"
            ? 0
            : status === "DP Paid"
            ? Math.max(0, (order.totalPrice ?? 0) - downPaymentAmount)
            : order.totalPrice ?? 0;
        return {
          ...order,
          paymentStatus: status,
          downPaymentAmount,
          remainingBalance,
        };
      });
      persistOrders(nextOrders);
      toast.message("Payment status updated");
    },
    [orders, persistOrders]
  );

  const updateOrderSchedule = useCallback(
    (id: string, deliveryDate: string, deliverySlot: string) => {
      const nextOrders: BakeryOrder[] = orders.map((order) => {
        if (order.id !== id) return order;
        return {
          ...order,
          deliveryDate,
          deliverySlot,
          statusHistory: appendStatusLog(
            order.statusHistory,
            order.orderStatus,
            `Rescheduled to ${deliveryDate} ${deliverySlot}`
          ),
        };
      });
      persistOrders(nextOrders);
      toast.success("Order schedule updated");
    },
    [orders, persistOrders]
  );

  const approveOrder = useCallback((id: string) => {
    const nextOrders: BakeryOrder[] = orders.map((order) => {
      if (order.id !== id) return order;
      const sequence = getInitialCounter(orders);
      const bookingCode =
        order.bookingCode ||
        generateBookingCode(
          order.customerName,
          order.customerPhone,
          order.deliveryDate,
          sequence
        );
      return {
        ...order,
        bookingCode,
        resi: bookingCode,
        orderStatus: "Confirmed",
        statusHistory: appendStatusLog(order.statusHistory, "Confirmed", "Order approved"),
        simulations: {
          whatsappSent: true,
          calendarEventCreated: true,
        },
      };
    });
    persistOrders(nextOrders);
    toast.success("Order approved. WhatsApp sent and calendar event created.");
  }, [orders, persistOrders]);

  const getCustomerMessagePreview = useCallback(
    (id: string) => {
      const order = orders.find((item) => item.id === id);
      if (!order) return "Order not found.";
      const code = order.resi || order.bookingCode || "(pending code)";
      const productList =
        order.items?.length > 0
          ? order.items.map((item) => `${item.quantity}x ${item.productName}`).join(", ")
          : order.product;
      const amount = (order.totalPrice ?? 0).toLocaleString("id-ID");
      return `Hi ${order.customerName}, your order ${code} is confirmed. Items: ${productList}. Total: Rp ${amount}. Delivery: ${order.deliveryDate} ${order.deliverySlot}. Thank you.`;
    },
    [orders]
  );

  const value = useMemo(
    () => ({
      orders,
      addOrder,
      updateOrderStatus,
      updatePaymentStatus,
      updateOrderSchedule,
      approveOrder,
      getCustomerMessagePreview,
    }),
    [
      orders,
      addOrder,
      updateOrderStatus,
      updatePaymentStatus,
      updateOrderSchedule,
      approveOrder,
      getCustomerMessagePreview,
    ]
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
