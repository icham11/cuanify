"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckSquare,
  Clock3,
  LogIn,
  LogOut,
  Package2,
  Search,
  Wallet,
  X,
} from "lucide-react";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { type BakeryOrder, useOrders } from "@/components/bakery/store";
import { useBusiness } from "@/context/BusinessContext";
import { useRole } from "@/context/RoleContext";
import { useBakerySettings } from "@/hooks/useBakerySettings";
import {
  getLateOrders,
  LATE_ORDERS_PAGE_SIZE,
  paginateItems,
} from "@/lib/bakery/dashboard-orders";
import {
  buildCashFlowBreakdownForDate,
  buildCashFlowHistory,
  type CashFlowHistoryEntry,
  toJakartaDateKey,
} from "@/lib/bakery/dashboard-cashflow";
import { BAKERY_STAFF_DAILY_TOKEN_LIMIT } from "@/lib/bookings/config";
import { getStaffTokenLimitForUser } from "@/lib/bakery/token-limits";
import { summarizeProductionTokensByItems } from "@/lib/bookings/operations";
import {
  isClosedOrderStatus,
  isFulfilledOrderStatus,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
import { getJakartaTodayIsoDate } from "@/lib/bookings/shipping-schedule";
import { TEAM_MEMBERS_UPDATED_EVENT } from "@/lib/staff/events";

type TeamMember = {
  userId: number;
  name: string;
  email: string;
  role: "Admin" | "Staff";
  businessId: number;
  businessName: string;
};

type StaffStat = {
  userId: number;
  name: string;
  email: string;
  role: "Admin" | "Staff";
  businessNames: string[];
  todayToken: number;
  activeOrders: number;
  completedToday: number;
  dailyTokenLimit: number;
};

type DashboardAttendanceState = {
  attendanceCount: number;
  expectedAttendanceDays: number;
  lateCount: number;
  systemLateCount: number;
  manualLateCount: number;
  missingDates: string[];
  attendanceWindow?: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    label: string;
    todayKey: string;
    isHolidayToday: boolean;
    hasWindowStarted: boolean;
    hasWindowEnded: boolean;
    canCheckInNow: boolean;
    message: string;
  };
  todayRecord: {
    date: string;
    checkInAt: string;
    checkOutAt: string | null;
  } | null;
};

type SummaryCardKey = "active" | "late" | "due" | "done";

function formatRupiah(value: number) {
  return `Rp${Math.max(0, value).toLocaleString("id-ID")}`;
}

function formatDisplayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function parseNumericId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getOrderStaffTokenAssignments(order: BakeryOrder): Array<{
  staffUserId: number;
  staffName: string;
  token: number;
}> {
  const stageAssignments = (order.productionStages ?? [])
    .filter((stage) => stage.staffId && stage.tokenAmount > 0)
    .map((stage) => ({
      staffUserId: Number(stage.staffId),
      staffName:
        order.assignedStaffName ||
        `${stage.stage.charAt(0).toUpperCase()}${stage.stage.slice(1)} staff`,
      token: Math.max(0, Math.round(Number(stage.tokenAmount) || 0)),
    }));

  if (stageAssignments.length > 0) return stageAssignments;
  if (!order.assignedStaffUserId) return [];

  return [
    {
      staffUserId: order.assignedStaffUserId,
      staffName: order.assignedStaffName || `Staff #${order.assignedStaffUserId}`,
      token: summarizeProductionTokensByItems(order.items ?? []),
    },
  ];
}

function formatUpcomingDeliveryItems(order: BakeryOrder) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) {
    return order.product || "Custom Cake";
  }

  const labels = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const productName = String(item.productName || order.product || "Produk").trim();
    return `${quantity}x ${productName}`;
  });

  if (labels.length <= 2) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2} item lain`;
}

export default function BakeryDashboardPage() {
  const router = useRouter();
  const { orders } = useOrders();
  const { business } = useBusiness();
  const { isAdmin, isStaff } = useRole();
  const { settings: bakerySettings } = useBakerySettings();
  const today = getJakartaTodayIsoDate();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isTeamLoading, setIsTeamLoading] = useState(true);
  const [staffRoleFilter, setStaffRoleFilter] = useState<"all" | "staff" | "admin">("all");
  const [staffSearch, setStaffSearch] = useState("");
  const [isCashInModalOpen, setIsCashInModalOpen] = useState(false);
  const [selectedSummaryCard, setSelectedSummaryCard] =
    useState<SummaryCardKey | null>(null);
  const [cashFlowView, setCashFlowView] = useState<"today" | "history">("today");
  const [selectedCashFlowDate, setSelectedCashFlowDate] = useState(today);
  const [summaryOrdersPage, setSummaryOrdersPage] = useState(1);
  const [attendanceSummary, setAttendanceSummary] =
    useState<DashboardAttendanceState | null>(null);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [isAttendanceSubmitting, setIsAttendanceSubmitting] = useState(false);
  const [attendanceFeedback, setAttendanceFeedback] = useState("");
  const activeCashFlowMonthKey = today.slice(0, 7);

  const staffDailyTokenLimit =
    bakerySettings?.staffDailyTokenLimit ?? BAKERY_STAFF_DAILY_TOKEN_LIMIT;
  const settingsStaffByUserId = useMemo(
    () =>
      new Map(
        (bakerySettings?.staffSettings ?? []).map((entry) => [entry.userId, entry]),
      ),
    [bakerySettings?.staffSettings],
  );

  const loadTeamMembers = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!business?.id) {
        setTeamMembers([]);
        setIsTeamLoading(false);
        return;
      }

      if (!options?.silent) {
        setIsTeamLoading(true);
      }

      try {
        const response = await fetch("/api/staff", { cache: "no-store" });
        if (!response.ok) {
          setTeamMembers([]);
          return;
        }

        const payload = (await response.json().catch(() => ({}))) as {
          data?: {
            members?: Array<{
              userId?: unknown;
              role?: unknown;
              businessId?: unknown;
              businessName?: unknown;
              name?: unknown;
              email?: unknown;
            }>;
          };
        };

        const dedupedMembers = new Map<number, TeamMember>();

        for (const member of payload.data?.members ?? []) {
          const userId = parseNumericId(member.userId);
          const businessId = parseNumericId(member.businessId);
          const role =
            member.role === "Admin" || member.role === "Staff"
              ? member.role
              : null;
          const name = typeof member.name === "string" ? member.name.trim() : "";
          const email =
            typeof member.email === "string" ? member.email.trim() : "";
          const businessName =
            typeof member.businessName === "string"
              ? member.businessName.trim()
              : "";

          if (!userId || !businessId || !role || !name) {
            continue;
          }

          const current = dedupedMembers.get(userId);
          const nextBusinessName = businessName || current?.businessName || "";

          dedupedMembers.set(userId, {
            userId,
            businessId: current?.businessId ?? businessId,
            businessName: nextBusinessName,
            role: current?.role === "Admin" || role === "Admin" ? "Admin" : "Staff",
            name,
            email,
          });
        }

        setTeamMembers(
          Array.from(dedupedMembers.values()).sort((left, right) =>
            left.name.localeCompare(right.name, "id"),
          ),
        );
      } catch {
        setTeamMembers([]);
      } finally {
        setIsTeamLoading(false);
      }
    },
    [business?.id],
  );

  useEffect(() => {
    void loadTeamMembers();
  }, [loadTeamMembers]);

  useEffect(() => {
    const handleRefresh = () => {
      void loadTeamMembers({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadTeamMembers({ silent: true });
      }
    };

    window.addEventListener(TEAM_MEMBERS_UPDATED_EVENT, handleRefresh);
    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(TEAM_MEMBERS_UPDATED_EVENT, handleRefresh);
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadTeamMembers]);

  const activeOrders = useMemo(
    () =>
      orders.filter((order) => !isClosedOrderStatus(order.orderStatus)),
    [orders],
  );

  const completedOrdersThisMonth = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    return orders.filter((order) => {
      if (!order.deliveryDate) return false;
      if (!isFulfilledOrderStatus(order.orderStatus)) return false;

      const date = new Date(`${order.deliveryDate}T00:00:00`);
      return date.getFullYear() === year && date.getMonth() === month;
    });
  }, [orders]);

  const lateOrders = useMemo(
    () => getLateOrders(orders, today),
    [orders, today],
  );

  const todayOrders = useMemo(
    () =>
      orders.filter((order) => {
        return order.deliveryDate === today && !isClosedOrderStatus(order.orderStatus);
      }),
    [orders, today],
  );
  const todayPayments = useMemo(() => {
    return orders.flatMap((order) =>
      (order.paymentTransactions ?? []).filter(
        (transaction) => toJakartaDateKey(transaction.timestamp) === today,
      ),
    );
  }, [orders, today]);

  const cashInToday = useMemo(
    () => todayPayments.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
    [todayPayments],
  );

  const todayPaymentBreakdown = useMemo(() => {
    return buildCashFlowBreakdownForDate(orders, today);
  }, [orders, today]);

  const cashFlowHistoryData = useMemo(() => {
    return buildCashFlowHistory(orders, {
      limit: 31,
      monthKey: activeCashFlowMonthKey,
    });
  }, [activeCashFlowMonthKey, orders]);

  const cashFlowBreakdownByDate = cashFlowHistoryData.breakdownByDate;
  const cashFlowHistory: CashFlowHistoryEntry[] = cashFlowHistoryData.history;

  useEffect(() => {
    if (!isCashInModalOpen) return;
    setCashFlowView("today");
    setSelectedCashFlowDate(today);
  }, [isCashInModalOpen, today]);

  const summaryOrderCollections = useMemo(
    () => ({
      active: activeOrders,
      late: lateOrders,
      due: todayOrders,
      done: completedOrdersThisMonth,
    }),
    [activeOrders, completedOrdersThisMonth, lateOrders, todayOrders],
  );

  const selectedSummaryOrders = useMemo(
    () =>
      selectedSummaryCard
        ? summaryOrderCollections[selectedSummaryCard]
        : [],
    [selectedSummaryCard, summaryOrderCollections],
  );
  const selectedSummaryPagination = useMemo(
    () =>
      paginateItems(
        selectedSummaryOrders,
        summaryOrdersPage,
        LATE_ORDERS_PAGE_SIZE,
      ),
    [selectedSummaryOrders, summaryOrdersPage],
  );
  const paginatedSummaryOrders = selectedSummaryPagination.items;

  useEffect(() => {
    setSummaryOrdersPage(1);
  }, [selectedSummaryCard, selectedSummaryOrders.length]);

  useEffect(() => {
    if (!selectedSummaryCard) return;
    if (selectedSummaryOrders.length === 0) {
      setSelectedSummaryCard(null);
    }
  }, [selectedSummaryCard, selectedSummaryOrders.length]);

  const upcomingDeliveries = useMemo(
    () =>
      orders
        .filter((order) => order.deliveryDate >= today)
        .slice()
        .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))
        .slice(0, 5)
        .map((order) => ({
          orderId: order.id,
          displayId: order.bookingCode || order.resi || `ORD-${order.id}`,
          customer: order.customerName || "Walk-in Customer",
          itemsSummary: formatUpcomingDeliveryItems(order),
          date: order.deliveryDate || "-",
          slot: order.deliverySlot || "-",
          status: normalizeOrderStatus(order.orderStatus),
        })),
    [orders, today],
  );

  const trackedStaff = useMemo(() => {
    const byUserId = new Map<number, TeamMember>();

    for (const member of teamMembers) {
      byUserId.set(member.userId, member);
    }

    for (const order of orders) {
      for (const assignment of getOrderStaffTokenAssignments(order)) {
        if (!byUserId.has(assignment.staffUserId)) {
          const settingsMember = settingsStaffByUserId.get(assignment.staffUserId);
          byUserId.set(assignment.staffUserId, {
            userId: assignment.staffUserId,
            businessId: Number(business?.id || 0),
            businessName: "",
            role: settingsMember?.role === "Admin" ? "Admin" : "Staff",
            name:
              settingsMember?.name ||
              assignment.staffName ||
              `Staff #${assignment.staffUserId}`,
            email: "",
          });
        }
      }
    }

    return Array.from(byUserId.values()).sort((left, right) =>
      left.name.localeCompare(right.name, "id"),
    );
  }, [business?.id, orders, settingsStaffByUserId, teamMembers]);

  const staffStats = useMemo<StaffStat[]>(() => {
    const statMap = new Map<
      number,
      {
        userId: number;
        name: string;
        email: string;
        role: "Admin" | "Staff";
        businessNames: Set<string>;
        todayToken: number;
        activeOrderIds: Set<string>;
        completedOrderIds: Set<string>;
      }
    >();

    for (const member of trackedStaff) {
      statMap.set(member.userId, {
        userId: member.userId,
        name: member.name,
        email: member.email,
        role: member.role,
        businessNames: new Set(member.businessName ? [member.businessName] : []),
        todayToken: 0,
        activeOrderIds: new Set<string>(),
        completedOrderIds: new Set<string>(),
      });
    }

    for (const order of orders) {
      if (toJakartaDateKey(order.productionAssignedAt) !== today) continue;

      const status = normalizeOrderStatus(order.orderStatus);
      for (const assignment of getOrderStaffTokenAssignments(order)) {
        const current = statMap.get(assignment.staffUserId) ?? {
          userId: assignment.staffUserId,
          name: assignment.staffName || `Staff #${assignment.staffUserId}`,
          email: "",
          role: "Staff" as const,
          businessNames: new Set<string>(),
          todayToken: 0,
          activeOrderIds: new Set<string>(),
          completedOrderIds: new Set<string>(),
        };

        if (!isClosedOrderStatus(status)) {
          current.todayToken += assignment.token;
          current.activeOrderIds.add(order.id);
        }

        if (isFulfilledOrderStatus(status)) {
          current.completedOrderIds.add(order.id);
        }

        statMap.set(assignment.staffUserId, current);
      }
    }

    return Array.from(statMap.values())
      .map((entry) => ({
        userId: entry.userId,
        name: entry.name,
        email: entry.email,
        role: entry.role,
        businessNames: Array.from(entry.businessNames).sort((left, right) =>
          left.localeCompare(right, "id"),
        ),
        todayToken: entry.todayToken,
        activeOrders: entry.activeOrderIds.size,
        completedToday: entry.completedOrderIds.size,
        dailyTokenLimit: bakerySettings
          ? getStaffTokenLimitForUser({
              settings: bakerySettings,
              userId: entry.userId,
            })
          : staffDailyTokenLimit,
      }))
      .sort((left, right) => {
        if (right.todayToken !== left.todayToken) {
          return right.todayToken - left.todayToken;
        }
        if (right.activeOrders !== left.activeOrders) {
          return right.activeOrders - left.activeOrders;
        }
        return left.name.localeCompare(right.name, "id");
      });
  }, [bakerySettings, orders, staffDailyTokenLimit, today, trackedStaff]);

  const filteredStaffStats = useMemo(() => {
    const keyword = staffSearch.trim().toLowerCase();

    return staffStats.filter((staff) => {
      const matchesRole =
        staffRoleFilter === "all" ||
        (staffRoleFilter === "staff" && staff.role === "Staff") ||
        (staffRoleFilter === "admin" && staff.role === "Admin");
      const matchesKeyword =
        keyword.length === 0 ||
        staff.name.toLowerCase().includes(keyword) ||
        staff.email.toLowerCase().includes(keyword) ||
        staff.businessNames.some((name) => name.toLowerCase().includes(keyword)) ||
        staff.role.toLowerCase().includes(keyword);

      return matchesRole && matchesKeyword;
    });
  }, [staffRoleFilter, staffSearch, staffStats]);

  const summaryCards: Array<{
    key: SummaryCardKey;
    label: string;
    value: number;
    note: string;
    icon: typeof Package2;
    tone: string;
  }> = [
    {
      key: "active",
      label: "Order Aktif",
      value: activeOrders.length,
      note: "Masih berjalan",
      icon: Package2,
      tone: "bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)]",
    },
    {
      key: "late",
      label: "Terlambat",
      value: lateOrders.length,
      note: "Perlu perhatian",
      icon: AlertTriangle,
      tone: "bg-[#fdeaea] text-[var(--crumbella-danger)]",
    },
    {
      key: "due",
      label: "Due Today",
      value: todayOrders.length,
      note: "Jadwal hari ini",
      icon: CalendarDays,
      tone: "bg-[#e4eef8] text-[var(--crumbella-info)]",
    },
    {
      key: "done",
      label: "Selesai",
      value: completedOrdersThisMonth.length,
      note: "Bulan ini",
      icon: CheckSquare,
      tone: "bg-[#e0f0e8] text-[var(--crumbella-success)]",
    },
  ];

  useEffect(() => {
    if (!isAdmin && !isStaff) return;

    let active = true;

    const loadAttendance = async () => {
      setIsAttendanceLoading(true);
      try {
        const response = await fetch(`/api/bakery/attendance?month=${today.slice(0, 7)}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          data?: DashboardAttendanceState;
        };
        if (!response.ok || !active) return;
        setAttendanceSummary(payload.data ?? null);
      } catch {
        if (active) {
          setAttendanceSummary(null);
        }
      } finally {
        if (active) {
          setIsAttendanceLoading(false);
        }
      }
    };

    void loadAttendance();
    return () => {
      active = false;
    };
  }, [isAdmin, isStaff, today]);

  const submitAttendance = useCallback(async () => {
    const nextAction = attendanceSummary?.todayRecord ? "check-out" : "check-in";
    setIsAttendanceSubmitting(true);
    setAttendanceFeedback("");
    try {
      const response = await fetch("/api/bakery/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextAction }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setAttendanceFeedback(payload.error || "Gagal menyimpan absensi.");
        return;
      }

      const reload = await fetch(`/api/bakery/attendance?month=${today.slice(0, 7)}`, {
        cache: "no-store",
      });
      const payload = (await reload.json().catch(() => ({}))) as {
        data?: DashboardAttendanceState;
      };
      if (!reload.ok) {
        return;
      }
      setAttendanceSummary(payload.data ?? null);
      setAttendanceFeedback(
        nextAction === "check-out"
          ? "Absen pulang berhasil disimpan."
          : "Absen masuk berhasil disimpan.",
      );
    } finally {
      setIsAttendanceSubmitting(false);
    }
  }, [attendanceSummary?.todayRecord, today]);

  const openSummaryOrdersModal = useCallback(
    (cardKey: SummaryCardKey) => {
      if (summaryOrderCollections[cardKey].length === 0) return;
      setSelectedSummaryCard(cardKey);
    },
    [summaryOrderCollections],
  );

  const handleSummaryOrderClick = useCallback(
    (orderId: string) => {
      setSelectedSummaryCard(null);
      router.push(`/bakery/bookings/${orderId}`);
    },
    [router],
  );

  const selectedSummaryMeta = useMemo(() => {
    if (!selectedSummaryCard) return null;

    if (selectedSummaryCard === "active") {
      return {
        title: "Order Aktif",
        countLabel: `${activeOrders.length} order masih berjalan`,
        description: "Klik order untuk buka detail booking aktif.",
        accentTextClass: "text-[var(--crumbella-primary)]",
        accentBadgeClass:
          "bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)]",
        accentBorderClass: "border-[var(--crumbella-border)]",
        itemHoverClass:
          "hover:border-[var(--crumbella-primary)]/35 hover:bg-[#fffdfa] focus-visible:ring-[var(--crumbella-primary)]/35",
      };
    }

    if (selectedSummaryCard === "late") {
      return {
        title: "Order Terlambat",
        countLabel: `${lateOrders.length} order perlu perhatian`,
        description:
          "Klik order untuk buka detail booking dan ubah status menjadi completed.",
        accentTextClass: "text-[#a83030]",
        accentBadgeClass: "bg-[#fff1f1] text-[#a83030]",
        accentBorderClass: "border-[#f2d6d2]",
        itemHoverClass:
          "hover:border-[#e8a0a0] hover:bg-[#fff8f7] focus-visible:ring-[#e8a0a0]",
      };
    }

    if (selectedSummaryCard === "due") {
      return {
        title: "Due Today",
        countLabel: `${todayOrders.length} order untuk hari ini`,
        description: "Klik order untuk buka detail booking yang jatuh tempo hari ini.",
        accentTextClass: "text-[var(--crumbella-info)]",
        accentBadgeClass: "bg-[#eef5ff] text-[var(--crumbella-info)]",
        accentBorderClass: "border-[#d7e5f8]",
        itemHoverClass:
          "hover:border-[#bfd5f3] hover:bg-[#f8fbff] focus-visible:ring-[#bfd5f3]",
      };
    }

    return {
      title: "Order Selesai",
      countLabel: `${completedOrdersThisMonth.length} order selesai bulan ini`,
      description: "Klik order untuk buka detail booking yang sudah selesai.",
      accentTextClass: "text-[var(--crumbella-success)]",
      accentBadgeClass: "bg-[#e0f0e8] text-[var(--crumbella-success)]",
      accentBorderClass: "border-[#d6eadc]",
      itemHoverClass:
        "hover:border-[#b8dec4] hover:bg-[#f7fcf8] focus-visible:ring-[#b8dec4]",
    };
  }, [
    activeOrders.length,
    completedOrdersThisMonth.length,
    lateOrders.length,
    selectedSummaryCard,
    todayOrders.length,
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
      <GradientPageHeader
        title="Dashboard"
        description={new Date().toLocaleDateString("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
        icon={BarChart3}
      />

      <section
        role="button"
        tabIndex={0}
        onClick={() => setIsCashInModalOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsCashInModalOpen(true);
          }
        }}
        className="cursor-pointer rounded-[26px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] px-4 py-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.5)] transition hover:border-[var(--crumbella-accent)] hover:bg-[#fffdfa]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--crumbella-muted)]">
              Uang Masuk Hari Ini
            </p>
            <p className="mt-1 text-[1.7rem] font-extrabold leading-none text-[var(--foreground)] sm:text-[2rem]">
              {formatRupiah(cashInToday)}
            </p>
            <p className="mt-2 text-[11px] text-[var(--crumbella-muted)]">
              Berdasar transaksi payment hari ini - {todayPayments.length} transaksi
            </p>
            <p className="mt-2 text-[10px] font-semibold text-[var(--crumbella-primary)]">
              Tap untuk lihat rincian customer
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)] sm:h-12 sm:w-12">
            <Wallet className="h-5 w-5" />
          </div>
        </div>
      </section>

      {isCashInModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Rincian uang masuk hari ini"
            className="w-full max-w-md rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] shadow-[0_30px_60px_-28px_rgba(30,18,10,0.6)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--crumbella-border)] px-4 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--crumbella-muted)]">
                  Rincian Omzet Hari Ini
                </p>
                <p className="mt-1 text-[1.5rem] font-extrabold leading-none text-[var(--foreground)]">
                  {formatRupiah(cashInToday)}
                </p>
                <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                  {todayPaymentBreakdown.length} customer berkontribusi hari ini
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCashInModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--crumbella-border)] bg-white text-[var(--crumbella-muted)] transition hover:text-[var(--foreground)]"
                aria-label="Tutup rincian uang masuk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[65vh] space-y-2 overflow-y-auto px-4 py-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCashFlowView("today");
                    setSelectedCashFlowDate(today);
                  }}
                  className={`inline-flex h-10 items-center justify-center rounded-full border px-4 text-xs font-semibold transition ${
                    cashFlowView === "today"
                      ? "border-[var(--crumbella-accent)] bg-[var(--crumbella-accent)] text-white"
                      : "border-[var(--crumbella-border)] bg-white text-[var(--foreground)]"
                  }`}
                >
                  Rincian Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCashFlowView("history");
                    setSelectedCashFlowDate(cashFlowHistory[0]?.dateKey ?? today);
                  }}
                  className={`inline-flex h-10 items-center justify-center rounded-full border px-4 text-xs font-semibold transition ${
                    cashFlowView === "history"
                      ? "border-[var(--crumbella-accent)] bg-[var(--crumbella-accent)] text-white"
                      : "border-[var(--crumbella-border)] bg-white text-[var(--foreground)]"
                  }`}
                >
                  Lihat History Cashflow
                </button>
              </div>

              {cashFlowView === "history" ? (
                <>
                  <div className="space-y-2">
                    {cashFlowHistory.length === 0 ? (
                      <div className="rounded-[22px] border border-dashed border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)]/35 px-4 py-6 text-center text-sm text-[var(--crumbella-muted)]">
                        Belum ada history cashflow di bulan ini.
                      </div>
                    ) : (
                      cashFlowHistory.map((entry) => {
                        const isSelected = selectedCashFlowDate === entry.dateKey;
                        const entryBreakdown = cashFlowBreakdownByDate.get(entry.dateKey) ?? [];

                        return (
                          <div key={entry.dateKey} className="space-y-2">
                            <button
                              type="button"
                              onClick={() => setSelectedCashFlowDate(entry.dateKey)}
                              className={`w-full rounded-[22px] border px-4 py-3 text-left shadow-[0_12px_24px_-24px_rgba(30,18,10,0.55)] transition ${
                                isSelected
                                  ? "border-[var(--crumbella-accent)] bg-[#fff7f0]"
                                  : "border-[var(--crumbella-border)] bg-white"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[14px] font-semibold text-[var(--foreground)]">
                                    {formatDisplayDate(entry.dateKey)}
                                  </p>
                                  <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                                    {entry.customerCount} customer - {entry.transactionCount} transaksi
                                  </p>
                                </div>
                                <p className="shrink-0 text-[14px] font-extrabold text-[var(--foreground)]">
                                  {formatRupiah(entry.totalAmount)}
                                </p>
                              </div>
                            </button>

                            {isSelected ? (
                              <>
                                <div className="rounded-[22px] border border-[var(--crumbella-border)] bg-[#fffdfa] px-4 py-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--crumbella-muted)]">
                                        Rincian {formatDisplayDate(entry.dateKey)}
                                      </p>
                                      <p className="mt-1 text-[1.2rem] font-extrabold leading-none text-[var(--foreground)]">
                                        {formatRupiah(entry.totalAmount)}
                                      </p>
                                    </div>
                                    <p className="text-right text-[11px] text-[var(--crumbella-muted)]">
                                      {entry.customerCount} customer
                                    </p>
                                  </div>
                                </div>

                                {entryBreakdown.length === 0 ? (
                                  <div className="rounded-[22px] border border-dashed border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)]/35 px-4 py-6 text-center text-sm text-[var(--crumbella-muted)]">
                                    Belum ada rincian customer di tanggal ini.
                                  </div>
                                ) : (
                                  entryBreakdown.map((breakdownEntry) => (
                                    <div
                                      key={`${entry.dateKey}-${breakdownEntry.customerName}-${breakdownEntry.customerPhone}`}
                                      className="rounded-[22px] border border-[var(--crumbella-border)] bg-white px-4 py-3 shadow-[0_12px_24px_-24px_rgba(30,18,10,0.55)]"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                                            {breakdownEntry.customerName}
                                          </p>
                                          <p className="mt-0.5 text-[11px] text-[var(--crumbella-muted)]">
                                            {breakdownEntry.shortInfo || "Order custom"} - {breakdownEntry.orderCount} order
                                          </p>
                                          <p className="mt-0.5 text-[10px] text-[var(--crumbella-muted)]">
                                            {breakdownEntry.paymentLabel} - {breakdownEntry.bookingCode}
                                          </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                          <p className="text-[10px] text-[var(--crumbella-muted)]">Masuk</p>
                                          <p className="mt-1 text-[15px] font-extrabold leading-none text-[var(--foreground)]">
                                            {formatRupiah(breakdownEntry.amountToday)}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : todayPaymentBreakdown.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)]/35 px-4 py-6 text-center text-sm text-[var(--crumbella-muted)]">
                  Belum ada pembayaran customer yang masuk hari ini.
                </div>
              ) : (
                todayPaymentBreakdown.map((entry) => (
                  <div
                    key={`${entry.customerName}-${entry.customerPhone}`}
                    className="rounded-[22px] border border-[var(--crumbella-border)] bg-white px-4 py-3 shadow-[0_12px_24px_-24px_rgba(30,18,10,0.55)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                          {entry.customerName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--crumbella-muted)]">
                          {entry.shortInfo || "Order custom"} - {entry.orderCount} order
                        </p>
                        <p className="mt-0.5 text-[10px] text-[var(--crumbella-muted)]">
                          {entry.paymentLabel} - {entry.bookingCode}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-[var(--crumbella-muted)]">Masuk hari ini</p>
                        <p className="mt-1 text-[15px] font-extrabold leading-none text-[var(--foreground)]">
                          {formatRupiah(entry.amountToday)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.key}
              role={card.value > 0 ? "button" : undefined}
              tabIndex={card.value > 0 ? 0 : undefined}
              onClick={
                card.value > 0
                  ? () => openSummaryOrdersModal(card.key)
                  : undefined
              }
              onKeyDown={
                card.value > 0
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openSummaryOrdersModal(card.key);
                      }
                    }
                  : undefined
              }
              className={`rounded-[22px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-3.5 shadow-[0_10px_18px_-20px_rgba(30,18,10,0.7)] ${
                card.value > 0
                  ? "cursor-pointer transition hover:border-[var(--crumbella-primary)]/25 hover:bg-[#fffdfa]"
                  : ""
              }`}
            >
              <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-2xl ${card.tone}`}>
                <Icon className="h-4.5 w-4.5" />
              </div>
              <p className="text-[10px] font-medium text-[var(--crumbella-muted)]">{card.label}</p>
              <p className="mt-1 text-[1.45rem] font-extrabold leading-none text-[var(--foreground)] sm:text-[1.75rem]">
                {card.value}
              </p>
              <p className="mt-1 text-[10px] text-[var(--crumbella-muted)]">{card.note}</p>
            </div>
          );
        })}
      </section>

      {isAdmin || isStaff ? (
        <section className="overflow-hidden rounded-[28px] border border-[var(--crumbella-border)] bg-[linear-gradient(135deg,rgba(255,247,239,0.96)_0%,rgba(255,252,249,0.98)_44%,rgba(234,247,250,0.92)_100%)] shadow-[0_18px_34px_-24px_rgba(30,18,10,0.58)]">
          <div className="border-b border-[var(--crumbella-border)]/80 px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--crumbella-muted)]">
                  Absensi Hari Ini
                </p>
                <p className="mt-1 text-[1.45rem] font-extrabold leading-tight text-[var(--foreground)]">
                  {attendanceSummary?.todayRecord?.checkOutAt
                    ? "Shift selesai tercatat"
                    : attendanceSummary?.todayRecord
                      ? "Siap absen pulang"
                      : "Siap absen masuk"}
                </p>
                <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                  {attendanceSummary?.attendanceWindow?.message ||
                    "Absensi harian untuk admin dan staff tercatat otomatis ke owner."}
                </p>
                <div className="mt-2 inline-flex rounded-full border border-[#edd7c7] bg-white/85 px-3 py-1 text-[10px] font-semibold text-[var(--crumbella-primary)]">
                  Window {attendanceSummary?.attendanceWindow?.label || "diatur owner"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void submitAttendance()}
                disabled={
                  isAttendanceLoading ||
                  isAttendanceSubmitting ||
                  Boolean(attendanceSummary?.todayRecord?.checkOutAt) ||
                  (!attendanceSummary?.todayRecord &&
                    attendanceSummary?.attendanceWindow?.enabled === true &&
                    !attendanceSummary.attendanceWindow.canCheckInNow)
                }
                className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-full bg-[var(--crumbella-primary)] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_14px_28px_-18px_rgba(242,106,33,0.9)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {attendanceSummary?.todayRecord ? (
                  <LogOut className="h-4 w-4" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {attendanceSummary?.todayRecord?.checkOutAt
                  ? "Sudah Lengkap"
                  : isAttendanceSubmitting
                    ? "Menyimpan..."
                    : attendanceSummary?.todayRecord
                      ? "Absen Pulang"
                      : "Absen Masuk"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-5">
            <div className="rounded-[22px] border border-white/70 bg-white/88 px-4 py-3 shadow-[0_12px_24px_-24px_rgba(30,18,10,0.7)]">
              <p className="text-[1.35rem] font-extrabold leading-none text-[var(--foreground)]">
                {attendanceSummary
                  ? `${attendanceSummary.attendanceCount}/${attendanceSummary.expectedAttendanceDays}`
                  : "--"}
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--crumbella-muted)]">
                Hadir
              </p>
            </div>
            <div className="rounded-[22px] border border-[#f8d1d1] bg-[#fff4f4] px-4 py-3 shadow-[0_12px_24px_-24px_rgba(168,48,48,0.36)]">
              <p className="text-[1.35rem] font-extrabold leading-none text-[var(--crumbella-danger)]">
                {attendanceSummary?.lateCount ?? 0}x
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--crumbella-muted)]">
                Telat
              </p>
            </div>
            <div className="rounded-[22px] border border-[#d8eadf] bg-[#eef8f1] px-4 py-3 shadow-[0_12px_24px_-24px_rgba(35,114,71,0.35)]">
              <p className="text-[1.1rem] font-extrabold leading-none text-[var(--crumbella-success)]">
                {attendanceSummary?.todayRecord?.checkInAt
                  ? new Intl.DateTimeFormat("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(attendanceSummary.todayRecord.checkInAt))
                  : "--:--"}
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--crumbella-muted)]">
                Check-in
              </p>
            </div>
            <div className="rounded-[22px] border border-[#d8e8f0] bg-[#eef6fb] px-4 py-3 shadow-[0_12px_24px_-24px_rgba(39,103,160,0.35)]">
              <p className="text-[1.1rem] font-extrabold leading-none text-[var(--crumbella-info)]">
                {attendanceSummary?.todayRecord?.checkOutAt
                  ? new Intl.DateTimeFormat("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(attendanceSummary.todayRecord.checkOutAt))
                  : "--:--"}
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--crumbella-muted)]">
                Check-out
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--crumbella-border)]/75 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-[11px] text-[var(--crumbella-muted)]">
                Sistem {attendanceSummary?.systemLateCount ?? 0}x
                {attendanceSummary?.manualLateCount
                  ? ` - Owner ${attendanceSummary.manualLateCount}x`
                  : ""}
              </p>
              {attendanceFeedback ? (
                <p className="mt-1 text-[11px] font-medium text-[var(--crumbella-primary)]">
                  {attendanceFeedback}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => router.push("/bakery/attendance")}
              className="rounded-full border border-[var(--crumbella-border)] bg-white/85 px-4 py-2 text-[11px] font-semibold text-[var(--crumbella-primary)] transition hover:bg-white"
            >
              Buka riwayat absensi
            </button>
          </div>
        </section>
      ) : null}

      {lateOrders.length > 0 ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => openSummaryOrdersModal("late")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openSummaryOrdersModal("late");
            }
          }}
          className="cursor-pointer rounded-[22px] border border-[#e8a0a0] bg-[#fdeaea] px-4 py-3 shadow-[0_12px_24px_-22px_rgba(168,48,48,0.6)] transition hover:bg-[#fff1f1]"
        >
          <p className="flex items-center gap-2 text-[12px] font-semibold text-[#a83030]">
            <Clock3 className="h-4 w-4" />
            {lateOrders.length} order terlambat
          </p>
          <p className="mt-1 text-[10px] text-[#a83030]">
            {lateOrders
              .slice(0, 3)
              .map((order) => `${order.customerName || "Customer"} (${formatDisplayDate(order.deliveryDate)})`)
              .join(" - ")}
          </p>
        </div>
      ) : null}

      {selectedSummaryCard && selectedSummaryMeta ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Daftar ${selectedSummaryMeta.title.toLowerCase()}`}
            className={`w-full max-w-2xl rounded-[28px] border ${selectedSummaryMeta.accentBorderClass} bg-[var(--crumbella-surface)] shadow-[0_30px_60px_-28px_rgba(30,18,10,0.45)]`}
          >
            <div className={`flex items-start justify-between gap-3 border-b ${selectedSummaryMeta.accentBorderClass} px-4 py-4`}>
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${selectedSummaryMeta.accentTextClass}`}>
                  {selectedSummaryMeta.title}
                </p>
                <p className="mt-1 text-[1.5rem] font-extrabold leading-none text-[var(--foreground)]">
                  {selectedSummaryMeta.countLabel}
                </p>
                <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                  {selectedSummaryMeta.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSummaryCard(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--crumbella-border)] bg-white text-[var(--crumbella-muted)] transition hover:text-[var(--foreground)]"
                aria-label={`Tutup daftar ${selectedSummaryMeta.title.toLowerCase()}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[65vh] space-y-3 overflow-y-auto px-4 py-4">
              {paginatedSummaryOrders.map((order) => {
                const normalizedStatus = normalizeOrderStatus(order.orderStatus);

                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => handleSummaryOrderClick(order.id)}
                    className={`w-full rounded-[22px] border ${selectedSummaryMeta.accentBorderClass} bg-white px-4 py-3 text-left shadow-[0_12px_24px_-24px_rgba(30,18,10,0.55)] transition focus-visible:outline-none focus-visible:ring-2 ${selectedSummaryMeta.itemHoverClass}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                          {order.customerName || "Customer"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--crumbella-muted)]">
                          {order.bookingCode || order.resi || order.id}
                        </p>
                        <p className={`mt-1 text-[11px] ${selectedSummaryMeta.accentTextClass}`}>
                          Delivery {formatDisplayDate(order.deliveryDate)} - {order.deliverySlot || "-"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${selectedSummaryMeta.accentBadgeClass}`}>
                          {normalizedStatus}
                        </span>
                        <p className="mt-2 text-[10px] font-semibold text-[var(--crumbella-primary)]">
                          Buka detail
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className={`flex items-center justify-between gap-3 border-t ${selectedSummaryMeta.accentBorderClass} px-4 py-4`}>
              <p className="text-[11px] text-[var(--crumbella-muted)]">
                Halaman {selectedSummaryPagination.currentPage} dari {selectedSummaryPagination.totalPages} - {LATE_ORDERS_PAGE_SIZE} order per halaman
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSummaryOrdersPage((current) => Math.max(1, current - 1))
                  }
                  disabled={selectedSummaryPagination.currentPage <= 1}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--crumbella-border)] bg-white px-4 text-xs font-semibold text-[var(--foreground)] transition disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSummaryOrdersPage((current) =>
                      Math.min(selectedSummaryPagination.totalPages, current + 1),
                    )
                  }
                  disabled={
                    selectedSummaryPagination.currentPage >=
                    selectedSummaryPagination.totalPages
                  }
                  className={`inline-flex h-10 items-center justify-center rounded-full border px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${selectedSummaryMeta.accentBorderClass} ${selectedSummaryMeta.accentBadgeClass}`}
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="space-y-2">
        <div className="px-1 pt-1">
          <p className="text-[1.35rem] font-extrabold leading-tight text-[var(--foreground)] sm:text-[1.55rem]">
            Kapasitas Staff
          </p>
          <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
            Tampilkan semua admin dan staff yang terdaftar di owner ini untuk assignment tugas
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] px-3 py-2.5 shadow-[0_10px_20px_-24px_rgba(30,18,10,0.6)]">
            <Search className="h-4 w-4 shrink-0 text-[var(--crumbella-muted)]" />
            <input
              value={staffSearch}
              onChange={(event) => setStaffSearch(event.target.value)}
              placeholder="Cari nama staff atau admin..."
              className="w-full bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--crumbella-muted)]"
            />
          </label>

          <div className="grid grid-cols-3 gap-2 sm:w-auto">
            {[
              { key: "all", label: "Semua" },
              { key: "staff", label: "Staff" },
              { key: "admin", label: "Admin" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() =>
                  setStaffRoleFilter(option.key as "all" | "staff" | "admin")
                }
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  staffRoleFilter === option.key
                    ? "bg-[var(--crumbella-primary)] text-white"
                    : "border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] text-[var(--foreground)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 xl:grid-cols-2">
          {filteredStaffStats.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] px-4 py-5 text-sm text-[var(--crumbella-muted)]">
              {isTeamLoading
                ? "Memuat data staff..."
                : staffStats.length === 0
                  ? "Belum ada admin/staff yang terdaftar pada owner ini atau belum ada assignment hari ini."
                  : "Tidak ada hasil yang cocok dengan filter pencarian."}
            </div>
          ) : (
            filteredStaffStats.map((staff) => {
              const remainingToken = Math.max(0, staff.dailyTokenLimit - staff.todayToken);
              const usagePercent =
                staff.dailyTokenLimit > 0
                  ? Math.min(100, Math.round((staff.todayToken / staff.dailyTokenLimit) * 100))
                  : 0;
              const usageTone =
                usagePercent >= 80
                  ? "text-[var(--crumbella-danger)]"
                  : usagePercent >= 55
                    ? "text-[var(--crumbella-primary)]"
                    : "text-[var(--crumbella-success)]";
              const roleLabel = staff.role === "Admin" ? "Admin" : "Staff";
              const businessLabel = staff.businessNames.join(", ");

              return (
                <div
                  key={staff.userId}
                  className="rounded-[26px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] shadow-[0_16px_28px_-24px_rgba(30,18,10,0.56)]"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--crumbella-border)] px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--crumbella-accent-soft)] text-sm font-bold text-[var(--crumbella-primary)]">
                        {staff.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[var(--foreground)]">
                          {staff.name}
                        </p>
                        <p className="truncate text-[10px] text-[var(--crumbella-muted)]">
                          {[
                            roleLabel,
                            staff.email,
                            businessLabel,
                            `target ${staff.dailyTokenLimit} token/hari`,
                          ]
                            .filter((value) => Boolean(value))
                            .join(" - ")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[var(--crumbella-muted)]">Selesai</p>
                      <p className="text-[1.1rem] font-bold leading-none text-[var(--foreground)]">
                        {staff.completedToday}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 px-4 py-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] text-[var(--crumbella-muted)]">Token hari ini</p>
                        <p className="text-[1.6rem] font-extrabold leading-none text-[var(--foreground)] sm:text-[1.8rem]">
                          {staff.todayToken}{" "}
                          <span className="text-sm font-medium text-[var(--crumbella-muted)]">
                            / {staff.dailyTokenLimit}
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-[var(--crumbella-muted)]">Sisa</p>
                        <p className="text-[1.4rem] font-extrabold leading-none text-[var(--crumbella-success)]">
                          {remainingToken}
                        </p>
                      </div>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-[var(--crumbella-border)]">
                      <div
                        className="h-full rounded-full bg-[var(--crumbella-accent)] transition-[width] duration-300"
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[10px]">
                      <span className={usageTone}>{usagePercent}% terpakai</span>
                      <span className="text-[var(--crumbella-muted)]">
                        {staff.activeOrders > 0
                          ? `${staff.activeOrders} order berjalan`
                          : "Belum ada tugas"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[1.35rem] font-extrabold leading-tight text-[var(--foreground)] sm:text-[1.5rem]">
            Upcoming Deliveries
          </h2>
          <button
            type="button"
            onClick={() => router.push("/bakery/bookings")}
            className="text-[10px] font-semibold text-[var(--crumbella-primary)]"
          >
            Lihat semua
          </button>
        </div>

        <div className="grid gap-2 xl:grid-cols-2">
          {upcomingDeliveries.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)]/35 px-4 py-6 text-center text-sm text-[var(--crumbella-muted)]">
              Belum ada delivery.
            </div>
          ) : (
            upcomingDeliveries.map((delivery) => (
              <button
                key={delivery.orderId}
                type="button"
                onClick={() => router.push(`/bakery/bookings/${delivery.orderId}`)}
                className="rounded-[24px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] px-4 py-3 text-left shadow-[0_14px_26px_-24px_rgba(30,18,10,0.65)] transition hover:border-[var(--crumbella-primary)]/35 hover:bg-[var(--crumbella-accent-soft)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--crumbella-primary)]/35"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[var(--foreground)]">
                      {delivery.customer}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--crumbella-muted)]">
                      {delivery.itemsSummary}
                    </p>
                    <p className="text-[10px] text-[var(--crumbella-muted)]">{delivery.displayId}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12px] font-semibold text-[var(--foreground)]">
                      {formatDisplayDate(delivery.date)}
                    </p>
                    <p className="text-[10px] text-[var(--crumbella-muted)]">{delivery.slot}</p>
                  </div>
                </div>
                <div className="mt-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      delivery.status === "In Production"
                        ? "bg-[#fbf0d8] text-[#9a6b10]"
                        : delivery.status === "Ready" || delivery.status === "Delivery"
                          ? "bg-[#e0f0e8] text-[#2a5c3f]"
                          : "bg-[#fdeaea] text-[#a83030]"
                    }`}
                  >
                    {delivery.status}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
