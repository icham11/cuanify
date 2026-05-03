"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import StatusDropdown from "@/components/bakery/production/StatusDropdown";
import { useOrders, type BakeryOrder } from "@/components/bakery/store";
import { useBusiness } from "@/context/BusinessContext";
import { useRole } from "@/context/RoleContext";
import { summarizeProductionTokensByItems } from "@/lib/bookings/operations";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import { BAKERY_STAFF_DAILY_TOKEN_LIMIT } from "@/lib/bookings/config";
import { DEFAULT_MAX_TOKEN } from "@/lib/calendar/getCalendarStatus";
import { useBakerySettings } from "@/hooks/useBakerySettings";
import { distributeProductionTokens } from "@/lib/bookings/production-stages";
import { getStaffTokenLimitForUser } from "@/lib/bakery/token-limits";

interface TeamMember {
  userId: number;
  name: string;
  role: "Cashier" | "Staff";
  businessId: number;
}

interface ViewerIdentity {
  userId: number;
  businessId: number;
  role: "Owner" | "Admin" | "Cashier" | "Staff";
  name: string;
  businessName: string;
}

interface StaffTokenReset {
  staffUserId: number;
  monthKey: string;
  baselineToken: number;
  resetAt: string;
}

const MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

const STAFF_DAILY_TOKEN_LIMIT_FALLBACK = BAKERY_STAFF_DAILY_TOKEN_LIMIT;

function isStaffDailyTokenAssignmentBlocked(params: {
  currentToken: number;
  incomingToken: number;
  limit: number;
}): boolean {
  const { currentToken, incomingToken, limit } = params;
  if (limit <= 0) return false;
  if (incomingToken <= 0) return false;

  const projectedToken = currentToken + incomingToken;
  if (projectedToken <= limit) return false;

  // Keep big-ticket orders claimable as first assignment of the day.
  return currentToken > 0;
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
      staffName:
        order.assignedStaffName || `Staff #${order.assignedStaffUserId}`,
      token: summarizeProductionTokensByItems(order.items ?? []),
    },
  ];
}

function getSingleOrderAssignee(order: BakeryOrder): number | null {
  const claimedStaffIds = getOrderClaimedStaffIds(order);
  return claimedStaffIds.length === 1 ? claimedStaffIds[0] : null;
}

function getEffectiveProductionStages(order: BakeryOrder) {
  const existingStages = order.productionStages ?? [];
  if (existingStages.length > 0) return existingStages;

  return distributeProductionTokens({
    totalTokens: summarizeProductionTokensByItems(order.items ?? []),
  });
}

function getOrderClaimedStaffIds(order: BakeryOrder): number[] {
  const stageIds = getEffectiveProductionStages(order)
    .map((stage) => parseNumericId(stage.staffId))
    .filter((staffId): staffId is number => Boolean(staffId));

  if (stageIds.length > 0) {
    return [...new Set(stageIds)];
  }

  return order.assignedStaffUserId ? [order.assignedStaffUserId] : [];
}

function isOrderFullyUnassigned(order: BakeryOrder): boolean {
  return getOrderClaimedStaffIds(order).length === 0;
}

function monthKeyOf(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseNumericId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatGroupDate(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "Tanpa tanggal";
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function getInitials(name: string): string {
  const normalized = name.trim();
  if (!normalized) return "ST";
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function inferDifficultyLabel(order: BakeryOrder): string | null {
  const raw =
    order.items?.find((item) => item.tokenDifficulty)?.tokenDifficulty || null;
  if (!raw) return null;

  const normalized = raw.toUpperCase();
  if (normalized === "DIFFICULT") return "Hard";
  if (normalized === "NORMAL" || normalized === "MEDIUM") return "Normal";
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusBadgeClass(status: string): string {
  const normalized = normalizeOrderStatus(status);
  if (normalized === "In Production") {
    return "bg-[#fbf0d8] text-[#9a6b10]";
  }
  if (normalized === "Ready") {
    return "bg-[#e0f0e8] text-[#2a5c3f]";
  }
  if (normalized === "Delivery" || normalized === "Completed") {
    return "bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)]";
  }
  return "bg-[#fdeaea] text-[#a83030]";
}

export default function ProductionTable() {
  const router = useRouter();
  const { business, businesses, switchBusiness } = useBusiness();
  const {
    orders,
    updateOrderStatus,
    assignOrderToStaff,
    assignProductionStageStaff,
  } = useOrders();
  const { isOwner, isAdmin, isStaff, role, userName } = useRole();
  const isPrivilegedManager = isOwner || isAdmin;
  const { settings: bakerySettings } = useBakerySettings();
  const productionDailyTokenLimit =
    bakerySettings?.dailyProductionTokenLimit ?? DEFAULT_MAX_TOKEN;
  const staffDailyTokenLimit =
    bakerySettings?.staffDailyTokenLimit ?? STAFF_DAILY_TOKEN_LIMIT_FALLBACK;
  const staffTokenLimitByUserId = useMemo(
    () =>
      new Map(
        (bakerySettings?.staffSettings ?? []).map((entry) => [
          entry.userId,
          getStaffTokenLimitForUser({
            settings: bakerySettings ?? {
              dailyProductionTokenLimit: DEFAULT_MAX_TOKEN,
              staffDailyTokenLimit: STAFF_DAILY_TOKEN_LIMIT_FALLBACK,
              cutoffHour: 10,
              defaultDpPercentage: 50,
              notifyProductionWhatsapp: true,
              blockedDates: [],
              holidayEntries: [],
              staffSettings: [],
              monthlyExpenses: [],
            },
            userId: entry.userId,
          }),
        ]),
      ),
    [bakerySettings],
  );

  const [activeTab, setActiveTab] = useState<"active" | "ready">("active");
  const [viewer, setViewer] = useState<ViewerIdentity | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [resetMap, setResetMap] = useState<Record<number, StaffTokenReset>>({});
  const [resettingUserId, setResettingUserId] = useState<number | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [quickFilter, setQuickFilter] = useState<
    "all" | "mine" | "unassigned" | "heavy"
  >("all");
  const [staffViewTab, setStaffViewTab] = useState<
    "available" | "mine" | "completed"
  >("available");
  const [isListTransitioning, setIsListTransitioning] = useState(false);
  const [selectedDatePopupKey, setSelectedDatePopupKey] = useState<
    string | null
  >(null);
  const [transferOrderId, setTransferOrderId] = useState<string | null>(null);
  const [transferStaffUserId, setTransferStaffUserId] = useState<string>("");
  const [switchingBusinessId, setSwitchingBusinessId] = useState<string>("");

  const fallbackMonthKey = useMemo(() => monthKeyOf(new Date()), []);
  const selectedMonthKey = useMemo(() => {
    if (filterMonth === "all" || filterYear === "all") return fallbackMonthKey;
    return `${filterYear}-${filterMonth}`;
  }, [filterMonth, filterYear, fallbackMonthKey]);

  const normalizedQuery = useMemo(() => query.trim().toLowerCase(), [query]);
  const todayDateKey = useMemo(() => toLocalDateKey(new Date()), []);

  useEffect(() => {
    setIsListTransitioning(true);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setIsListTransitioning(false);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [
    activeTab,
    filterMonth,
    filterYear,
    filterDate,
    quickFilter,
    staffViewTab,
    normalizedQuery,
  ]);

  const matchesDateFilter = useCallback(
    (deliveryDate: string | undefined): boolean => {
      const date = (deliveryDate ?? "").trim();
      if (!date) return false;

      if (filterDate) {
        return date === filterDate;
      }

      const [year = "", month = ""] = date.split("-");
      const matchMonth = filterMonth === "all" || month === filterMonth;
      const matchYear = filterYear === "all" || year === filterYear;
      return matchMonth && matchYear;
    },
    [filterDate, filterMonth, filterYear],
  );

  useEffect(() => {
    let active = true;

    const loadMeta = async () => {
      setLoadingMeta(true);
      try {
        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        if (!meRes.ok) return;

        const mePayload = (await meRes.json()) as {
          data?: {
            userId?: unknown;
            businessId?: unknown;
            businessName?: unknown;
            role?: unknown;
            name?: unknown;
          };
        };

        const parsedUserId = parseNumericId(mePayload.data?.userId);
        const parsedBusinessId = parseNumericId(mePayload.data?.businessId);
        const parsedRole =
          mePayload.data?.role === "Owner" ||
          mePayload.data?.role === "Admin" ||
          mePayload.data?.role === "Cashier" ||
          mePayload.data?.role === "Staff"
            ? mePayload.data.role
            : null;

        if (!active || !parsedUserId || !parsedBusinessId || !parsedRole) {
          return;
        }

        setViewer({
          userId: parsedUserId,
          businessId: parsedBusinessId,
          role: parsedRole,
          name:
            typeof mePayload.data?.name === "string"
              ? mePayload.data.name
              : "User",
          businessName:
            typeof mePayload.data?.businessName === "string"
              ? mePayload.data.businessName
              : "",
        });

        if (parsedRole === "Owner" || parsedRole === "Admin") {
          const staffRes = await fetch("/api/staff", { cache: "no-store" });
          if (staffRes.ok) {
            const staffPayload = (await staffRes.json()) as {
              data?: {
                members?: Array<{
                  userId?: unknown;
                  role?: unknown;
                  businessId?: unknown;
                  name?: unknown;
                }>;
              };
            };

            const allStaffMembers = (staffPayload.data?.members ?? [])
              .map((member) => {
                const memberUserId = parseNumericId(member.userId);
                const memberBusinessId = parseNumericId(member.businessId);
                const memberRole =
                  member.role === "Cashier" || member.role === "Staff"
                    ? member.role
                    : null;
                const memberName =
                  typeof member.name === "string" ? member.name.trim() : "";

                if (
                  !memberUserId ||
                  !memberBusinessId ||
                  !memberRole ||
                  !memberName
                ) {
                  return null;
                }

                return {
                  userId: memberUserId,
                  businessId: memberBusinessId,
                  role: memberRole,
                  name: memberName,
                };
              })
              .filter((member): member is TeamMember => Boolean(member))
              .filter((member) => member.role === "Staff");

            const currentBusinessStaff = allStaffMembers.filter(
              (member) => member.businessId === parsedBusinessId,
            );

            const membersToShow =
              currentBusinessStaff.length > 0
                ? currentBusinessStaff
                : allStaffMembers;

            if (active) {
              setTeamMembers(membersToShow);
            }
          }
        }

        const resetRes = await fetch(
          `/api/bakery/production/staff-tokens?month=${selectedMonthKey}`,
          { cache: "no-store" },
        );

        if (resetRes.ok && active) {
          const resetPayload = (await resetRes.json()) as {
            data?: Array<{
              staffUserId?: unknown;
              monthKey?: unknown;
              baselineToken?: unknown;
              resetAt?: unknown;
            }>;
          };

          const nextMap: Record<number, StaffTokenReset> = {};
          for (const row of resetPayload.data ?? []) {
            const staffUserId = parseNumericId(row.staffUserId);
            if (!staffUserId) continue;
            nextMap[staffUserId] = {
              staffUserId,
              monthKey:
                typeof row.monthKey === "string"
                  ? row.monthKey
                  : selectedMonthKey,
              baselineToken: Math.max(0, Number(row.baselineToken ?? 0)),
              resetAt:
                typeof row.resetAt === "string"
                  ? row.resetAt
                  : new Date().toISOString(),
            };
          }
          setResetMap(nextMap);
        }
      } catch {
        // Ignore metadata fetch failure. Main table can still render from local store.
      } finally {
        if (active) {
          setLoadingMeta(false);
        }
      }
    };

    void loadMeta();
    return () => {
      active = false;
    };
  }, [selectedMonthKey]);

  const activeOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const normalizedStatus = normalizeOrderStatus(order.orderStatus);
        return (
          normalizedStatus === "Inquiry" || normalizedStatus === "In Production"
        );
      })
      .slice()
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  }, [orders]);

  const readyOrders = useMemo(() => {
    return orders
      .filter((order) =>
        ["Ready", "Delivery", "Completed"].includes(
          normalizeOrderStatus(order.orderStatus),
        ),
      )
      .slice()
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  }, [orders]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>([String(new Date().getFullYear())]);
    for (const order of orders) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(order.deliveryDate)) {
        years.add(order.deliveryDate.slice(0, 4));
      }
    }
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [orders]);

  const trackedStaff = useMemo(() => {
    const byUserId = new Map<number, TeamMember>();

    if (isPrivilegedManager) {
      for (const member of teamMembers) {
        byUserId.set(member.userId, member);
      }
    }

    for (const order of orders) {
      for (const assignment of getOrderStaffTokenAssignments(order)) {
        if (!byUserId.has(assignment.staffUserId)) {
          const fallbackName =
            teamMembers.find(
              (member) => member.userId === assignment.staffUserId,
            )?.name ||
            assignment.staffName ||
            `Staff #${assignment.staffUserId}`;

          byUserId.set(assignment.staffUserId, {
            userId: assignment.staffUserId,
            name: fallbackName,
            role: "Staff",
            businessId: viewer?.businessId ?? 0,
          });
        }
      }
    }

    if (!isPrivilegedManager && isStaff && viewer?.userId) {
      byUserId.set(viewer.userId, {
        userId: viewer.userId,
        name: viewer.name || userName || "Staff",
        role: "Staff",
        businessId: viewer.businessId,
      });
    }

    return Array.from(byUserId.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [isPrivilegedManager, isStaff, orders, teamMembers, viewer, userName]);

  const staffDailyIndicatorDateKey = filterDate || "";
  const usesExplicitDailyDate = staffDailyIndicatorDateKey.length > 0;

  const staffDailyTokenByDate = useMemo(() => {
    const usage = new Map<string, number>();

    for (const order of orders) {
      const deliveryDate = (order.deliveryDate || "").trim();
      if (!deliveryDate) continue;

      const status = normalizeOrderStatus(order.orderStatus);
      if (["Delivery", "Completed", "Cancelled"].includes(status)) {
        continue;
      }

      for (const assignment of getOrderStaffTokenAssignments(order)) {
        const key = `${assignment.staffUserId}:${deliveryDate}`;
        usage.set(key, (usage.get(key) ?? 0) + assignment.token);
      }
    }

    return usage;
  }, [orders]);

  const staffStats = useMemo(() => {
    const statsMap = new Map<
      number,
      {
        userId: number;
        name: string;
        assignedActive: number;
        doneRaw: number;
        inProgress: number;
      }
    >();

    for (const staff of trackedStaff) {
      statsMap.set(staff.userId, {
        userId: staff.userId,
        name: staff.name,
        assignedActive: 0,
        doneRaw: 0,
        inProgress: 0,
      });
    }

    const applyMonthlyBaseline = filterMonth !== "all" && filterYear !== "all";

    for (const order of orders) {
      if (!matchesDateFilter(order.deliveryDate)) continue;

      const status = normalizeOrderStatus(order.orderStatus);
      for (const assignment of getOrderStaffTokenAssignments(order)) {
        const current = statsMap.get(assignment.staffUserId) ?? {
          userId: assignment.staffUserId,
          name: assignment.staffName || `Staff #${assignment.staffUserId}`,
          assignedActive: 0,
          doneRaw: 0,
          inProgress: 0,
        };

        if (!["Delivery", "Completed", "Cancelled"].includes(status)) {
          current.assignedActive += assignment.token;
        }

        if (["Ready", "Delivery", "Completed"].includes(status)) {
          current.doneRaw += assignment.token;
        } else if (status === "In Production") {
          current.inProgress += assignment.token;
        }

        statsMap.set(assignment.staffUserId, current);
      }
    }

    return Array.from(statsMap.values())
      .map((entry) => {
        const baseline = applyMonthlyBaseline
          ? (resetMap[entry.userId]?.baselineToken ?? 0)
          : 0;
        const dailyToken = usesExplicitDailyDate
          ? (staffDailyTokenByDate.get(
              `${entry.userId}:${staffDailyIndicatorDateKey}`,
            ) ?? 0)
          : entry.assignedActive;
        const limit =
          staffTokenLimitByUserId.get(entry.userId) ?? staffDailyTokenLimit;
        return {
          ...entry,
          baseline,
          doneVisible: Math.max(0, entry.doneRaw - baseline),
          dailyToken,
          limit,
          dailyTokenPercentage:
            dailyToken <= 0
              ? 0
              : Math.round((dailyToken / Math.max(1, limit)) * 100),
        };
      })
      .sort((a, b) => b.assignedActive - a.assignedActive);
  }, [
    orders,
    resetMap,
    staffDailyTokenByDate,
    staffDailyIndicatorDateKey,
    trackedStaff,
    filterMonth,
    filterYear,
    usesExplicitDailyDate,
    matchesDateFilter,
    staffDailyTokenLimit,
    staffTokenLimitByUserId,
  ]);

  const currentViewerStaffStat = useMemo(() => {
    if (!isStaff || !viewer?.userId) return null;
    return (
      staffStats.find((staff) => staff.userId === viewer.userId) ?? {
        userId: viewer.userId,
        name: viewer.name || userName || "Staff",
        assignedActive: 0,
        doneRaw: 0,
        doneVisible: 0,
        inProgress: 0,
        baseline: 0,
        dailyToken: 0,
        limit:
          staffTokenLimitByUserId.get(viewer.userId) ?? staffDailyTokenLimit,
        dailyTokenPercentage: 0,
      }
    );
  }, [
    isStaff,
    viewer?.userId,
    viewer?.name,
    staffStats,
    userName,
    staffTokenLimitByUserId,
    staffDailyTokenLimit,
  ]);

  const currentViewerTodayToken = useMemo(() => {
    if (!viewer?.userId) return 0;
    return staffDailyTokenByDate.get(`${viewer.userId}:${todayDateKey}`) ?? 0;
  }, [staffDailyTokenByDate, todayDateKey, viewer?.userId]);

  const currentViewerRemainingTodayToken = useMemo(
    () =>
      Math.max(
        0,
        (viewer?.userId
          ? (staffTokenLimitByUserId.get(viewer.userId) ?? staffDailyTokenLimit)
          : staffDailyTokenLimit) - currentViewerTodayToken,
      ),
    [
      currentViewerTodayToken,
      staffDailyTokenLimit,
      staffTokenLimitByUserId,
      viewer?.userId,
    ],
  );

  const currentViewerTodayTokenPct = useMemo(() => {
    const effectiveLimit = viewer?.userId
      ? (staffTokenLimitByUserId.get(viewer.userId) ?? staffDailyTokenLimit)
      : staffDailyTokenLimit;
    if (effectiveLimit <= 0) return 0;
    return Math.max(
      0,
      Math.round((currentViewerTodayToken / effectiveLimit) * 100),
    );
  }, [
    currentViewerTodayToken,
    staffDailyTokenLimit,
    staffTokenLimitByUserId,
    viewer?.userId,
  ]);

  const staffAvailableOrders = useMemo(() => {
    if (!isStaff) return [] as typeof activeOrders;
    return activeOrders.filter((order) =>
      getEffectiveProductionStages(order).some(
        (stage) => parseNumericId(stage.staffId) === null,
      ),
    );
  }, [activeOrders, isStaff]);

  const staffAssignedOrders = useMemo(() => {
    if (!isStaff || !viewer?.userId) return [] as typeof activeOrders;
    return activeOrders.filter((order) =>
      getOrderClaimedStaffIds(order).includes(viewer.userId),
    );
  }, [activeOrders, isStaff, viewer?.userId]);

  const staffCompletedOrders = useMemo(() => {
    if (!isStaff || !viewer?.userId) return [] as typeof readyOrders;
    return readyOrders.filter((order) =>
      getOrderClaimedStaffIds(order).includes(viewer.userId),
    );
  }, [isStaff, readyOrders, viewer?.userId]);

  const visibleOrders = useMemo(() => {
    if (isStaff) {
      const source =
        staffViewTab === "available"
          ? staffAvailableOrders
          : staffViewTab === "mine"
            ? staffAssignedOrders
            : staffCompletedOrders;

      return source.filter((order) => {
        if (normalizedQuery) {
          const customer = (order.customerName || "").toLowerCase();
          const product = (order.product || "").toLowerCase();
          const fallbackItemName =
            order.items?.[0]?.productName?.toLowerCase() ||
            order.items?.[0]?.subcategory?.toLowerCase() ||
            "";
          const searchable = `${customer} ${product} ${fallbackItemName} ${order.id.toLowerCase()}`;
          if (!searchable.includes(normalizedQuery)) return false;
        }

        return true;
      });
    }

    const source = activeTab === "active" ? activeOrders : readyOrders;
    return source.filter((order) => {
      if (!matchesDateFilter(order.deliveryDate)) return false;

      if (normalizedQuery) {
        const customer = (order.customerName || "").toLowerCase();
        const product = (order.product || "").toLowerCase();
        const fallbackItemName =
          order.items?.[0]?.productName?.toLowerCase() ||
          order.items?.[0]?.subcategory?.toLowerCase() ||
          "";
        const searchable = `${customer} ${product} ${fallbackItemName} ${order.id.toLowerCase()}`;
        if (!searchable.includes(normalizedQuery)) return false;
      }

      if (quickFilter === "mine") {
        if (
          !viewer?.userId ||
          !getOrderClaimedStaffIds(order).includes(viewer.userId)
        ) {
          return false;
        }
      }

      if (quickFilter === "unassigned") {
        if (!isOrderFullyUnassigned(order)) return false;
      }

      if (quickFilter === "heavy") {
        const token = summarizeProductionTokensByItems(order.items ?? []);
        if (token < 15) return false;
      }

      return true;
    });
  }, [
    activeTab,
    activeOrders,
    readyOrders,
    isStaff,
    matchesDateFilter,
    normalizedQuery,
    quickFilter,
    staffAssignedOrders,
    staffAvailableOrders,
    staffCompletedOrders,
    staffViewTab,
    viewer,
  ]);

  const queueSummary = useMemo(() => {
    let totalToken = 0;
    let unassigned = 0;
    let dueToday = 0;

    for (const order of visibleOrders) {
      totalToken += summarizeProductionTokensByItems(order.items ?? []);
      if (isOrderFullyUnassigned(order)) unassigned += 1;
      if ((order.deliveryDate || "").trim() === todayDateKey) {
        dueToday += 1;
      }
    }

    return {
      orderCount: visibleOrders.length,
      totalToken,
      unassigned,
      dueToday,
    };
  }, [todayDateKey, visibleOrders]);

  const groupedOrders = useMemo(() => {
    const groups = new Map<string, typeof visibleOrders>();

    for (const order of visibleOrders) {
      const key = order.deliveryDate?.trim() || "Tanpa tanggal";
      const current = groups.get(key) ?? [];
      current.push(order);
      groups.set(key, current);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (a === "Tanpa tanggal") return 1;
        if (b === "Tanpa tanggal") return -1;
        return a.localeCompare(b);
      })
      .map(([dateKey, groupItems]) => ({
        dateKey,
        label: formatGroupDate(dateKey),
        items: groupItems,
        totalToken: groupItems.reduce(
          (sum, item) =>
            sum + summarizeProductionTokensByItems(item.items ?? []),
          0,
        ),
      }));
  }, [visibleOrders]);

  const productionScopedOrders = useMemo(
    () => [...activeOrders, ...readyOrders],
    [activeOrders, readyOrders],
  );

  const selectedDateOrders = useMemo(() => {
    if (!selectedDatePopupKey) return [];
    return productionScopedOrders
      .filter(
        (order) =>
          (order.deliveryDate?.trim() || "Tanpa tanggal") ===
          selectedDatePopupKey,
      )
      .slice()
      .sort((a, b) =>
        (a.deliverySlot || "").localeCompare(b.deliverySlot || ""),
      );
  }, [selectedDatePopupKey, productionScopedOrders]);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDatePopupKey) return "";
    return formatGroupDate(selectedDatePopupKey);
  }, [selectedDatePopupKey]);

  const selectedDateCapacity = useMemo(() => {
    if (!selectedDatePopupKey || selectedDatePopupKey === "Tanpa tanggal") {
      return null;
    }

    const usedToken = selectedDateOrders.reduce(
      (sum, order) => sum + summarizeProductionTokensByItems(order.items ?? []),
      0,
    );
    const maxToken = productionDailyTokenLimit;
    const remainingToken = Math.max(0, maxToken - usedToken);
    const status =
      usedToken >= maxToken
        ? "FULL"
        : usedToken >= maxToken * 0.8
          ? "WARNING"
          : "AVAILABLE";

    return {
      usedToken,
      maxToken,
      remainingToken,
      status,
    };
  }, [productionDailyTokenLimit, selectedDatePopupKey, selectedDateOrders]);

  const selectedDateStatusMessage = useMemo(() => {
    if (!selectedDateCapacity) return "";
    if (selectedDateCapacity.status === "FULL") {
      return "Kapasitas penuh";
    }
    if (selectedDateCapacity.status === "WARNING") {
      return "Kapasitas hampir penuh";
    }
    return "Kapasitas masih tersedia";
  }, [selectedDateCapacity]);

  const transferOrder = useMemo(() => {
    if (!transferOrderId) return null;
    return orders.find((order) => order.id === transferOrderId) ?? null;
  }, [orders, transferOrderId]);

  const transferCandidates = useMemo(() => {
    if (!transferOrder) return [] as TeamMember[];
    if (isOrderFullyUnassigned(transferOrder)) return teamMembers;
    const singleAssignee = getSingleOrderAssignee(transferOrder);
    if (!singleAssignee) return [] as TeamMember[];
    return teamMembers.filter((member) => member.userId !== singleAssignee);
  }, [teamMembers, transferOrder]);

  useEffect(() => {
    if (!transferOrderId) return;
    if (transferCandidates.length === 0) {
      setTransferStaffUserId("");
      return;
    }

    const selectedExists = transferCandidates.some(
      (member) => String(member.userId) === transferStaffUserId,
    );
    if (!selectedExists) {
      setTransferStaffUserId(String(transferCandidates[0].userId));
    }
  }, [transferCandidates, transferOrderId, transferStaffUserId]);

  const updateStatus = (id: string, status: string) => {
    updateOrderStatus(
      id,
      status as
        | "In Production"
        | "Ready"
        | "Delivery"
        | "Completed"
        | "Cancelled",
    );
  };

  const getStatusOptions = (status: string, canCancel: boolean) => {
    const withCancellation = (options: string[]) =>
      canCancel ? [...options, "Cancelled"] : options;

    if (status === "In Production") {
      return withCancellation(["In Production", "Ready", "Delivery"]);
    }
    if (status === "Ready") {
      return withCancellation(["Ready", "Delivery"]);
    }
    if (status === "Delivery") {
      return withCancellation(["Delivery", "Completed"]);
    }
    return withCancellation([
      "In Production",
      "Ready",
      "Delivery",
      "Completed",
    ]);
  };

  const handleClaimStage = (
    orderId: string,
    stage: "listing" | "filling" | "finishing",
  ) => {
    if (!viewer?.userId) return;
    assignProductionStageStaff(orderId, stage, {
      userId: viewer.userId,
      name: viewer.name || userName || "Staff",
    });
  };

  const handleOpenTransferModal = (orderId: string) => {
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) return;
    const singleAssignee = getSingleOrderAssignee(order);

    const candidate = singleAssignee
      ? teamMembers.find((member) => member.userId !== singleAssignee)
      : teamMembers[0];

    setTransferOrderId(orderId);
    setTransferStaffUserId(candidate ? String(candidate.userId) : "");
  };

  const handleTransferOrder = () => {
    if (!transferOrderId) return;
    const targetStaffId = Number(transferStaffUserId);
    if (!Number.isInteger(targetStaffId) || targetStaffId <= 0) return;

    const member = teamMembers.find((entry) => entry.userId === targetStaffId);
    if (!member) return;

    assignOrderToStaff(transferOrderId, {
      userId: member.userId,
      name: member.name,
    });

    setTransferOrderId(null);
    setTransferStaffUserId("");
  };

  const handleSwitchBusiness = async (nextBusinessId: string) => {
    const normalized = String(nextBusinessId || "").trim();
    if (!normalized) return;
    if (!isPrivilegedManager) return;
    if (String(viewer?.businessId ?? "") === normalized) return;

    setSwitchingBusinessId(normalized);
    try {
      await switchBusiness(normalized);
      router.refresh();
      window.location.reload();
    } finally {
      setSwitchingBusinessId("");
    }
  };

  const handleResetStaffMonth = async (
    staffUserId: number,
    doneRaw: number,
  ) => {
    setResettingUserId(staffUserId);
    try {
      const response = await fetch("/api/bakery/production/staff-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          staffUserId,
          monthKey: selectedMonthKey,
          baselineToken: doneRaw,
        }),
      });

      if (!response.ok) return;
      setResetMap((prev) => ({
        ...prev,
        [staffUserId]: {
          staffUserId,
          monthKey: selectedMonthKey,
          baselineToken: doneRaw,
          resetAt: new Date().toISOString(),
        },
      }));
    } finally {
      setResettingUserId(null);
    }
  };

  const resetFilters = () => {
    setFilterMonth("all");
    setFilterYear("all");
    setFilterDate("");
    setQuery("");
    setQuickFilter("all");
  };

  const transferOrderToken = useMemo(() => {
    if (!transferOrder) return 0;
    if (isOrderFullyUnassigned(transferOrder)) {
      return summarizeProductionTokensByItems(transferOrder.items ?? []);
    }
    const singleAssignee = getSingleOrderAssignee(transferOrder);
    if (!singleAssignee) return 0;

    return getOrderStaffTokenAssignments(transferOrder)
      .filter((assignment) => assignment.staffUserId === singleAssignee)
      .reduce((sum, assignment) => sum + assignment.token, 0);
  }, [transferOrder]);
  const transferOrderDateKey = (transferOrder?.deliveryDate || "").trim();
  const selectedTransferTargetId = Number(transferStaffUserId);
  const selectedTransferBaselineToken =
    transferOrderDateKey && Number.isInteger(selectedTransferTargetId)
      ? (staffDailyTokenByDate.get(
          `${selectedTransferTargetId}:${transferOrderDateKey}`,
        ) ?? 0)
      : 0;
  const selectedTransferProjectedToken =
    selectedTransferBaselineToken + transferOrderToken;
  const selectedTransferLimit = Number.isInteger(selectedTransferTargetId)
    ? (staffTokenLimitByUserId.get(selectedTransferTargetId) ??
      staffDailyTokenLimit)
    : staffDailyTokenLimit;
  const selectedTransferOverLimit =
    transferCandidates.length > 0 &&
    isStaffDailyTokenAssignmentBlocked({
      currentToken: selectedTransferBaselineToken,
      incomingToken: transferOrderToken,
      limit: selectedTransferLimit,
    });

  const renderOrderRow = (order: (typeof orders)[number]) => {
    const normalizedOrderStatus = normalizeOrderStatus(order.orderStatus);
    const orderToken = summarizeProductionTokensByItems(order.items ?? []);
    const effectiveStages = getEffectiveProductionStages(order);
    const difficultyLabel = inferDifficultyLabel(order);
    const orderQty = (order.items ?? []).reduce(
      (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
      0,
    );
    const productName =
      order.product ||
      order.items?.[0]?.productName ||
      order.items?.[0]?.subcategory ||
      "Produk";
    const orderDateKey = (order.deliveryDate || "").trim();
    const claimedStaffIds = getOrderClaimedStaffIds(order);
    const isUnassigned = claimedStaffIds.length === 0;
    const singleAssignee = getSingleOrderAssignee(order);
    const hasMixedStageAssignees = claimedStaffIds.length > 1;
    const isStaffViewer = isStaff || viewer?.role === "Staff";
    const viewerUserId = viewer?.userId ?? null;
    const assignedToMe =
      viewerUserId !== null && claimedStaffIds.includes(viewerUserId);
    const isOverdue =
      Boolean(orderDateKey) &&
      orderDateKey < todayDateKey &&
      !["Delivery", "Completed", "Cancelled"].includes(normalizedOrderStatus);
    const progressCount = effectiveStages.filter((stage) =>
      parseNumericId(stage.staffId),
    ).length;

    const canOwnerAssignOrTransfer = isPrivilegedManager;
    const ownerActionCandidates = canOwnerAssignOrTransfer
      ? teamMembers.filter((member) => member.userId !== singleAssignee)
      : [];

    let statusDisabledMessage = "";
    if (claimedStaffIds.length === 0) {
      statusDisabledMessage =
        "Ambil order terlebih dahulu sebelum mengubah status";
    } else if (isStaffViewer && !assignedToMe) {
      statusDisabledMessage =
        "Hanya staff yang ditugaskan dapat mengubah status";
    }
    const isStatusDisabled = Boolean(statusDisabledMessage);

    return (
      <div
        key={order.id}
        role="button"
        onClick={() => {
          setSelectedDatePopupKey(
            order.deliveryDate?.trim() || "Tanpa tanggal",
          );
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSelectedDatePopupKey(
              order.deliveryDate?.trim() || "Tanpa tanggal",
            );
          }
        }}
        className="group cursor-pointer rounded-[28px] border border-[var(--crumbella-border)] bg-white p-4 shadow-[0_18px_28px_-26px_rgba(45,24,12,0.7)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_34px_-24px_rgba(45,24,12,0.72)]"
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[1.02rem] font-semibold leading-tight text-[var(--foreground)]">
                  {order.customerName || "Walk-in Customer"}
                </p>
                {isStaff && difficultyLabel ? (
                  <span className="inline-flex rounded-full border border-[#f2d9b5] bg-[#fff4e6] px-2 py-0.5 text-[10px] font-semibold text-[var(--crumbella-primary)]">
                    {difficultyLabel}
                  </span>
                ) : (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(
                      normalizedOrderStatus,
                    )}`}
                  >
                    {normalizedOrderStatus}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                {order.id} • Qty {orderQty || 0} • {orderToken} token
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--crumbella-muted)]">
                Delivery
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                {order.deliveryDate ? formatGroupDate(order.deliveryDate) : "-"}
              </p>
              {isOverdue ? (
                <p className="mt-1 text-[11px] font-semibold text-[#bb3f27]">
                  Terlambat
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-sm leading-relaxed text-[var(--foreground)]">
              {productName}
            </p>
            <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
              {order.deliverySlot || "No slot"}
            </p>
          </div>

          <div className="space-y-2">
            {(["listing", "filling", "finishing"] as const).map((stage) => {
              const stageData = effectiveStages.find((s) => s.stage === stage);
              const isClaimed = !!stageData?.staffId;
              const stageToken = Math.max(
                0,
                Math.round(Number(stageData?.tokenAmount ?? 0)),
              );

              let assignedName = "Kosong";
              if (isClaimed) {
                const member = teamMembers.find(
                  (teamMember) => teamMember.userId === stageData.staffId,
                );
                assignedName = member?.name || "Staff";
                if (stageData.staffId === viewer?.userId) {
                  assignedName = isStaff
                    ? `${viewer?.name || userName || "Staff"}`
                    : viewer?.name || userName || "Staff";
                }
              }

              const stageLabel =
                stage === "listing"
                  ? "Lining"
                  : stage === "filling"
                    ? "Filling"
                    : "Finishing";
              const tokenPercent = stage === "finishing" ? "50%" : "25%";
              const canStaffClaimStage =
                isStaffViewer && !isClaimed && Boolean(viewer?.userId);
              const currentStaffDailyToken =
                viewer?.userId && orderDateKey
                  ? (staffDailyTokenByDate.get(
                      `${viewer.userId}:${orderDateKey}`,
                    ) ?? 0)
                  : 0;
              const projectedStaffDailyToken =
                currentStaffDailyToken + stageToken;
              const currentStaffLimit = viewer?.userId
                ? (staffTokenLimitByUserId.get(viewer.userId) ??
                  staffDailyTokenLimit)
                : staffDailyTokenLimit;
              const exceedsStaffDailyLimit =
                canStaffClaimStage &&
                isStaffDailyTokenAssignmentBlocked({
                  currentToken: currentStaffDailyToken,
                  incomingToken: stageToken,
                  limit: currentStaffLimit,
                });
              const claimDisabled = exceedsStaffDailyLimit;
              const viewerUserId = viewer?.userId ?? null;
              const isAssignedToViewer =
                viewerUserId !== null && stageData?.staffId === viewerUserId;
              const stageTone = isAssignedToViewer
                ? "border-[#9ed5bb] bg-[#dff3ea] text-[#21583f]"
                : isClaimed
                  ? "border-[#c9e4d7] bg-[#eef8f3] text-[#21583f]"
                  : "border-[#e5d5c4] bg-[#fbf5ef] text-[#8a6047]";

              return (
                <div
                  key={stage}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-[18px] border px-3 py-2.5 ${stageTone}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-current/80" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-current">
                        {stageLabel}{" "}
                        <span className="font-medium opacity-70">
                          {tokenPercent}
                        </span>
                      </p>
                      <p className="truncate text-[11px] text-current/80">
                        {assignedName}
                      </p>
                    </div>
                  </div>

                  {isClaimed ? (
                    <span className="text-xs font-semibold text-current">
                      {stageToken} tok
                    </span>
                  ) : canStaffClaimStage ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleClaimStage(order.id, stage);
                      }}
                      disabled={claimDisabled}
                      className="rounded-full bg-[var(--crumbella-primary)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[var(--crumbella-primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        exceedsStaffDailyLimit
                          ? `Token harian ${projectedStaffDailyToken}/${currentStaffLimit}`
                          : undefined
                      }
                    >
                      Assign
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-current/80">
                      {stageToken} tok
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--crumbella-border)] pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${statusBadgeClass(
                  normalizedOrderStatus,
                )}`}
              >
                {normalizedOrderStatus}
              </span>
              {canOwnerAssignOrTransfer && !hasMixedStageAssignees ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenTransferModal(order.id);
                  }}
                  disabled={ownerActionCandidates.length === 0}
                  className="rounded-full border border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--crumbella-primary)] transition hover:bg-[#f6dcc8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUnassigned ? "Assign" : "Transfer"}
                </button>
              ) : null}
            </div>

            <p className="text-[11px] font-medium text-[var(--crumbella-muted)]">
              {progressCount}/{effectiveStages.length} proses
            </p>
          </div>

          {!isStaff || assignedToMe ? (
            <div
              className="w-full max-w-[11rem]"
              onClick={(event) => event.stopPropagation()}
            >
              <StatusDropdown
                value={normalizedOrderStatus}
                onChange={(value) => updateStatus(order.id, value)}
                options={getStatusOptions(
                  normalizedOrderStatus,
                  isPrivilegedManager,
                )}
                disabled={isStatusDisabled}
              />
            </div>
          ) : null}
          {statusDisabledMessage && (
            <p className="text-[11px] text-[var(--crumbella-muted)]">
              {statusDisabledMessage}
            </p>
          )}
          {hasMixedStageAssignees && canOwnerAssignOrTransfer ? (
            <p className="text-[11px] text-[var(--crumbella-muted)]">
              Order ini sudah dibagi ke beberapa staff. Ubah assignment per
              stage dari detail order.
            </p>
          ) : null}
        </div>
      </div>
    );
  };

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
        Belum ada booking yang masuk ke produksi.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isPrivilegedManager ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs font-medium text-slate-600">
            Business aktif:{" "}
            <span className="font-semibold text-slate-900">
              {viewer?.businessName || business?.name || "-"}
            </span>
          </p>

          {businesses.length > 1 ? (
            <div className="inline-flex items-center gap-2">
              <label
                htmlFor="production-business-switcher"
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                Switch Business
              </label>
              <select
                id="production-business-switcher"
                value={String(viewer?.businessId ?? business?.id ?? "")}
                onChange={(event) => {
                  void handleSwitchBusiness(event.target.value);
                }}
                disabled={Boolean(switchingBusinessId)}
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {businesses.map((entry) => (
                  <option key={String(entry.id)} value={String(entry.id)}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {isStaff ? (
        <div className="space-y-4 rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.45)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--crumbella-primary)]">
                <Sparkles className="h-3.5 w-3.5" />
                Assign Staff
              </p>
              <h3 className="mt-2 truncate text-[1.45rem] font-extrabold leading-none text-[var(--foreground)]">
                {viewer?.name ||
                  currentViewerStaffStat?.name ||
                  userName ||
                  "Staff"}
              </h3>
              <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                Pilih proses yang akan di-assign dari queue aktif.
              </p>
            </div>

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--crumbella-border)] bg-white text-sm font-semibold text-[var(--crumbella-primary)]">
              {getInitials(
                viewer?.name ||
                  currentViewerStaffStat?.name ||
                  userName ||
                  "Staff",
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-[var(--crumbella-border)] bg-white p-4 shadow-[0_10px_18px_-20px_rgba(30,18,10,0.7)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-[var(--crumbella-muted)]">
                  Kapasitas hari ini
                </p>
                <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                  Sisa {currentViewerRemainingTodayToken} token. Tap Assign
                  untuk menambah tugas.
                </p>
              </div>
              <p className="text-lg font-extrabold text-[var(--foreground)]">
                {currentViewerTodayToken} /{" "}
                {currentViewerStaffStat?.limit ?? staffDailyTokenLimit} token
              </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eadfd3]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  currentViewerTodayTokenPct >= 100
                    ? "bg-[#cf5d33]"
                    : currentViewerTodayTokenPct >= 70
                      ? "bg-[#d27b31]"
                      : "bg-[#7ca693]"
                }`}
                style={{
                  width: `${Math.min(100, Math.max(6, currentViewerTodayTokenPct || 0))}%`,
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.45)] md:sticky md:top-2 md:z-10 md:bg-[var(--crumbella-surface)]/95 md:backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--crumbella-primary)]">
                <Sparkles className="h-3.5 w-3.5" />
                Owner View
              </p>
              <h3 className="mt-1 text-[1.5rem] font-extrabold leading-none text-[var(--foreground)]">
                {activeTab === "active" ? "Produksi" : "Ready & Delivery"}
              </h3>
              <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                {activeTab === "active"
                  ? "Queue aktif dan assignment staff"
                  : "Order siap kirim dan selesai"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-[20px] border border-[var(--crumbella-border)] bg-white px-3 py-3 shadow-[0_10px_18px_-20px_rgba(30,18,10,0.7)]">
                <p className="text-[10px] font-medium text-[var(--crumbella-muted)]">
                  Total Token
                </p>
                <p className="mt-1 text-[1.7rem] font-extrabold leading-none text-[var(--foreground)]">
                  {queueSummary.totalToken}
                </p>
                <p className="mt-1 text-[10px] text-[var(--crumbella-muted)]">
                  Semua order aktif
                </p>
              </div>
              <div className="rounded-[20px] border border-[var(--crumbella-border)] bg-white px-3 py-3 shadow-[0_10px_18px_-20px_rgba(30,18,10,0.7)]">
                <p className="text-[10px] font-medium text-[var(--crumbella-muted)]">
                  Belum Assign
                </p>
                <p className="mt-1 text-[1.7rem] font-extrabold leading-none text-[#a83030]">
                  {queueSummary.unassigned}
                </p>
                <p className="mt-1 text-[10px] text-[var(--crumbella-muted)]">
                  Proses kosong
                </p>
              </div>
              <div className="rounded-[20px] border border-[var(--crumbella-border)] bg-white px-3 py-3 shadow-[0_10px_18px_-20px_rgba(30,18,10,0.7)]">
                <p className="text-[10px] font-medium text-[var(--crumbella-muted)]">
                  Due Today
                </p>
                <p className="mt-1 text-[1.7rem] font-extrabold leading-none text-[var(--foreground)]">
                  {queueSummary.dueToday}
                </p>
                <p className="mt-1 text-[10px] text-[var(--crumbella-muted)]">
                  Jatuh tempo
                </p>
              </div>
              <div className="rounded-[20px] border border-[var(--crumbella-border)] bg-white px-3 py-3 shadow-[0_10px_18px_-20px_rgba(30,18,10,0.7)]">
                <p className="text-[10px] font-medium text-[var(--crumbella-muted)]">
                  Queue Aktif
                </p>
                <p className="mt-1 text-[1.7rem] font-extrabold leading-none text-[var(--crumbella-success)]">
                  {queueSummary.orderCount}
                </p>
                <p className="mt-1 text-[10px] text-[var(--crumbella-muted)]">
                  Terlihat pada filter
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_140px_120px_170px_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari customer, produk, atau ID order"
                className="h-11 w-full rounded-[16px] border border-[var(--crumbella-border)] bg-white pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--crumbella-muted)] focus:border-[var(--crumbella-border)] focus:ring-2 focus:ring-[var(--crumbella-focus)]/20"
              />
            </label>

            <select
              value={filterMonth}
              onChange={(event) => setFilterMonth(event.target.value)}
              className="h-10 rounded-[14px] border border-[var(--crumbella-border)] bg-white px-2.5 text-xs font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--crumbella-border)] focus:ring-2 focus:ring-[var(--crumbella-focus)]/20"
            >
              <option value="all">All Months</option>
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>

            <select
              value={filterYear}
              onChange={(event) => setFilterYear(event.target.value)}
              className="h-10 rounded-[14px] border border-[var(--crumbella-border)] bg-white px-2.5 text-xs font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--crumbella-border)] focus:ring-2 focus:ring-[var(--crumbella-focus)]/20"
            >
              <option value="all">All Years</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={filterDate}
              onChange={(event) => setFilterDate(event.target.value)}
              className="h-10 rounded-[14px] border border-[var(--crumbella-border)] bg-white px-2.5 text-xs font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--crumbella-border)] focus:ring-2 focus:ring-[var(--crumbella-focus)]/20"
            />

            <button
              type="button"
              onClick={resetFilters}
              className="h-10 rounded-[14px] border border-[var(--crumbella-border)] bg-[var(--background)] px-3 text-xs font-semibold text-[var(--crumbella-primary)] transition hover:bg-[var(--crumbella-accent-soft)]"
            >
              Reset Filter
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setQuickFilter("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                quickFilter === "all"
                  ? "bg-[var(--crumbella-accent)] text-white"
                  : "border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)]"
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setQuickFilter("mine")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                quickFilter === "mine"
                  ? "bg-[var(--crumbella-accent)] text-white"
                  : "border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)]"
              }`}
            >
              Tugas Saya
            </button>
            <button
              type="button"
              onClick={() => setQuickFilter("unassigned")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                quickFilter === "unassigned"
                  ? "bg-[var(--crumbella-accent)] text-white"
                  : "border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)]"
              }`}
            >
              Belum Assigned
            </button>
            <button
              type="button"
              onClick={() => setQuickFilter("heavy")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                quickFilter === "heavy"
                  ? "bg-[var(--crumbella-accent)] text-white"
                  : "border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)]"
              }`}
            >
              Heavy (15+ token)
            </button>

            {loadingMeta ? (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Syncing...
              </span>
            ) : null}
          </div>
        </div>
      )}

      {isPrivilegedManager ? (
        <div className="rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_18px_30px_-24px_rgba(30,18,10,0.45)]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="text-[1.02rem] font-semibold text-[var(--foreground)]">
                Assign per Staff
              </h4>
              <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                Pantau beban token staff dari filter produksi aktif.
              </p>
            </div>
            <span className="rounded-full border border-[var(--crumbella-border)] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--crumbella-muted)]">
              {staffStats.length} staff
            </span>
          </div>

          <div className="space-y-3">
            {staffStats.length === 0 ? (
              <p className="rounded-[20px] border border-dashed border-[var(--crumbella-border)] bg-white px-4 py-5 text-sm text-[var(--crumbella-muted)]">
                Belum ada data token staff.
              </p>
            ) : (
              staffStats.map((staff) => {
                const totalWork = staff.doneVisible + staff.inProgress;
                const completionPct =
                  totalWork <= 0
                    ? 0
                    : Math.round((staff.doneVisible / totalWork) * 100);
                const normalizedDailyLimit = Math.max(1, staff.limit);
                const usedDailyToken = Math.max(0, staff.dailyToken);
                const remainingDailyToken = Math.max(
                  0,
                  normalizedDailyLimit - usedDailyToken,
                );
                const overDailyToken = Math.max(
                  0,
                  usedDailyToken - normalizedDailyLimit,
                );
                const dailyPct = Math.max(
                  0,
                  Math.round((usedDailyToken / normalizedDailyLimit) * 100),
                );
                const progressBarClass =
                  overDailyToken > 0 || dailyPct >= 100
                    ? "bg-[#cf5d33]"
                    : dailyPct >= 70
                      ? "bg-[#d27b31]"
                      : "bg-[#7ca693]";
                const dailyStatusText =
                  overDailyToken > 0
                    ? `Over ${overDailyToken} token`
                    : dailyPct >= 100
                      ? "Limit tercapai"
                      : `Sisa ${remainingDailyToken} token`;

                return (
                  <div
                    key={staff.userId}
                    className="rounded-[24px] border border-[var(--crumbella-border)] bg-white p-4 shadow-[0_16px_28px_-26px_rgba(45,24,12,0.7)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--crumbella-accent-soft)] text-sm font-semibold text-[var(--crumbella-primary)]">
                          {getInitials(staff.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                            {staff.name}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                            Token aktif {staff.assignedActive} • In progress{" "}
                            {staff.inProgress}
                          </p>
                        </div>
                      </div>

                      {isPrivilegedManager && (
                        <button
                          type="button"
                          onClick={() =>
                            handleResetStaffMonth(staff.userId, staff.doneRaw)
                          }
                          disabled={resettingUserId === staff.userId}
                          className="shrink-0 rounded-full border border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--crumbella-primary)] transition hover:bg-[#f6dcc8] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {resettingUserId === staff.userId
                            ? "Reset..."
                            : "Reset token"}
                        </button>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-[11px] text-[var(--crumbella-muted)]">
                      <div>
                        <p className="uppercase tracking-[0.14em]">
                          Token hari ini
                        </p>
                        <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                          {usedDailyToken} / {normalizedDailyLimit}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="uppercase tracking-[0.14em]">Sisa</p>
                        <p className="mt-1 text-lg font-semibold text-[#1f6a43]">
                          {remainingDailyToken}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eadfd3]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${progressBarClass}`}
                        style={{
                          width: `${Math.min(100, Math.max(6, dailyPct || 0))}%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[var(--crumbella-muted)]">
                      <span>{Math.min(999, dailyPct)}% terpakai</span>
                      <span className="text-right">{dailyStatusText}</span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-[18px] bg-[#fbf5ef] px-3 py-2 text-[11px] text-[var(--crumbella-muted)]">
                      <div>
                        <p className="uppercase tracking-[0.14em]">Selesai</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                          {staff.doneVisible} token
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="uppercase tracking-[0.14em]">Progress</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                          {completionPct}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {isStaff && currentViewerStaffStat ? (
        <div className="rounded-[22px] border border-[var(--crumbella-border)] bg-white px-4 py-3 text-[11px] text-[var(--crumbella-muted)] shadow-[0_10px_18px_-20px_rgba(30,18,10,0.7)]">
          Token aktif {currentViewerStaffStat.assignedActive} • In progress{" "}
          {currentViewerStaffStat.inProgress} • Selesai{" "}
          {currentViewerStaffStat.doneVisible}
        </div>
      ) : null}

      {isStaff ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStaffViewTab("available")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                staffViewTab === "available"
                  ? "bg-[var(--crumbella-accent)] text-white shadow-sm"
                  : "border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)]"
              }`}
            >
              Belum Assigned ({staffAvailableOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setStaffViewTab("mine")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                staffViewTab === "mine"
                  ? "bg-[var(--crumbella-accent)] text-white shadow-sm"
                  : "border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)]"
              }`}
            >
              Assignment ({staffAssignedOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setStaffViewTab("completed")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                staffViewTab === "completed"
                  ? "bg-[var(--crumbella-accent)] text-white shadow-sm"
                  : "border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)]"
              }`}
            >
              Completed ({staffCompletedOrders.length})
            </button>
          </div>

          <div>
            <h4 className="text-[1.2rem] font-semibold text-[var(--foreground)]">
              {staffViewTab === "available"
                ? "Order tersedia untuk di-assign"
                : staffViewTab === "mine"
                  ? "Assignment saya"
                  : "Riwayat proses selesai"}
            </h4>
            <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
              {staffViewTab === "available"
                ? "Tap Assign untuk langsung mengambil proses dan token masuk ke kapasitas harian."
                : staffViewTab === "mine"
                  ? "Pantau order yang sedang kamu pegang dan lanjutkan status saat proses selesai."
                  : "Order yang pernah kamu pegang dan sudah masuk tahap akhir."}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              activeTab === "active"
                ? "bg-[var(--crumbella-accent)] text-white shadow-sm"
                : "border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)]"
            }`}
          >
            Queue Aktif ({activeOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ready")}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              activeTab === "ready"
                ? "bg-[var(--crumbella-accent)] text-white shadow-sm"
                : "border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)]"
            }`}
          >
            Ready / Delivery ({readyOrders.length})
          </button>
        </div>
      )}

      <div
        className={`transition-all duration-300 ease-out ${
          isListTransitioning
            ? "translate-y-1 opacity-70"
            : "translate-y-0 opacity-100"
        }`}
      >
        {groupedOrders.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-[var(--crumbella-border)] bg-white px-4 py-5 text-center text-sm text-[var(--crumbella-muted)]">
            Tidak ada order pada filter yang dipilih.
          </div>
        ) : (
          <div className="space-y-4">
            {groupedOrders.map((group) => (
              <div
                key={group.dateKey}
                className="rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-3 shadow-[0_18px_28px_-24px_rgba(45,24,12,0.48)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--crumbella-border)] px-2 pb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {group.label}
                  </h3>
                  <span className="rounded-full border border-[var(--crumbella-border)] bg-white px-3 py-1 text-[11px] font-medium text-[var(--crumbella-muted)]">
                    {group.items.length} order • {group.totalToken} token
                  </span>
                </div>
                <div className="space-y-3 px-1 pt-3">
                  {group.items.map((order) => renderOrderRow(order))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isStaff ? (
        <div className="rounded-[22px] border border-[#f0c96a] bg-[#fff6dc] px-4 py-3 text-[11px] text-[#7a5a21]">
          Tap Assign untuk langsung assign proses ke akunmu. Token proses itu
          otomatis masuk ke kapasitas harian hari delivery order.
        </div>
      ) : null}

      {role === "Cashier" && (
        <p className="text-xs text-gray-500">
          Role kasir tidak memiliki akses pengambilan order produksi.
        </p>
      )}

      {transferOrderId && transferOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-order-modal-title"
          onClick={() => {
            setTransferOrderId(null);
            setTransferStaffUserId("");
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                {(() => {
                  const isWholeOrderUnassigned =
                    isOrderFullyUnassigned(transferOrder);
                  const singleAssignee = getSingleOrderAssignee(transferOrder);
                  const isTransferable =
                    !isWholeOrderUnassigned && Boolean(singleAssignee);
                  return (
                    <>
                      <h3
                        id="transfer-order-modal-title"
                        className="text-base font-semibold text-slate-900"
                      >
                        {isTransferable ? "Transfer Order" : "Assign Order"}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {isTransferable
                          ? "Pindahkan order ke staff lain."
                          : "Assign order ke staff untuk mulai produksi."}{" "}
                        Token order: {transferOrderToken}
                      </p>
                    </>
                  );
                })()}
              </div>
              <button
                type="button"
                aria-label="Tutup modal transfer"
                onClick={() => {
                  setTransferOrderId(null);
                  setTransferStaffUserId("");
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {transferCandidates.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {isOrderFullyUnassigned(transferOrder)
                  ? "Belum ada staff tersedia untuk assignment."
                  : getSingleOrderAssignee(transferOrder)
                    ? "Tidak ada staff lain yang tersedia untuk transfer."
                    : "Order ini sudah dibagi ke beberapa staff. Ubah assignment per stage dari detail order."}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pilih staff tujuan
                </label>
                <select
                  value={transferStaffUserId}
                  onChange={(event) =>
                    setTransferStaffUserId(event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  {transferCandidates.map((member) => {
                    const baselineDailyToken = transferOrderDateKey
                      ? (staffDailyTokenByDate.get(
                          `${member.userId}:${transferOrderDateKey}`,
                        ) ?? 0)
                      : 0;
                    const projected = baselineDailyToken + transferOrderToken;
                    const memberLimit =
                      staffTokenLimitByUserId.get(member.userId) ??
                      staffDailyTokenLimit;
                    const overLimit = isStaffDailyTokenAssignmentBlocked({
                      currentToken: baselineDailyToken,
                      incomingToken: transferOrderToken,
                      limit: memberLimit,
                    });

                    return (
                      <option key={member.userId} value={String(member.userId)}>
                        {member.name} ({projected}/{memberLimit}
                        {overLimit ? " - melebihi batas" : ""})
                      </option>
                    );
                  })}
                </select>

                <p
                  className={`text-xs ${
                    selectedTransferOverLimit
                      ? "text-rose-600"
                      : "text-slate-500"
                  }`}
                >
                  Proyeksi token harian: {selectedTransferProjectedToken}/
                  {selectedTransferLimit}
                  {selectedTransferOverLimit ? " (melebihi batas)" : ""}
                </p>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTransferOrderId(null);
                  setTransferStaffUserId("");
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleTransferOrder}
                disabled={
                  !transferStaffUserId ||
                  transferCandidates.length === 0 ||
                  selectedTransferOverLimit
                }
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isOrderFullyUnassigned(transferOrder)
                  ? "Konfirmasi Assign"
                  : getSingleOrderAssignee(transferOrder)
                    ? "Konfirmasi Transfer"
                    : "Atur di Detail"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedDatePopupKey ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="production-date-orders-popup-title"
          onClick={() => setSelectedDatePopupKey(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3
                  id="production-date-orders-popup-title"
                  className="text-base font-semibold text-gray-900"
                >
                  Orders on {selectedDateLabel}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-gray-500">
                    {selectedDateOrders.length} order(s)
                  </p>
                  {selectedDateCapacity ? (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        selectedDateCapacity.status === "FULL"
                          ? "bg-red-100 text-red-700"
                          : selectedDateCapacity.status === "WARNING"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      Kapasitas produksi: {selectedDateCapacity.usedToken} /{" "}
                      {selectedDateCapacity.maxToken} token &nbsp;- sisa{" "}
                      {selectedDateCapacity.remainingToken}
                    </span>
                  ) : null}
                </div>
                {selectedDateStatusMessage ? (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      selectedDateCapacity?.status === "FULL"
                        ? "text-red-600"
                        : selectedDateCapacity?.status === "WARNING"
                          ? "text-amber-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {selectedDateStatusMessage}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close popup"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-100"
                onClick={() => setSelectedDatePopupKey(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-2 overflow-y-auto px-5 py-4">
              {selectedDateOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-sm text-gray-500">
                  Tidak ada order pada tanggal ini.
                </div>
              ) : (
                selectedDateOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50"
                    onClick={() => {
                      setSelectedDatePopupKey(null);
                      router.push(`/bakery/bookings/${order.id}`);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-900">
                        {order.customerName || "Walk-in Customer"}
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {order.items?.[0]?.productName ||
                          order.product ||
                          "Produk"}{" "}
                        - {order.deliverySlot || "-"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(
                        order.orderStatus,
                      )}`}
                    >
                      {normalizeOrderStatus(order.orderStatus)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
