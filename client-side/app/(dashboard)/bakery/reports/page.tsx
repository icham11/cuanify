"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/components/orders/formatters";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import { generateExcel } from "@/lib/export/excel";
import { useOrders } from "@/components/bakery/store";
import { calculateOrderTokenFromItems } from "@/lib/bookings/order-token-calculator";
import {
  calculateBakeryFinancialSummary,
  getMonthKeyFromDateValue,
  type BakeryFinancialOrder,
} from "@/lib/bakery/financial-summary";
import type { BakeryBusinessSettings } from "@/lib/bakery/settings";
import type { Product } from "@/types/product";
import { useRole } from "@/context/RoleContext";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import MonthYearPicker, {
  buildSelectableMonthKeys,
} from "@/components/bakery/shared/MonthYearPicker";
import { ChartPie } from "lucide-react";

type AttendanceMember = {
  memberId: number;
  userId: number;
  name: string;
  email: string;
  role: "Admin" | "Staff";
  attendanceCount: number;
  expectedAttendanceDays: number;
  lateCount: number;
  systemLateCount: number;
  manualLateCount: number;
  isManualOverride: boolean;
  missingDates: string[];
  daily: Array<{
    date: string;
    status: "present";
    checkInAt: string;
    isLate: boolean;
    notes: string | null;
  }>;
};

type AttendanceSelfData = {
  attendanceCount: number;
  expectedAttendanceDays: number;
  lateCount: number;
  systemLateCount: number;
  manualLateCount: number;
  isManualOverride: boolean;
  missingDates: string[];
  totalDays: number;
  records: Array<{
    date: string;
    status: "present";
    checkInAt: string;
    isLate: boolean;
    notes: string | null;
  }>;
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKeyFromDate(dateStr: string) {
  return getMonthKeyFromDateValue(dateStr);
}

function getMonthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) {
    const today = new Date();
    return {
      from: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: toDateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }

  return {
    from: toDateInputValue(new Date(year, month - 1, 1)),
    to: toDateInputValue(new Date(year, month, 0)),
  };
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return "Pilih Bulan";
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function parseNumericId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getOrderStaffTokenAssignments(order: {
  assignedStaffUserId?: number | null;
  assignedStaffName?: string;
  items?: Array<{
    quantity?: number;
    category?: string;
    tokenDifficulty?: string | null;
  }>;
  productionStages?: Array<{
    staffId?: number | string | null;
    tokenAmount?: number | null;
  }>;
}) {
  const stageAssignments = (order.productionStages ?? [])
    .map((stage) => ({
      staffUserId: parseNumericId(stage.staffId),
      token: Math.max(0, Math.round(Number(stage.tokenAmount) || 0)),
    }))
    .filter(
      (stage): stage is { staffUserId: number; token: number } =>
        Boolean(stage.staffUserId) && stage.token > 0,
    )
    .map((stage) => ({
      staffUserId: stage.staffUserId,
      staffName:
        (order.assignedStaffName || "").trim() || `Staff #${stage.staffUserId}`,
      token: stage.token,
    }));

  if (stageAssignments.length > 0) return stageAssignments;
  if (!order.assignedStaffUserId) return [];

  return [
    {
      staffUserId: order.assignedStaffUserId,
      staffName:
        (order.assignedStaffName || "").trim() ||
        `Staff #${order.assignedStaffUserId}`,
      token: calculateOrderTokenFromItems(
        (order.items || []).map((item) => ({
          ...item,
          category: item.category || "",
          tokenDifficulty: item.tokenDifficulty || undefined,
        })),
      ),
    },
  ];
}

export default function ReportsPage() {
  const router = useRouter();
  const { isOwner, loading: roleLoading } = useRole();
  const { orders } = useOrders();
  const currentMonth = monthKeyFromDate(toDateInputValue(new Date()));
  const initialRange = getMonthRange(currentMonth);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [isExportPickerOpen, setIsExportPickerOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [serverFinancialOrders, setServerFinancialOrders] = useState<
    BakeryFinancialOrder[] | null
  >(null);

  useEffect(() => {
    if (roleLoading) return;
    if (!isOwner) {
      router.replace("/bakery/bookings");
    }
  }, [isOwner, roleLoading, router]);
  const [bakerySettings, setBakerySettings] =
    useState<BakeryBusinessSettings | null>(null);
  const [attendanceTeam, setAttendanceTeam] = useState<AttendanceMember[]>([]);
  const [attendanceSelf, setAttendanceSelf] = useState<AttendanceSelfData | null>(null);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(true);
  const exportDialogTitleRef = useRef<HTMLParagraphElement | null>(null);
  const hasInitializedFullRangeRef = useRef(false);
  const isExactSelectedMonthRange =
    fromDate === getMonthRange(selectedMonth).from &&
    toDate === getMonthRange(selectedMonth).to;

  useEffect(() => {
    if (!isExportPickerOpen) return;

    window.scrollTo({ top: 0, behavior: "smooth" });
    const dashboardScroller = document.querySelector(
      "main.custom-scrollbar",
    ) as HTMLElement | null;
    if (dashboardScroller) {
      dashboardScroller.scrollTo({ top: 0, behavior: "smooth" });
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusId = window.setTimeout(() => {
      exportDialogTitleRef.current?.focus();
    }, 120);

    return () => {
      window.clearTimeout(focusId);
      document.body.style.overflow = previousOverflow;
    };
  }, [isExportPickerOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      try {
        const response = await fetch("/api/products?limit=999&withRecipe=false", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          data?: Product[];
        };
        if (!response.ok || cancelled) return;
        setProducts(payload.data || []);
      } catch {
        if (!cancelled) setProducts([]);
      }
    };

    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBakerySettings = async () => {
      try {
        const response = await fetch("/api/bakery/settings", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          data?: BakeryBusinessSettings;
        };
        if (!response.ok || cancelled) return;
        setBakerySettings(payload.data ?? null);
      } catch {
        if (!cancelled) setBakerySettings(null);
      }
    };

    void loadBakerySettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadFinancialOrders = async () => {
      try {
        const response = await fetch("/api/bookings/orders?mode=financial", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          data?: { orders?: BakeryFinancialOrder[] };
        };
        if (!response.ok || cancelled) return;

        setServerFinancialOrders(
          Array.isArray(payload.data?.orders) ? payload.data.orders : [],
        );
      } catch {
        if (!cancelled) setServerFinancialOrders(null);
      }
    };

    void loadFinancialOrders();
    return () => {
      cancelled = true;
    };
  }, [orders]);

  useEffect(() => {
    let cancelled = false;

    const loadAttendance = async () => {
      setIsAttendanceLoading(true);
      try {
        const attendanceQuery = isExactSelectedMonthRange
          ? `/api/bakery/attendance?month=${selectedMonth}`
          : `/api/bakery/attendance?from=${fromDate}&to=${toDate}`;
        const response = await fetch(
          attendanceQuery,
          { cache: "no-store" },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          data?: {
            mode?: "owner" | "self";
            team?: AttendanceMember[];
            totalDays?: number;
          } & AttendanceSelfData;
        };

        if (!response.ok || cancelled) return;

        if (payload.data?.mode === "owner") {
          setAttendanceTeam(payload.data.team || []);
          setAttendanceSelf(null);
        } else {
          setAttendanceSelf(payload.data || null);
          setAttendanceTeam([]);
        }
      } catch {
        if (!cancelled) {
          setAttendanceTeam([]);
          setAttendanceSelf(null);
        }
      } finally {
        if (!cancelled) setIsAttendanceLoading(false);
      }
    };

    void loadAttendance();
    return () => {
      cancelled = true;
    };
  }, [fromDate, isExactSelectedMonthRange, selectedMonth, toDate]);

  const selectableMonthKeys = useMemo(
    () =>
      buildSelectableMonthKeys({
        monthsBack: 18,
        monthsForward: 5,
        includeMonthKeys: orders.map((order) => monthKeyFromDate(order.deliveryDate)),
      }).sort((left, right) => right.localeCompare(left)),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (fromDate && order.deliveryDate < fromDate) return false;
      if (toDate && order.deliveryDate > toDate) return false;
      return true;
    });
  }, [orders, fromDate, toDate]);

  const today = toDateInputValue(new Date());
  const lateOrders = filteredOrders.filter((order) => {
    const status = normalizeOrderStatus(order.orderStatus);
    return (
      Boolean(order.deliveryDate) &&
      order.deliveryDate < today &&
      !["Delivered", "Completed", "Cancelled"].includes(status)
    );
  });

  const totalOrders = filteredOrders.length;

  const financialOrders = useMemo<BakeryFinancialOrder[]>(
    () =>
      serverFinancialOrders ??
      orders.map((order) => ({
        deliveryDate: order.deliveryDate,
        product: order.product,
        totalPrice: order.totalPrice,
        totalPaidAmount: order.totalPaidAmount,
        dpPaidAmount: order.dpPaidAmount,
        finalPaidAmount: order.finalPaidAmount,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        paymentTransactions: order.paymentTransactions,
        items: order.items,
      })),
    [orders, serverFinancialOrders],
  );

  useEffect(() => {
    if (hasInitializedFullRangeRef.current) return;
    if (financialOrders.length === 0) return;

    const availableDates = financialOrders
      .map((order) => order.deliveryDate)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .sort((left, right) => left.localeCompare(right));

    if (availableDates.length === 0) return;

    const nextFromDate = availableDates[0];
    const nextToDate = availableDates[availableDates.length - 1];
    setFromDate(nextFromDate);
    setToDate(nextToDate);
    setSelectedMonth(monthKeyFromDate(nextToDate));
    hasInitializedFullRangeRef.current = true;
  }, [financialOrders]);

  const financialSummary = useMemo(() => {
    return calculateBakeryFinancialSummary({
      orders: financialOrders,
      products,
      settings: bakerySettings,
      fromDate,
      toDate,
    });
  }, [bakerySettings, financialOrders, fromDate, products, toDate]);

  const totalRevenue = financialSummary.totalRevenue;
  const totalCashFlowIn = financialSummary.totalCashFlowIn;

  const completedOrders = filteredOrders.filter((order) =>
    ["Completed", "Delivered"].includes(normalizeOrderStatus(order.orderStatus)),
  ).length;
  const avgOrderValue =
    totalOrders > 0 ? Math.round(financialSummary.bookedRevenue / totalOrders) : 0;

  const allCustomers = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; firstOrder: string; totalOrders: number }
    >();

    orders.forEach((order) => {
      const name = (order.customerName || "Walk-in Customer").trim();
      const phone = (order.customerPhone || "").trim();
      const key = `${name.toLowerCase()}||${phone.toLowerCase()}`;
      const current = grouped.get(key);
      const deliveryDate = order.deliveryDate || "";

      if (!current) {
        grouped.set(key, {
          name,
          firstOrder: deliveryDate,
          totalOrders: 1,
        });
        return;
      }

      current.totalOrders += 1;
      if (!current.firstOrder || (deliveryDate && deliveryDate < current.firstOrder)) {
        current.firstOrder = deliveryDate;
      }
    });

    return grouped;
  }, [orders]);

  const filteredCustomerKeys = useMemo(() => {
    return Array.from(
      new Set(
        filteredOrders.map((order) => {
          const name = (order.customerName || "Walk-in Customer").trim();
          const phone = (order.customerPhone || "").trim();
          return `${name.toLowerCase()}||${phone.toLowerCase()}`;
        }),
      ),
    );
  }, [filteredOrders]);

  const totalCustomers = filteredCustomerKeys.length;
  const newCustomers = filteredCustomerKeys.filter((key) => {
    const customer = allCustomers.get(key);
    return (
      customer?.firstOrder &&
      (!fromDate || customer.firstOrder >= fromDate) &&
      (!toDate || customer.firstOrder <= toDate)
    );
  }).length;
  const repeatCustomers = filteredCustomerKeys.filter((key) => {
    const customer = allCustomers.get(key);
    return (customer?.totalOrders ?? 0) > 1;
  }).length;
  const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;

  const topProducts = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; revenue: number; orderCount: number }
    >();

    filteredOrders.forEach((order) => {
      (order.items || []).forEach((item) => {
        const key = item.productName || order.product || "Produk";
        const row = grouped.get(key) ?? {
          name: key,
          revenue: 0,
          orderCount: 0,
        };
        row.revenue += Number(
          item.lineTotal ||
            item.selectedPrice ||
            item.basePrice * Math.max(1, Number(item.quantity || 1)) ||
            0,
        );
        row.orderCount += Math.max(1, Number(item.quantity || 1));
        grouped.set(key, row);
      });
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);
  }, [filteredOrders]);

  const roleMap = useMemo(() => {
    const map = new Map<number, "Admin" | "Staff">();
    attendanceTeam.forEach((member) => {
      map.set(member.userId, member.role);
    });
    return map;
  }, [attendanceTeam]);

  const lateByStaffMap = useMemo(() => {
    const map = new Map<number, number>();
    attendanceTeam.forEach((member) => {
      map.set(member.userId, member.lateCount);
    });
    return map;
  }, [attendanceTeam]);

  const staffPerformance = useMemo(() => {
    const grouped = new Map<
      number,
      {
        userId: number;
        name: string;
        token: number;
        dates: Set<string>;
      }
    >();

    filteredOrders.forEach((order) => {
      getOrderStaffTokenAssignments(order).forEach((assignment) => {
        const current = grouped.get(assignment.staffUserId) ?? {
          userId: assignment.staffUserId,
          name: assignment.staffName,
          token: 0,
          dates: new Set<string>(),
        };
        current.token += assignment.token;
        if (order.deliveryDate) current.dates.add(order.deliveryDate);
        grouped.set(assignment.staffUserId, current);
      });
    });

    return Array.from(grouped.values())
      .map((staff) => {
        const activeDays = Math.max(1, staff.dates.size);
        const lateCount = lateByStaffMap.get(staff.userId) ?? 0;
        return {
          ...staff,
          avgToken: Math.round(staff.token / activeDays),
          lateCount,
          qualityLabel: lateCount === 0 ? "Baik" : "Kalibrasi",
        };
      })
      .sort((a, b) => b.token - a.token);
  }, [filteredOrders, lateByStaffMap]);

  const attendanceCards = useMemo(() => {
    if (attendanceTeam.length > 0) {
      return attendanceTeam.map((member) => ({
        key: `member-${member.memberId}`,
        name: member.name,
        role: member.role,
        attendanceCount: member.attendanceCount,
        lateCount: member.lateCount,
        totalDays: Math.max(member.expectedAttendanceDays, 0),
        systemLateCount: member.systemLateCount,
        manualLateCount: member.manualLateCount,
        missingCount: member.missingDates.length,
        isManualOverride: member.isManualOverride,
      }));
    }

    if (attendanceSelf) {
      return [
        {
          key: "self",
          name: "Saya",
          role: "Staff",
          attendanceCount: attendanceSelf.attendanceCount,
          lateCount: attendanceSelf.lateCount,
          totalDays: Math.max(attendanceSelf.expectedAttendanceDays || 0, 0),
          systemLateCount: attendanceSelf.systemLateCount,
          manualLateCount: attendanceSelf.manualLateCount,
          missingCount: attendanceSelf.missingDates.length,
          isManualOverride: attendanceSelf.isManualOverride,
        },
      ];
    }

    return [];
  }, [attendanceSelf, attendanceTeam]);

  const reportScopeLabel = useMemo(() => {
    const monthRange = getMonthRange(selectedMonth);
    if (fromDate === monthRange.from && toDate === monthRange.to) {
      return formatMonthLabel(selectedMonth);
    }
    return `${fromDate} s/d ${toDate}`;
  }, [fromDate, selectedMonth, toDate]);

  const bookingRows = useMemo(
    () =>
      filteredOrders.map((order) => ({
        bookingCode: order.bookingCode || order.resi || order.id,
        resi: order.resi || "-",
        customer: order.customerName || "Walk-in Customer",
        phone: order.customerPhone || "",
        deliveryDate: order.deliveryDate || "",
        deliverySlot: order.deliverySlot || "",
        status: normalizeOrderStatus(order.orderStatus),
        paymentStatus: order.paymentStatus || "Pending",
        totalPrice: Number(order.totalPrice || 0),
        notes: order.notes || "",
      })),
    [filteredOrders],
  );

  const itemRows = useMemo(
    () =>
      filteredOrders.flatMap((order) =>
        (order.items || []).map((item) => ({
          bookingCode: order.bookingCode || order.resi || order.id,
          customer: order.customerName || "Walk-in Customer",
          deliveryDate: order.deliveryDate || "",
          productName: item.productName || "Produk",
          category: item.category || "",
          size: item.size || "",
          qty: Number(item.quantity || 0),
          lineTotal: Number(item.lineTotal || 0),
          addOns: (item.addOns || []).join(", "),
        })),
      ),
    [filteredOrders],
  );

  const customerRows = useMemo(() => {
    return filteredCustomerKeys.map((key) => {
      const customer = allCustomers.get(key);
      return {
        customer: customer?.name || "Customer",
        orderCount: customer?.totalOrders || 0,
        firstOrder: customer?.firstOrder || "",
      };
    });
  }, [allCustomers, filteredCustomerKeys]);

  const exportExcel = (type: "bookings" | "items" | "customers") => {
    const selectedSheet =
      type === "bookings"
        ? [
            {
              name: "Bookings",
              columns: [
                { key: "bookingCode", header: "Booking Code", width: 18 },
                { key: "resi", header: "Resi", width: 18 },
                { key: "customer", header: "Customer", width: 24 },
                { key: "phone", header: "Phone", width: 18 },
                { key: "deliveryDate", header: "Delivery Date", width: 16 },
                { key: "deliverySlot", header: "Delivery Slot", width: 22 },
                { key: "status", header: "Order Status", width: 16 },
                { key: "paymentStatus", header: "Payment Status", width: 16 },
                { key: "totalPrice", header: "Total Price", width: 16 },
                { key: "notes", header: "Notes", width: 36 },
              ],
              rows: bookingRows,
            },
          ]
        : type === "items"
          ? [
              {
                name: "Booking Items",
                columns: [
                  { key: "bookingCode", header: "Booking Code", width: 18 },
                  { key: "customer", header: "Customer", width: 24 },
                  { key: "deliveryDate", header: "Delivery Date", width: 16 },
                  { key: "productName", header: "Product", width: 28 },
                  { key: "category", header: "Category", width: 16 },
                  { key: "size", header: "Size", width: 14 },
                  { key: "qty", header: "Qty", width: 10 },
                  { key: "lineTotal", header: "Line Total", width: 16 },
                  { key: "addOns", header: "Add Ons", width: 28 },
                ],
                rows: itemRows,
              },
            ]
          : [
              {
                name: "Customers",
                columns: [
                  { key: "customer", header: "Customer", width: 24 },
                  { key: "orderCount", header: "Total Orders", width: 14 },
                  { key: "firstOrder", header: "First Order", width: 18 },
                ],
                rows: customerRows,
              },
            ];

    const blob = generateExcel(selectedSheet);
    const filePrefix =
      type === "bookings"
        ? "reports-bookings"
        : type === "items"
          ? "reports-booking-items"
          : "reports-customers";
    const filename = `${filePrefix}-${toDateInputValue(new Date())}.xlsx`;
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

  if (roleLoading || !isOwner) {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl pb-10 text-[#2f1e13]">
      <GradientPageHeader title="Reports" description="Data & Ringkasan Bisnis" icon={ChartPie} />
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
                Pilih salah satu jenis data Excel yang ingin diunduh.
              </p>
              <div className="mt-4 grid gap-2">
                <Button onClick={() => exportExcel("bookings")} className="justify-start">
                  Bookings
                </Button>
                <Button onClick={() => exportExcel("items")} className="justify-start">
                  Booking Items
                </Button>
                <Button onClick={() => exportExcel("customers")} className="justify-start">
                  Customers
                </Button>
              </div>
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsExportPickerOpen(false)}
                  className="w-full"
                >
                  Batal
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <section className="space-y-3 rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.45)]">
        <div className="flex items-start justify-between gap-3 border-b border-[#ead6c8] pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[1rem] leading-none text-[#cb6531]">≡</span>
              <h1 className="text-[1.1rem] font-bold leading-none text-[#1f140d]">
                Reports
              </h1>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fbe7d8] text-[11px] font-bold text-[#a64f1f]">
                FE
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#b0734d]">Data & Ringkasan Bisnis</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <MonthYearPicker
            value={selectedMonth}
            onChange={(nextMonth) => {
              setSelectedMonth(nextMonth);
              const range = getMonthRange(nextMonth);
              setFromDate(range.from);
              setToDate(range.to);
              setIsCustomOpen(false);
            }}
            monthKeys={selectableMonthKeys}
            formatLabel={formatMonthLabel}
            buttonClassName="sm:min-w-[15rem]"
          />

          <button
            type="button"
            onClick={() => setIsCustomOpen((prev) => !prev)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#dfc9b7] bg-white px-4 text-sm font-semibold text-[#2f1e13]"
          >
            Custom
          </button>

          <button
            type="button"
            onClick={() => setIsExportPickerOpen(true)}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#d46a2d] px-4 text-sm font-semibold text-white"
          >
            Export
          </button>
        </div>

        {isCustomOpen ? (
          <div className="mt-3 rounded-[18px] border border-[#e9d4c2] bg-white px-3 py-3">
            <div className="grid gap-3">
              <div className="grid gap-1">
                <span className="text-[11px] font-semibold text-[#9b775e]">Dari</span>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="h-10 rounded-xl border-[#dfc9b7]"
                />
              </div>
              <div className="grid gap-1">
                <span className="text-[11px] font-semibold text-[#9b775e]">Sampai</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="h-10 rounded-xl border-[#dfc9b7]"
                />
              </div>
            </div>
          </div>
        ) : null}

        <p className="mt-3 text-[11px] text-[#9b775e]">Laporan aktif: {reportScopeLabel}</p>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section>
          <h2 className="mb-2 flex items-center gap-2 text-[1rem] font-bold text-[#23160f]">
            <span>💰</span> Keuangan
          </h2>
          <div className="overflow-hidden rounded-[18px] border border-[#dec8b6] bg-white">
            <ReportRow label="Total Revenue" value={formatCurrency(totalRevenue)} />
            <ReportRow
              label="Cash Flow In"
              value={formatCurrency(totalCashFlowIn)}
              valueClassName="text-[#0e7b3f]"
            />
            <ReportRow
              label="Total Biaya"
              value={formatCurrency(financialSummary.totalCost)}
              valueClassName="text-[#cf4028]"
            />
            <ReportRow
              label="Profit Bersih"
              value={formatCurrency(financialSummary.netProfit)}
              rowClassName={
                financialSummary.netProfit >= 0 ? "bg-[#dff1ea]" : "bg-[#fff1ec]"
              }
              valueClassName={
                financialSummary.netProfit >= 0 ? "text-[#0d6a4f]" : "text-[#cf4028]"
              }
              isLast
            />
          </div>
          <div className="mt-3 rounded-[18px] border border-[#e8d7ca] bg-[#fffaf6] px-3 py-3">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9b775e]">
              Cara Baca Angka
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-[16px] border border-[#eedfd3] bg-white px-3 py-3">
                <p className="text-sm font-bold text-[#2f1e13]">Total Revenue</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#c16934]">
                  Saat dikirim
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#7f6049]">
                  Masuk mengikuti tanggal delivery dan hanya menghitung pembayaran order yang sudah masuk.
                </p>
              </div>
              <div className="rounded-[16px] border border-[#eedfd3] bg-white px-3 py-3">
                <p className="text-sm font-bold text-[#2f1e13]">Cash Flow In</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#0e7b3f]">
                  Saat booking
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#7f6049]">
                  Menunjukkan uang yang sudah dibayar customer dan diakui pada tanggal booking dibuat.
                </p>
              </div>
              <div className="rounded-[16px] border border-[#eedfd3] bg-white px-3 py-3">
                <p className="text-sm font-bold text-[#2f1e13]">Profit Bersih</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#0d6a4f]">
                  Dari revenue
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#7f6049]">
                  Rumusnya total revenue - COGS - biaya operasional. Cash flow in tidak mengubah profit bersih langsung.
                </p>
              </div>
            </div>
          </div>
          {financialSummary.totalOperationalCost > 0 ? (
            <p className="mt-2 text-[11px] text-[#9b775e]">
              Total biaya sudah termasuk payroll dan biaya operasional bulanan.
            </p>
          ) : null}
          {!financialSummary.isCogsAccurate ? (
            <p className="mt-2 text-[11px] text-[#a35c3a]">
              Perhitungan belum akurat penuh. Ada {financialSummary.itemsWithMissingCogs} item tanpa COGS produk.
            </p>
          ) : null}
        </section>

          <section>
          <h2 className="mb-2 flex items-center gap-2 text-[1rem] font-bold text-[#23160f]">
            <span>📦</span> Orders
          </h2>
          <div className="overflow-hidden rounded-[18px] border border-[#dec8b6] bg-white">
            <ReportRow label="Total Order" value={String(totalOrders)} />
            <ReportRow label="Order Selesai" value={String(completedOrders)} />
            <ReportRow
              label="Order Terlambat"
              value={String(lateOrders.length)}
              valueClassName="text-[#cf4028]"
            />
            <ReportRow label="Avg Order Value" value={formatCurrency(avgOrderValue)} isLast />
          </div>
        </section>

          <section>
          <h2 className="mb-2 flex items-center gap-2 text-[1rem] font-bold text-[#23160f]">
            <span>🏆</span> Produk Terjual
          </h2>
          <div className="overflow-hidden rounded-[18px] border border-[#dec8b6] bg-white">
            {topProducts.length === 0 ? (
              <div className="px-4 py-4 text-sm text-[#8a6a54]">Belum ada data produk di range ini.</div>
            ) : (
              topProducts.map((product, index) => (
                <div
                  key={product.name}
                  className={`flex items-start justify-between gap-3 px-4 py-3 ${
                    index < topProducts.length - 1 ? "border-b border-[#ead6c8]" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5 text-sm">🥇</span>
                    <div>
                      <p className="text-sm font-bold text-[#1f140d]">{product.name}</p>
                      <p className="text-[11px] text-[#8a6a54]">{product.orderCount} order</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-[#e2692b]">{formatCurrency(product.revenue)}</p>
                </div>
              ))
            )}
          </div>
        </section>

          <section>
          <h2 className="mb-2 flex items-center gap-2 text-[1rem] font-bold text-[#23160f]">
            <span>👥</span> Customer
          </h2>
          <div className="overflow-hidden rounded-[18px] border border-[#dec8b6] bg-white">
            <ReportRow label="Total Customer" value={String(totalCustomers)} />
            <ReportRow
              label="New Customer"
              value={String(newCustomers)}
              valueClassName="text-[#1d4ed8]"
            />
            <ReportRow
              label="Repeat Customer"
              value={String(repeatCustomers)}
              valueClassName="text-[#0e7b3f]"
            />
            <ReportRow
              label="Order lebih dari 1x"
              value={`${repeatRate.toFixed(1)}%`}
              labelClassName="text-[11px] text-[#9b775e]"
              isLast
            />
          </div>
        </section>

          <section>
          <h2 className="mb-2 flex items-center gap-2 text-[1rem] font-bold text-[#23160f]">
            <span>👤</span> Kinerja Staff
          </h2>
          <div className="overflow-hidden rounded-[18px] border border-[#dec8b6] bg-white">
            {staffPerformance.length === 0 ? (
              <div className="px-4 py-4 text-sm text-[#8a6a54]">
                Belum ada assignment staff di range ini.
              </div>
            ) : (
              staffPerformance.map((staff, index) => (
                <div
                  key={staff.userId}
                  className={`px-4 py-4 ${index < staffPerformance.length - 1 ? "border-b border-[#ead6c8]" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#fbe7d8] text-sm font-bold text-[#a64f1f]">
                        {staff.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-[#1f140d]">{staff.name}</p>
                        <p className="text-[11px] text-[#8a6a54]">
                          {roleMap.get(staff.userId) || "Staff"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        staff.qualityLabel === "Baik"
                          ? "bg-[#e2f3df] text-[#327341]"
                          : "bg-[#faead7] text-[#9e5b18]"
                      }`}
                    >
                      {staff.qualityLabel}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <MetricTile
                      title={staff.token.toLocaleString("id-ID")}
                      subtitle="Token bulan ini"
                    />
                    <MetricTile title={String(staff.avgToken)} subtitle="Avg tok/hari" />
                    <MetricTile
                      title={`${staff.lateCount}x`}
                      subtitle="Terlambat"
                      danger={staff.lateCount > 0}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

          <section>
          <h2 className="mb-2 flex items-center gap-2 text-[1rem] font-bold text-[#23160f]">
            <span>🪪</span> Absensi Staff
          </h2>
          <div className="overflow-hidden rounded-[18px] border border-[#dec8b6] bg-white">
            {isAttendanceLoading ? (
              <div className="px-4 py-4 text-sm text-[#8a6a54]">Memuat absensi staff...</div>
            ) : attendanceCards.length === 0 ? (
              <div className="px-4 py-4 text-sm text-[#8a6a54]">
                Belum ada data absensi di range ini.
              </div>
            ) : (
              attendanceCards.map((member, index) => (
                <div
                  key={member.key}
                  className={`flex items-center justify-between gap-3 px-4 py-4 ${
                    index < attendanceCards.length - 1 ? "border-b border-[#ead6c8]" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#fbe7d8] text-sm font-bold text-[#a64f1f]">
                      {member.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#1f140d]">{member.name}</p>
                      <p className="text-[11px] text-[#8a6a54]">{member.role}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#1f140d]">
                      {member.attendanceCount}/{member.totalDays}
                    </p>
                    <p className="text-[11px] text-[#8a6a54]">hari hadir</p>
                    <p className="text-[10px] text-[#b0734d]">
                      Sistem {member.systemLateCount}x
                      {member.manualLateCount > 0 || member.isManualOverride
                        ? ` • Owner ${member.manualLateCount}x`
                        : ""}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-[#cf4028]">{member.lateCount}x telat</p>
                </div>
              ))
            )}
          </div>
        </section>
        </div>
      </section>
    </div>
  );
}

function ReportRow({
  label,
  value,
  valueClassName,
  rowClassName,
  labelClassName,
  isLast = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  rowClassName?: string;
  labelClassName?: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 py-3 ${
        isLast ? "" : "border-b border-[#ead6c8]"
      } ${rowClassName || ""}`}
    >
      <p className={`text-sm text-[#6d4f3a] ${labelClassName || ""}`}>{label}</p>
      <p className={`text-sm font-bold text-[#1f140d] ${valueClassName || ""}`}>{value}</p>
    </div>
  );
}

function MetricTile({
  title,
  subtitle,
  danger = false,
}: {
  title: string;
  subtitle: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-[12px] px-3 py-3 text-center ${
        danger ? "bg-[#fdecee]" : "bg-[#f6ede4]"
      }`}
    >
      <p className={`text-[1.15rem] font-bold ${danger ? "text-[#cf4028]" : "text-[#1f140d]"}`}>
        {title}
      </p>
      <p className="text-[11px] text-[#8a6a54]">{subtitle}</p>
    </div>
  );
}
