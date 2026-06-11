"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { generateExcel } from "@/lib/export/excel";
import { useBusiness } from "@/context/BusinessContext";
import { useRole } from "@/context/RoleContext";
import {
  OrdersProvider,
  useOrders,
} from "@/components/bakery/store";
import MonthYearPicker, {
  buildSelectableMonthKeys,
} from "@/components/bakery/shared/MonthYearPicker";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import {
  BAKERY_SETTINGS_UPDATED_EVENT,
  invalidateBakerySettingsCache,
} from "@/hooks/useBakerySettings";
import { apiFetch } from "@/lib/api/client";
import {
  calculateBakeryFinancialSummary,
  calculateOperationalCostForDateRange,
  type BakeryFinancialOrder,
} from "@/lib/bakery/financial-summary";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import type { BakeryBusinessSettings } from "@/lib/bakery/settings";
import type { Product } from "@/types/product";
import { Building2, Download, Loader2, Trophy } from "lucide-react";

type BakerySettingsResponse = {
  data?: BakeryBusinessSettings;
};

type ProductsResponse = {
  data?: Product[];
};

type OrdersResponse = {
  data?: {
    orders?: BakeryFinancialOrder[];
    source?: string;
  };
};

type TopProductView = {
  productName: string;
  quantitySold: number;
  revenue: number;
};

type ViewState = {
  viewerName: string;
  businessName: string;
  businessLocation: string;
  currentRevenue: number;
  currentProfit: number;
  previousRevenue: number;
  cogsCost: number;
  operationalCost: number;
  cancelledRevenue: number;
  cancelledCogsCost: number;
  returnRefundAmount: number;
  cancelledOrdersCount: number;
  totalCost: number;
  avgMargin: number;
  totalSalesCount: number;
  paidSalesCount: number;
  topProducts: TopProductView[];
  bakerySettings: BakeryBusinessSettings | null;
  cogsBreakdown: Array<{
    productName: string;
    quantity: number;
    cogsPerItem: number;
    totalCogs: number;
  }>;
  dailyTransactions: Array<{
    date: string;
    transactions: Array<{
      revenue: number;
      cogs: number;
      description: string;
    }>;
  }>;
};

const EMPTY_VIEW_STATE: ViewState = {
  viewerName: "",
  businessName: "",
  businessLocation: "",
  currentRevenue: 0,
  currentProfit: 0,
  previousRevenue: 0,
  cogsCost: 0,
  operationalCost: 0,
  cancelledRevenue: 0,
  cancelledCogsCost: 0,
  returnRefundAmount: 0,
  cancelledOrdersCount: 0,
  totalCost: 0,
  avgMargin: 0,
  totalSalesCount: 0,
  paidSalesCount: 0,
  topProducts: [],
  bakerySettings: null,
  cogsBreakdown: [],
  dailyTransactions: [],
};

type BusinessReferenceData = {
  bakerySettings: BakeryBusinessSettings | null;
  products: Product[];
  serverFinancialOrders: BakeryFinancialOrder[] | null;
};

const EMPTY_REFERENCE_DATA: BusinessReferenceData = {
  bakerySettings: null,
  products: [],
  serverFinancialOrders: null,
};

const BUSINESS_REFERENCE_DATA_CACHE = new Map<
  string,
  { value: BusinessReferenceData; cachedAt: number }
>();
const BUSINESS_DATA_CACHE_TTL_MS = 30 * 1000;
const BUSINESS_REFERENCE_CACHE_TTL_MS = 5 * 60 * 1000;
const BUSINESS_ORDERS_CACHE_TTL_MS = 30 * 1000;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Math.round(Number(value || 0)));
}

function formatFullRupiah(value: number) {
  const amount = Math.round(Number(value || 0));
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatSignedCurrency(value: number) {
  const amount = Math.round(Math.abs(Number(value || 0)));
  return `${value >= 0 ? "+" : "-"}${formatCurrency(amount)}`;
}

function getMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthKeyFromDateValue(value: string | null | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? String(value).slice(0, 7) : "";
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function getMonthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const end = new Date(year, month, 0);
  return {
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: `${year}-${String(month).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
    prevMonthKey: getMonthKey(new Date(year, month - 2, 1)),
  };
}

function getBusinessFetchRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 18, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 6, 0);
  return {
    startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`,
    endDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
  };
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getRankEmoji(index: number) {
  if (index === 0) return "#1";
  if (index === 1) return "#2";
  if (index === 2) return "#3";
  return `#${index + 1}`;
}

function filterOrdersByDeliveryDateRange<
  T extends { deliveryDate?: string | null },
>(orders: T[], fromDate: string, toDate: string): T[] {
  return orders.filter((order) => {
    const deliveryDate = String(order.deliveryDate || "").trim();
    if (!deliveryDate) return false;
    if (fromDate && deliveryDate < fromDate) return false;
    if (toDate && deliveryDate > toDate) return false;
    return true;
  });
}

function getOrderTimestamp(value: string | Date | null | undefined) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeFinancialOrdersWithLocal(
  localOrders: BakeryFinancialOrder[],
  serverOrders: BakeryFinancialOrder[] | null,
): BakeryFinancialOrder[] {
  if (!serverOrders || serverOrders.length === 0) {
    return localOrders;
  }

  const merged = new Map<string, BakeryFinancialOrder>();
  const localById = new Map(
    localOrders.map((order) => [String(order.id || "").trim(), order]),
  );

  serverOrders.forEach((serverOrder) => {
    const key = String(serverOrder.id || "").trim();
    if (!key) return;

    const localOrder = localById.get(key);
    if (!localOrder) {
      merged.set(key, serverOrder);
      return;
    }

    const localTimestamp = Math.max(
      getOrderTimestamp(localOrder.updatedAt),
      getOrderTimestamp(localOrder.createdAt),
    );
    const serverTimestamp = Math.max(
      getOrderTimestamp(serverOrder.updatedAt),
      getOrderTimestamp(serverOrder.createdAt),
    );

    merged.set(key, localTimestamp >= serverTimestamp ? localOrder : serverOrder);
    localById.delete(key);
  });

  localById.forEach((order, key) => {
    merged.set(key, order);
  });

  return Array.from(merged.values());
}

function buildExportCsv(args: {
  monthLabel: string;
  businessName: string;
  revenue: number;
  cogsCost: number;
  operationalCost: number;
  totalCost: number;
  profit: number;
  activeOrders: number;
  margin: number;
  topProducts: Array<{
    productName: string;
    quantitySold: number;
    revenue: number;
  }>;
  dailyTransactions: Array<{
    date: string;
    transactions: Array<{
      revenue: number;
      cogs: number;
      description: string;
    }>;
  }>;
}) {
  const formatIdr = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatPercent = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val / 100);
  };

  const formatNum = (val: number) => {
    return new Intl.NumberFormat("id-ID").format(val);
  };

  const rows = [
    ["Executive Summary", ""],
    ["Business", args.businessName],
    ["Periode", args.monthLabel],
    ["Order Aktif", formatNum(args.activeOrders)],
    ["Total Revenue", formatIdr(args.revenue)],
    ["Total COGS/HPP", formatIdr(args.cogsCost)],
    ["Total Biaya Operasional", formatIdr(args.operationalCost)],
    ["Total Biaya", formatIdr(args.totalCost)],
    ["Profit Bersih", formatIdr(args.profit)],
    ["Margin Kotor", formatPercent(args.margin)],
    [],
    ["Top Produk", "Kuantitas", "Total Revenue"],
    ...args.topProducts.map((item) => [
      item.productName,
      formatNum(item.quantitySold),
      formatIdr(item.revenue),
    ]),
    [],
  ];

  if (args.dailyTransactions && args.dailyTransactions.length > 0) {
    rows.push(["Ringkasan Transaksi Per Hari", "", "", "", ""]);
    rows.push([
      "Tanggal",
      "Jumlah Transaksi",
      "Total Revenue",
      "Total COGS/HPP",
      "Margin Kotor",
    ]);

    args.dailyTransactions.forEach((day) => {
      const dayLabel = new Date(day.date).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const dayRev = day.transactions.reduce((acc, t) => acc + t.revenue, 0);
      const dayCogs = day.transactions.reduce((acc, t) => acc + t.cogs, 0);
      const dayMargin = dayRev > 0 ? ((dayRev - dayCogs) / dayRev) * 100 : 0;

      rows.push([
        dayLabel,
        formatNum(day.transactions.length),
        formatIdr(dayRev),
        formatIdr(dayCogs),
        formatPercent(dayMargin),
      ]);
    });

    rows.push([]);

    rows.push(["Detail per Transaksi", "", "", "", ""]);
    rows.push([
      "Tanggal",
      "Keterangan (Customer - Produk)",
      "Revenue",
      "COGS/HPP",
      "Margin Kotor",
    ]);
    args.dailyTransactions.forEach((day) => {
      const dayLabel = new Date(day.date).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      day.transactions.forEach((t) => {
        const marginPct =
          t.revenue > 0 ? ((t.revenue - t.cogs) / t.revenue) * 100 : 0;
        rows.push([
          dayLabel,
          t.description,
          formatIdr(t.revenue),
          formatIdr(t.cogs),
          formatPercent(marginPct),
        ]);
      });
    });
  }

  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

function didRequestFail(payload: unknown): boolean {
  return payload === null;
}

async function safeApiFetch<T>(
  path: string,
  options?: {
    timeoutMs?: number;
    cacheTtlMs?: number;
  },
): Promise<T | null> {
  const timeoutMs = options?.timeoutMs ?? 15000;
  try {
    return (await apiFetch(
      path,
      { cacheTtlMs: options?.cacheTtlMs },
      timeoutMs,
    )) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`Fetch timeout for ${path} after ${timeoutMs}ms`);
    } else {
      console.error(`Failed to fetch ${path}`, error);
    }
    return null;
  }
}

function BreakdownRow({
  label,
  note,
  amount,
  tone = "negative",
  children,
}: {
  label: string;
  note?: string;
  amount: number;
  tone?: "positive" | "negative" | "profit";
  children?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  const amountClassName =
    tone === "positive"
      ? "text-[#17653d]"
      : tone === "profit"
        ? amount >= 0
          ? "text-[#17653d] font-extrabold"
          : "text-[#c85d34] font-extrabold"
        : "text-[#c85d34]";

  return (
    <div
      className={`px-4 py-3 ${
        tone === "profit"
          ? amount >= 0
            ? "bg-[#e4f4ee]"
            : "bg-[#fff1ec]"
          : "border-b border-[#ead8cb]"
      }`}
    >
      <div 
        className={`flex items-start justify-between gap-4 ${children ? "cursor-pointer select-none group" : ""}`}
        onClick={() => {
          if (children) setIsOpen(!isOpen);
        }}
      >
        <div className="min-w-0">
          <p
            className={`text-[15px] leading-tight ${
              tone === "profit"
                ? amount >= 0
                  ? "font-bold text-[#17653d]"
                  : "font-bold text-[#c85d34]"
                : "text-[#23150f]"
            } ${children ? "group-hover:text-[#c86030] transition-colors" : ""}`}
          >
            {label}
            {children && (
              <span className="ml-2 inline-block text-[11px] text-[#b58872] group-hover:text-[#c86030]">
                {isOpen ? "▲" : "▼"}
              </span>
            )}
          </p>
          {note ? (
            <p className="mt-1 text-[11px] leading-tight text-[#b58872]">
              {note}
            </p>
          ) : null}
        </div>
        <p
          className={`shrink-0 font-mono text-[14px] leading-tight ${amountClassName}`}
        >
          {formatSignedCurrency(
            tone === "positive" || tone === "profit"
              ? amount
              : -Math.abs(amount),
          )}
        </p>
      </div>
      {children && isOpen ? <div className="mt-3 pt-3 border-t border-[#ead8cb]/50">{children}</div> : null}
    </div>
  );
}

function BusinessPageContent() {
  const { business, loading: businessLoading } = useBusiness();
  const { userName } = useRole();
  const { orders } = useOrders();
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(new Date()));
  const [referenceData, setReferenceData] =
    useState<BusinessReferenceData>(EMPTY_REFERENCE_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExportPickerOpen, setIsExportPickerOpen] = useState(false);
  const exportDialogTitleRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!isExportPickerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsExportPickerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExportPickerOpen]);

  const selectableMonthKeys = useMemo(
    () =>
      buildSelectableMonthKeys({
        monthsBack: 18,
        monthsForward: 5,
        includeMonthKeys: [
          ...orders.map((order) => getMonthKeyFromDateValue(order.deliveryDate)),
          ...(referenceData.bakerySettings?.monthlyExpenses ?? []).map(
            (entry) => entry.monthKey,
          ),
        ],
      }),
    [orders, referenceData.bakerySettings?.monthlyExpenses],
  );

  const reloadKey = useMemo(() => BAKERY_SETTINGS_UPDATED_EVENT, []);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      invalidateBakerySettingsCache();
      if (business?.id) {
        BUSINESS_REFERENCE_DATA_CACHE.delete(String(business.id));
      }
      setRefreshToken((current) => current + 1);
    };

    window.addEventListener(reloadKey, handleSettingsUpdated);
    return () => {
      window.removeEventListener(reloadKey, handleSettingsUpdated);
    };
  }, [business?.id, reloadKey]);

  useEffect(() => {
    if (!business?.id) return;

    let active = true;

    const load = async () => {
      const cacheKey = String(business.id);
      const cachedEntry = BUSINESS_REFERENCE_DATA_CACHE.get(cacheKey);

      if (
        cachedEntry &&
        Date.now() - cachedEntry.cachedAt < BUSINESS_DATA_CACHE_TTL_MS
      ) {
        setReferenceData(cachedEntry.value);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);

      const fetchRange = getBusinessFetchRange();

      const [bakerySettingsPayload, productsPayload, ordersPayload] =
        await Promise.all([
          safeApiFetch<BakerySettingsResponse>("/api/bakery/settings", {
            cacheTtlMs: BUSINESS_REFERENCE_CACHE_TTL_MS,
          }),
          safeApiFetch<ProductsResponse>("/api/products?mode=financial&limit=999", {
            cacheTtlMs: BUSINESS_REFERENCE_CACHE_TTL_MS,
          }),
          safeApiFetch<OrdersResponse>(
            `/api/bookings/orders?mode=financial&startDate=${fetchRange.startDate}&endDate=${fetchRange.endDate}`,
            {
              timeoutMs: 20000,
              cacheTtlMs: BUSINESS_ORDERS_CACHE_TTL_MS,
            },
          ),
        ]);

      if (!active) return;

      const productsRequestFailed = didRequestFail(productsPayload);
      const ordersRequestFailed = didRequestFail(ordersPayload);
      const nextReferenceData: BusinessReferenceData = {
        bakerySettings: bakerySettingsPayload?.data ?? null,
        products: productsPayload?.data ?? [],
        serverFinancialOrders: Array.isArray(ordersPayload?.data?.orders)
          ? ordersPayload.data.orders
          : ordersRequestFailed
            ? null
            : [],
      };

      const hasUsableData =
        nextReferenceData.products.length > 0 ||
        (nextReferenceData.serverFinancialOrders?.length ?? 0) > 0 ||
        Boolean(nextReferenceData.bakerySettings);

      if (hasUsableData) {
        BUSINESS_REFERENCE_DATA_CACHE.set(cacheKey, {
          value: nextReferenceData,
          cachedAt: Date.now(),
        });
      }

      if (ordersRequestFailed && cachedEntry && !hasUsableData) {
        setReferenceData(cachedEntry.value);
      } else {
        setReferenceData(nextReferenceData);
      }

      setError(
        (productsRequestFailed || ordersRequestFailed) &&
          !cachedEntry &&
          orders.length === 0
          ? "Data business belum berhasil dimuat dari backend."
          : null,
      );
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [
    business?.id,
    orders,
    refreshToken,
  ]);

  const authoritativeOrders = useMemo(
    () => mergeFinancialOrdersWithLocal(orders, referenceData.serverFinancialOrders),
    [orders, referenceData.serverFinancialOrders],
  );
  const currentRange = useMemo(
    () => getMonthRange(selectedMonth),
    [selectedMonth],
  );
  const previousRange = useMemo(
    () => getMonthRange(currentRange.prevMonthKey),
    [currentRange.prevMonthKey],
  );
  const currentSummary = useMemo(
    () =>
      calculateBakeryFinancialSummary({
        orders: authoritativeOrders,
        products: referenceData.products,
        settings: referenceData.bakerySettings,
        fromDate: currentRange.startDate,
        toDate: currentRange.endDate,
      }),
    [
      authoritativeOrders,
      currentRange.endDate,
      currentRange.startDate,
      referenceData.bakerySettings,
      referenceData.products,
    ],
  );
  const previousSummary = useMemo(
    () =>
      calculateBakeryFinancialSummary({
        orders: authoritativeOrders,
        products: referenceData.products,
        settings: referenceData.bakerySettings,
        fromDate: previousRange.startDate,
        toDate: previousRange.endDate,
      }),
    [
      authoritativeOrders,
      previousRange.endDate,
      previousRange.startDate,
      referenceData.bakerySettings,
      referenceData.products,
    ],
  );
  const deliveryRangeOrders = useMemo(
    () =>
      filterOrdersByDeliveryDateRange(
        authoritativeOrders,
        currentRange.startDate,
        currentRange.endDate,
      ),
    [authoritativeOrders, currentRange.endDate, currentRange.startDate],
  );
  const operationalBreakdown = useMemo(
    () =>
      calculateOperationalCostForDateRange({
        settings: referenceData.bakerySettings,
        fromDate: currentRange.startDate,
        toDate: currentRange.endDate,
      }),
    [currentRange.endDate, currentRange.startDate, referenceData.bakerySettings],
  );
  const viewState = useMemo<ViewState>(() => {
    if (!business?.id) return EMPTY_VIEW_STATE;

    const cancelledOrders = deliveryRangeOrders.filter(
      (order) => normalizeOrderStatus(order.orderStatus) === "Cancelled",
    );
    const grossMargin =
      currentSummary.totalRevenue > 0
        ? (currentSummary.grossProfit / currentSummary.totalRevenue) * 100
        : 0;
    const dailyTransactions: ViewState["dailyTransactions"] = [];
    const ordersByDate = new Map<string, typeof authoritativeOrders>();

    deliveryRangeOrders.forEach((order) => {
      if (normalizeOrderStatus(order.orderStatus) === "Cancelled") return;
      const dateKey = String(order.deliveryDate || "").split("T")[0];
      if (!dateKey) return;
      const current = ordersByDate.get(dateKey) ?? [];
      current.push(order);
      ordersByDate.set(dateKey, current);
    });

    Array.from(ordersByDate.keys())
      .sort()
      .forEach((dateKey) => {
        const dayOrders = ordersByDate.get(dateKey) ?? [];
        dailyTransactions.push({
          date: dateKey,
          transactions: dayOrders.map((order) => {
            const summary = calculateBakeryFinancialSummary({
              orders: [order],
              products: referenceData.products,
              settings: referenceData.bakerySettings,
              fromDate: dateKey,
              toDate: dateKey,
            });
            const customerName = String(order.customerName || "Customer").trim();
            return {
              revenue: summary.totalRevenue,
              cogs: summary.cogsCost,
              description: `${customerName} - ${order.product}`,
            };
          }),
        });
      });

    return {
      viewerName: userName?.trim() || "",
      businessName: business.name,
      businessLocation: business.location || "",
      currentRevenue: currentSummary.totalRevenue,
      currentProfit: currentSummary.netProfit,
      previousRevenue: previousSummary.totalRevenue,
      cogsCost: currentSummary.cogsCost,
      operationalCost: currentSummary.totalOperationalCost,
      cancelledRevenue: currentSummary.cancelledRevenue,
      cancelledCogsCost: currentSummary.cancelledCogsCost,
      returnRefundAmount: currentSummary.returnRefundAmount,
      cancelledOrdersCount: cancelledOrders.length,
      totalCost: currentSummary.totalCost,
      avgMargin: grossMargin,
      totalSalesCount: deliveryRangeOrders.length,
      paidSalesCount: deliveryRangeOrders.filter((order) => {
        const totalPaid = Number(order.totalPaidAmount ?? 0);
        const fallbackPaid =
          Number(order.dpPaidAmount ?? 0) + Number(order.finalPaidAmount ?? 0);
        return totalPaid > 0 || fallbackPaid > 0;
      }).length,
      topProducts: currentSummary.topProducts,
      bakerySettings: referenceData.bakerySettings,
      cogsBreakdown: currentSummary.cogsBreakdown,
      dailyTransactions,
    };
  }, [
    business,
    currentSummary,
    deliveryRangeOrders,
    previousSummary.totalRevenue,
    referenceData.bakerySettings,
    referenceData.products,
    userName,
  ]);

  const monthLabel = useMemo(
    () => getMonthLabel(selectedMonth),
    [selectedMonth],
  );
  const previousMonthLabel = useMemo(() => {
    const { prevMonthKey } = getMonthRange(selectedMonth);
    return getMonthLabel(prevMonthKey);
  }, [selectedMonth]);

  const revenueGrowth = useMemo(() => {
    if (viewState.previousRevenue <= 0) {
      return viewState.currentRevenue > 0 ? 100 : 0;
    }
    return (
      ((viewState.currentRevenue - viewState.previousRevenue) /
        viewState.previousRevenue) *
      100
    );
  }, [viewState.currentRevenue, viewState.previousRevenue]);

  const customExpenses = operationalBreakdown.expenseRows.filter(
    (entry) => entry.category === "custom",
  );
  const staffPayrollRows = operationalBreakdown.staffPayrollRows;
  const staffCost = operationalBreakdown.staffCost;
  const adsCost = operationalBreakdown.adsCost;
  const avatarLabel = getInitials(
    `${viewState.viewerName || "Owner"} ${viewState.businessName || ""}`,
  );

  const templatePenjualanData = useMemo(() => {
    let totalSubtotal = 0;
    let totalTotalCogs = 0;
    let totalLabaKotor = 0;

    const rows = deliveryRangeOrders.flatMap((order) => {
      if (normalizeOrderStatus(order.orderStatus) === "Cancelled") return [];
      const d = String(order.deliveryDate || "").split("T")[0] || "";
      if (!d) return [];

      const s = calculateBakeryFinancialSummary({
        orders: [order],
        products: referenceData.products,
        settings: referenceData.bakerySettings,
        fromDate: d,
        toDate: d,
      });

      return (order.items || []).map((item) => {
        const productName = String(item.productName || "").trim() || String(order.product || "").trim() || "Produk";
        const breakdown = s.cogsBreakdown.find(b => b.productName === productName);
        const cogsPerItem = breakdown ? breakdown.cogsPerItem : 0;
        
        const qty = Number(item.quantity || 0);
        const lineTotal = Number(item.lineTotal || 0);
        const hargaSatuan = qty > 0 ? Math.round(lineTotal / qty) : 0;
        const subtotal = lineTotal;
        const itemTotalCogs = cogsPerItem * qty;
        const labaKotor = subtotal - itemTotalCogs;
        const margin = subtotal > 0 ? (labaKotor / subtotal) : 0;

        totalSubtotal += subtotal;
        totalTotalCogs += itemTotalCogs;
        totalLabaKotor += labaKotor;

        return {
          idSales: order.bookingCode || order.resi || order.id,
          tanggal: d,
          namaProduk: productName,
          kategori: item.category || "",
          subkategori: item.size || (item.addOns || []).join(", "),
          qty: qty,
          hargaSatuan: hargaSatuan,
          cogsSatuan: cogsPerItem,
          subtotal: subtotal,
          totalCogs: itemTotalCogs,
          labaKotor: labaKotor,
          margin: `${(margin * 100).toFixed(0)}%`,
          statusBayar: order.paymentStatus || "Pending",
        };
      });
    });

    const totalMargin = totalSubtotal > 0 ? (totalLabaKotor / totalSubtotal) : 0;

    const summaryRow = [
      "", "", "", "", "", "", "", "TOTAL", totalSubtotal, totalTotalCogs, totalLabaKotor, `${(totalMargin * 100).toFixed(0)}%`, ""
    ];

    return { rows, summaryRow };
  }, [deliveryRangeOrders, referenceData.products, referenceData.bakerySettings]);

  const handleExportExcel = async () => {
    const selectedSheet = [
      {
        name: "Data Penjualan",
        title: "DATA PENJUALAN — Crumbella",
        subtitle: "Ekspor transaksi per pesanan. Subtotal, Laba & Margin terisi otomatis.",
        columns: [
          { key: "idSales", header: "ID Sales", width: 20 },
          { key: "tanggal", header: "Tanggal", width: 14 },
          { key: "namaProduk", header: "Nama Produk", width: 28 },
          { key: "kategori", header: "Kategori", width: 16 },
          { key: "subkategori", header: "Subkategori", width: 16 },
          { key: "qty", header: "Qty", width: 8 },
          { key: "hargaSatuan", header: "Harga Satuan", width: 16 },
          { key: "cogsSatuan", header: "COGS/HPP Satua", width: 18 },
          { key: "subtotal", header: "Subtotal", width: 16 },
          { key: "totalCogs", header: "Total COGS", width: 16 },
          { key: "labaKotor", header: "Laba Kotor", width: 16 },
          { key: "margin", header: "Margin", width: 10 },
          { key: "statusBayar", header: "Status Bayar", width: 14 },
        ],
        rows: templatePenjualanData.rows,
        summaryRow: templatePenjualanData.summaryRow,
      },
    ];

    const blob = await generateExcel(selectedSheet);
    const filename = `data-penjualan-${selectedMonth}.xlsx`;
    setIsExportPickerOpen(false);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csv = buildExportCsv({
      monthLabel,
      businessName: viewState.businessName || "Business",
      revenue: viewState.currentRevenue,
      cogsCost: viewState.cogsCost,
      operationalCost: viewState.operationalCost,
      totalCost: viewState.totalCost,
      profit: viewState.currentProfit,
      activeOrders: viewState.paidSalesCount,
      margin: viewState.avgMargin,
      topProducts: viewState.topProducts,
      dailyTransactions: viewState.dailyTransactions || [],
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `business-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setIsExportPickerOpen(false);
  };

  if (businessLoading || loading) {
    return (
      <div className="min-h-[60vh] px-4 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-center rounded-[28px] border border-[#dac8ba] bg-[#f7efe7] px-6 py-20 shadow-[0_12px_35px_rgba(84,56,36,0.08)]">
          <Loader2 className="mr-3 h-5 w-5 animate-spin text-[#c86030]" />
          <span className="text-sm font-medium text-[#6b4a38]">
            Memuat ringkasan business...
          </span>
        </div>
      </div>
    );
  }

  if (!business?.id) {
    return (
      <div className="min-h-[60vh] px-4 py-6">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-[#dac8ba] bg-[#f7efe7] px-6 py-10 text-center shadow-[0_12px_35px_rgba(84,56,36,0.08)]">
          <p className="text-sm font-semibold text-[#6b4a38]">
            Tidak ada business aktif.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10 text-[#23150f]">
      <GradientPageHeader
        title="Business"
        description={`${viewState.businessName || "Business"}${viewState.viewerName ? ` · ${viewState.viewerName}` : ""}`}
        icon={Building2}
        actions={
          <button
            type="button"
            onClick={() => setIsExportPickerOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--crumbella-accent)] px-4 text-xs font-semibold text-white transition hover:bg-[var(--crumbella-accent-hover)]"
          >
            <Download size={15} />
            Export
          </button>
        }
      />

      {typeof document !== "undefined" &&
        isExportPickerOpen &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4">
            <div className="w-full max-w-md rounded-2xl border border-[#e9d4c2] bg-white p-5 shadow-2xl">
              <p
                ref={exportDialogTitleRef}
                tabIndex={-1}
                className="text-base font-bold text-slate-800 outline-none"
              >
                Pilih Data Export
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Pilih salah satu jenis format data yang ingin diunduh.
              </p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex h-10 w-full items-center justify-start rounded-md border border-[#dfc9b7] bg-white px-4 py-2 text-sm font-medium text-[#2f1e13] transition-colors hover:bg-[#f6eee7]"
                >
                  ⭐ Data Penjualan (Template Excel)
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex h-10 w-full items-center justify-start rounded-md border border-[#dfc9b7] bg-white px-4 py-2 text-sm font-medium text-[#2f1e13] transition-colors hover:bg-[#f6eee7]"
                >
                  Ringkasan Laporan (CSV)
                </button>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setIsExportPickerOpen(false)}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <div className="overflow-hidden rounded-[34px] border border-[#e4d2c4] bg-[#f8efe5] px-4 pb-6 pt-4 shadow-[0_26px_55px_-42px_rgba(94,53,30,0.6)] sm:px-5 xl:px-6">
        <div className="overflow-hidden rounded-[30px] border border-[#dcc8b8] bg-[#f7efe7] shadow-[0_14px_36px_rgba(84,56,36,0.10)]">
          <div className="space-y-5 px-4 py-4 sm:px-5 lg:px-6">
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
              <MonthYearPicker
                value={selectedMonth}
                onChange={setSelectedMonth}
                monthKeys={selectableMonthKeys}
                formatLabel={getMonthLabel}
                buttonClassName="justify-between border-[#dbcabc] text-[#23150f]"
              />
              <div className="flex items-center justify-between rounded-[18px] border border-[#dbcabc] bg-[#fff8f3] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1f120e]">
                    {viewState.businessLocation || "Ringkasan finansial bulanan"}
                  </p>
                  <p className="mt-1 text-[11px] text-[#b58872]">
                    Data sinkron dari booking, payroll, dan biaya owner.
                  </p>
                </div>
                <div className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f0d6c2] text-sm font-bold text-[#a24d22]">
                  {avatarLabel || "BS"}
                </div>
              </div>
            </div>

            <section className="overflow-hidden rounded-[18px] border border-[#dbcabc] bg-white shadow-[0_2px_10px_rgba(84,56,36,0.06)]">
              <div className="grid grid-cols-1 divide-y divide-[#ead8cb] px-4 py-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="pr-3">
                  <p className="text-[11px] text-[#b58872]">Total Revenue</p>
                  <p className="mt-1 text-[20px] font-extrabold leading-none text-[#1f120e]">
                    {formatFullRupiah(viewState.currentRevenue)}
                  </p>
                  <p className="mt-2 text-[11px] leading-tight text-[#9b775e]">
                    Hanya penjualan produk/booking item. Ongkir dan biaya admin tidak masuk.
                  </p>
                  <p
                    className={`mt-2 text-[11px] font-semibold ${
                      revenueGrowth >= 0 ? "text-[#17653d]" : "text-[#c85d34]"
                    }`}
                  >
                    {revenueGrowth >= 0 ? "+" : "-"}{" "}
                    {`${revenueGrowth >= 0 ? "+" : ""}${Math.round(revenueGrowth)}%`}{" "}
                    vs {previousMonthLabel}
                  </p>
                </div>
                <div className="pt-4 sm:pl-3 sm:pt-0">
                  <p className="text-[11px] text-[#b58872]">Profit Bersih</p>
                  <p
                    className={`mt-1 text-[20px] font-extrabold leading-none ${
                      viewState.currentProfit >= 0
                        ? "text-[#17653d]"
                        : "text-[#c85d34]"
                    }`}
                  >
                    {formatFullRupiah(viewState.currentProfit)}
                  </p>
                  <p className="mt-2 text-[11px] text-[#b58872]">
                    setelah semua biaya yang tersedia
                  </p>
                </div>
              </div>
              <div className="border-t border-[#ead8cb] bg-[#fff8f3] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#7d675a]">
                  <span className="font-semibold text-[#1f120e]">Sales:</span>
                  <span className="rounded-full bg-[#fbf0d8] px-2.5 py-1 font-semibold text-[#9a6b10]">
                    Total {viewState.totalSalesCount}
                  </span>
                  <span className="rounded-full bg-[#e4f4ee] px-2.5 py-1 font-semibold text-[#17653d]">
                    Paid {viewState.paidSalesCount}
                  </span>
                </div>
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
              <section className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[28px] font-extrabold leading-none tracking-[-0.03em] text-[#1f120e]">
                    Rincian Biaya
                  </h2>
                  {viewState.businessLocation ? (
                    <span className="text-[11px] font-medium text-[#bf8c73]">
                      {viewState.businessLocation}
                    </span>
                  ) : null}
                </div>

                <div className="overflow-hidden rounded-[18px] border border-[#dbcabc] bg-white shadow-[0_2px_10px_rgba(84,56,36,0.06)]">
                  <BreakdownRow
                    label="Revenue"
                    note={
                      viewState.cancelledRevenue > 0
                        ? "Hanya penjualan produk. Sudah dikurangi revenue dari order yang dibatalkan"
                        : "Hanya penjualan produk. Ongkir dan biaya admin tidak ikut dihitung."
                    }
                    amount={viewState.currentRevenue}
                    tone={viewState.currentRevenue >= 0 ? "positive" : "profit"}
                  />
                  <BreakdownRow
                    label="Return / Refund"
                    note={
                      viewState.cancelledOrdersCount > 0
                        ? `${viewState.cancelledOrdersCount} order dibatalkan, HPP-nya dipindahkan ke Return / Refund`
                        : "Belum ada Return / Refund pada periode ini"
                    }
                    amount={viewState.returnRefundAmount}
                    tone="positive"
                  />
                  <BreakdownRow
                    label="COGS / HPP"
                    note="Klik untuk melihat penjabaran dari produk"
                    amount={viewState.cogsCost}
                  >
                    {viewState.cogsBreakdown.length > 0 ? (
                      <div className="space-y-1.5 border-l-2 border-[#ead8cb] pl-3">
                        {viewState.cogsBreakdown.map((item, idx) => (
                          <div
                            key={`${item.productName}-${item.cogsPerItem}-${idx}`}
                            className="flex items-center justify-between gap-3 text-[11px] text-[#7d675a]"
                          >
                            <span className="truncate">
                              {item.productName} qty {Math.round(item.quantity)} x {formatCurrency(item.cogsPerItem).replace("Rp", "").trim()}
                            </span>
                            <span className="font-mono">
                              {formatCurrency(item.totalCogs)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#b58872] italic">
                        Tidak ada detail COGS / HPP pada periode ini.
                      </div>
                    )}
                  </BreakdownRow>
                  <BreakdownRow
                    label="Gaji Staff"
                    note={
                      staffPayrollRows.length > 0
                        ? "Payroll bulanan aktif"
                        : "Belum ada payroll aktif"
                    }
                    amount={staffCost}
                  >
                    {staffPayrollRows.length > 0 ? (
                      <div className="space-y-1 border-l-2 border-[#ead8cb] pl-3">
                        {staffPayrollRows.slice(0, 4).map((entry) => (
                          <div
                            key={entry.userId}
                            className="flex items-center justify-between gap-3 text-[11px] text-[#7d675a]"
                          >
                            <span className="truncate">{entry.name}</span>
                            <span className="font-mono">
                              {formatCurrency(Number(entry.takeHomePay || 0))}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </BreakdownRow>
                  <BreakdownRow
                    label="Biaya Iklan"
                    note="Input bulanan owner"
                    amount={adsCost}
                  />
                  {customExpenses.length > 0 ? (
                    customExpenses.map((entry) => (
                      <BreakdownRow
                        key={entry.id}
                        label={entry.name}
                        note={entry.note || "Custom / Input bulanan"}
                        amount={Number(entry.amount || 0)}
                      />
                    ))
                  ) : (
                    <BreakdownRow
                      label="Packaging Tambahan"
                      note="Custom / Input bulanan"
                      amount={0}
                    />
                  )}
                  <BreakdownRow
                    label="Profit Bersih"
                    amount={viewState.currentProfit}
                    tone="profit"
                  />
                </div>
              </section>

              <aside className="space-y-5">
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[#dbcabc] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(84,56,36,0.06)]">
                    <p className="text-[11px] text-[#7d675a]">Sales Tercatat</p>
                    <p className="mt-1 text-[22px] font-extrabold leading-none text-[#1f120e]">
                      {viewState.totalSalesCount}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[#dbcabc] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(84,56,36,0.06)]">
                    <p className="text-[11px] text-[#7d675a]">Margin Kotor</p>
                    <p className="mt-1 text-[22px] font-extrabold leading-none text-[#17653d]">
                      {Math.round(viewState.avgMargin)}%
                    </p>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="inline-flex items-center gap-2 text-[28px] font-extrabold leading-none tracking-[-0.03em] text-[#1f120e]">
                      <Trophy size={18} className="text-[#cc8a27]" />
                      Top Produk
                    </h2>
                    <span className="text-[12px] font-semibold text-[#b0663f]">
                      by Revenue
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-[18px] border border-[#dbcabc] bg-white shadow-[0_2px_10px_rgba(84,56,36,0.06)]">
                    {viewState.topProducts.length > 0 ? (
                      viewState.topProducts.slice(0, 5).map((item, index) => (
                        <div
                          key={`${item.productName}-${index}`}
                          className={`flex items-center gap-3 px-4 py-3 ${
                            index <
                            Math.min(viewState.topProducts.length, 5) - 1
                              ? "border-b border-[#ead8cb]"
                              : ""
                          }`}
                        >
                          <div className="text-base">{getRankEmoji(index)}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-bold leading-tight text-[#1f120e]">
                              {item.productName}
                            </p>
                            <p className="mt-1 text-[11px] text-[#7d675a]">
                              {item.quantitySold} order
                            </p>
                          </div>
                          <p className="shrink-0 font-mono text-[14px] font-bold text-[#c86030]">
                            {formatCurrency(item.revenue)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-8 text-center text-sm text-[#9b7b69]">
                        Belum ada data produk untuk {monthLabel}.
                      </div>
                    )}
                  </div>
                </section>
              </aside>
            </div>

            {error ? (
              <div className="rounded-2xl border border-[#f1c5b8] bg-[#fff1eb] px-4 py-3 text-sm text-[#a54a2d]">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BusinessPage() {
  return (
    <OrdersProvider enabled>
      <BusinessPageContent />
    </OrdersProvider>
  );
}
