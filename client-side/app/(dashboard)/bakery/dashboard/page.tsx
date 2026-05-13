"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckSquare,
  Clock3,
  Package2,
  Search,
  Wallet,
  X,
} from "lucide-react";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { type BakeryOrder, useOrders } from "@/components/bakery/store";
import { useBusiness } from "@/context/BusinessContext";
import { useBakerySettings } from "@/hooks/useBakerySettings";
import { BAKERY_STAFF_DAILY_TOKEN_LIMIT } from "@/lib/bookings/config";
import { getStaffTokenLimitForUser } from "@/lib/bakery/token-limits";
import { summarizeProductionTokensByItems } from "@/lib/bookings/operations";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
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

function toJakartaDateKey(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
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

export default function BakeryDashboardPage() {
  const router = useRouter();
  const { orders } = useOrders();
  const { business } = useBusiness();
  const { settings: bakerySettings } = useBakerySettings();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isTeamLoading, setIsTeamLoading] = useState(true);
  const [staffRoleFilter, setStaffRoleFilter] = useState<"all" | "staff" | "admin">("all");
  const [staffSearch, setStaffSearch] = useState("");
  const [isCashInModalOpen, setIsCashInModalOpen] = useState(false);

  const today = getJakartaTodayIsoDate();
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
      orders.filter((order) => {
        const status = normalizeOrderStatus(order.orderStatus);
        return !["Completed", "Delivered", "Cancelled"].includes(status);
      }),
    [orders],
  );

  const completedThisMonth = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    return orders.filter((order) => {
      if (!order.deliveryDate) return false;
      const status = normalizeOrderStatus(order.orderStatus);
      if (!["Completed", "Delivered", "Delivery"].includes(status)) return false;

      const date = new Date(`${order.deliveryDate}T00:00:00`);
      return date.getFullYear() === year && date.getMonth() === month;
    }).length;
  }, [orders]);

  const lateOrders = useMemo(
    () =>
      orders.filter((order) => {
        const status = normalizeOrderStatus(order.orderStatus);
        return order.deliveryDate < today && !["Completed", "Delivered", "Cancelled"].includes(status);
      }),
    [orders, today],
  );

  const todayOrders = useMemo(
    () =>
      orders.filter((order) => {
        const status = normalizeOrderStatus(order.orderStatus);
        return order.deliveryDate === today && !["Completed", "Delivered", "Cancelled"].includes(status);
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
    const grouped = new Map<
      string,
      {
        customerName: string;
        customerPhone: string;
        amountToday: number;
        orderIds: Set<string>;
        bookingCodes: Set<string>;
        productLabels: string[];
        paymentTypes: Set<string>;
      }
    >();

    for (const order of orders) {
      const todaysTransactions = (order.paymentTransactions ?? []).filter(
        (transaction) => toJakartaDateKey(transaction.timestamp) === today,
      );

      if (todaysTransactions.length === 0) continue;

      const customerName = (order.customerName || "").trim() || "Customer";
      const customerPhone = (order.customerPhone || "").trim();
      const key = `${customerName.toLowerCase()}||${customerPhone.toLowerCase()}`;
      const existing = grouped.get(key) ?? {
        customerName,
        customerPhone,
        amountToday: 0,
        orderIds: new Set<string>(),
        bookingCodes: new Set<string>(),
        productLabels: [],
        paymentTypes: new Set<string>(),
      };

      for (const transaction of todaysTransactions) {
        existing.amountToday += Math.max(0, Number(transaction.amount || 0));
        existing.paymentTypes.add(transaction.type || "Payment");
      }

      existing.orderIds.add(order.id);
      if (order.bookingCode) {
        existing.bookingCodes.add(order.bookingCode);
      }

      const productLabel =
        order.items?.[0]?.productName?.trim() ||
        order.product?.trim() ||
        "Order custom";
      if (
        productLabel &&
        !existing.productLabels.some(
          (label) => label.toLowerCase() === productLabel.toLowerCase(),
        )
      ) {
        existing.productLabels.push(productLabel);
      }

      grouped.set(key, existing);
    }

    return Array.from(grouped.values())
      .map((entry) => ({
        customerName: entry.customerName,
        customerPhone: entry.customerPhone,
        amountToday: entry.amountToday,
        orderCount: entry.orderIds.size,
        paymentLabel:
          entry.paymentTypes.size > 1
            ? "DP + pelunasan"
            : entry.paymentTypes.has("Final")
              ? "Pelunasan"
              : "DP",
        shortInfo: entry.productLabels.slice(0, 2).join(" - "),
        bookingCode:
          entry.bookingCodes.size === 1
            ? Array.from(entry.bookingCodes)[0] || ""
            : `${entry.bookingCodes.size} booking`,
      }))
      .sort((left, right) => right.amountToday - left.amountToday);
  }, [orders, today]);

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
          product: order.product || "Custom Cake",
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

        if (!["Completed", "Delivered", "Cancelled"].includes(status)) {
          current.todayToken += assignment.token;
          current.activeOrderIds.add(order.id);
        }

        if (["Completed", "Delivered"].includes(status)) {
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

  const summaryCards = [
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
      value: completedThisMonth,
      note: "Bulan ini",
      icon: CheckSquare,
      tone: "bg-[#e0f0e8] text-[var(--crumbella-success)]",
    },
  ];

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
              {todayPaymentBreakdown.length === 0 ? (
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
              role={card.key === "late" ? "button" : undefined}
              tabIndex={card.key === "late" ? 0 : undefined}
              onClick={
                card.key === "late"
                  ? () => router.push("/bakery/bookings")
                  : undefined
              }
              onKeyDown={
                card.key === "late"
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push("/bakery/bookings");
                      }
                    }
                  : undefined
              }
              className={`rounded-[22px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-3.5 shadow-[0_10px_18px_-20px_rgba(30,18,10,0.7)] ${
                card.key === "late"
                  ? "cursor-pointer transition hover:border-[#e8a0a0] hover:bg-[#fff6f6]"
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

      {lateOrders.length > 0 ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => router.push("/bakery/bookings")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              router.push("/bakery/bookings");
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
                    <p className="mt-0.5 text-[10px] text-[var(--crumbella-muted)]">{delivery.product}</p>
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
