"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import StatusDropdown from "@/components/bakery/production/StatusDropdown";
import { useOrders } from "@/components/bakery/store";
import { useBusiness } from "@/context/BusinessContext";
import { useRole } from "@/context/RoleContext";
import { summarizeProductionTokensByItems } from "@/lib/bookings/operations";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import { BAKERY_STAFF_DAILY_TOKEN_LIMIT } from "@/lib/bookings/config";
import { DEFAULT_MAX_TOKEN } from "@/lib/calendar/getCalendarStatus";
import { useBakerySettings } from "@/hooks/useBakerySettings";

interface TeamMember {
  userId: number;
  name: string;
  role: "Cashier" | "Staff";
  businessId: number;
}

interface ViewerIdentity {
  userId: number;
  businessId: number;
  role: "Owner" | "Cashier" | "Staff";
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

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusBadgeClass(status: string): string {
  const normalized = normalizeOrderStatus(status);
  if (normalized === "In Production") {
    return "bg-amber-100 text-amber-700";
  }
  if (normalized === "Ready") {
    return "bg-violet-100 text-violet-700";
  }
  if (normalized === "Delivery" || normalized === "Completed") {
    return "bg-emerald-100 text-emerald-700";
  }
  return "bg-indigo-100 text-indigo-700";
}

export default function ProductionTable() {
  const router = useRouter();
  const { business, businesses, switchBusiness } = useBusiness();
  const { orders, updateOrderStatus, assignOrderToStaff } = useOrders();
  const { isOwner, isStaff, role, userName } = useRole();
  const { settings: bakerySettings } = useBakerySettings();
  const productionDailyTokenLimit =
    bakerySettings?.dailyProductionTokenLimit ?? DEFAULT_MAX_TOKEN;
  const staffDailyTokenLimit =
    bakerySettings?.staffDailyTokenLimit ?? STAFF_DAILY_TOKEN_LIMIT_FALLBACK;

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

        if (parsedRole === "Owner") {
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

    if (isOwner) {
      for (const member of teamMembers) {
        byUserId.set(member.userId, member);
      }
    }

    for (const order of orders) {
      if (!order.assignedStaffUserId) continue;
      if (!byUserId.has(order.assignedStaffUserId)) {
        const fallbackName =
          order.assignedStaffName?.trim() ||
          teamMembers.find(
            (member) => member.userId === order.assignedStaffUserId,
          )?.name ||
          `Staff #${order.assignedStaffUserId}`;

        byUserId.set(order.assignedStaffUserId, {
          userId: order.assignedStaffUserId,
          name: fallbackName,
          role: "Staff",
          businessId: viewer?.businessId ?? 0,
        });
      }
    }

    if (!isOwner && isStaff && viewer?.userId) {
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
  }, [isOwner, isStaff, orders, teamMembers, viewer, userName]);

  const staffDailyIndicatorDateKey = filterDate || todayDateKey;

  const staffDailyTokenByDate = useMemo(() => {
    const usage = new Map<string, number>();

    for (const order of orders) {
      const staffUserId = order.assignedStaffUserId ?? null;
      const deliveryDate = (order.deliveryDate || "").trim();
      if (!staffUserId || !deliveryDate) continue;

      const status = normalizeOrderStatus(order.orderStatus);
      if (["Delivery", "Completed", "Cancelled"].includes(status)) {
        continue;
      }

      const token = summarizeProductionTokensByItems(order.items ?? []);
      const key = `${staffUserId}:${deliveryDate}`;
      usage.set(key, (usage.get(key) ?? 0) + token);
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
      const staffUserId = order.assignedStaffUserId ?? null;
      if (!staffUserId) continue;
      if (!matchesDateFilter(order.deliveryDate)) continue;

      const token = summarizeProductionTokensByItems(order.items ?? []);
      const status = normalizeOrderStatus(order.orderStatus);
      const current = statsMap.get(staffUserId) ?? {
        userId: staffUserId,
        name: order.assignedStaffName || `Staff #${staffUserId}`,
        assignedActive: 0,
        doneRaw: 0,
        inProgress: 0,
      };

      if (!["Delivery", "Completed", "Cancelled"].includes(status)) {
        current.assignedActive += token;
      }

      if (["Ready", "Delivery", "Completed"].includes(status)) {
        current.doneRaw += token;
      } else if (status === "In Production") {
        current.inProgress += token;
      }

      statsMap.set(staffUserId, current);
    }

    return Array.from(statsMap.values())
      .map((entry) => {
        const baseline = applyMonthlyBaseline
          ? (resetMap[entry.userId]?.baselineToken ?? 0)
          : 0;
        const dailyToken =
          staffDailyTokenByDate.get(
            `${entry.userId}:${staffDailyIndicatorDateKey}`,
          ) ?? 0;
        return {
          ...entry,
          baseline,
          doneVisible: Math.max(0, entry.doneRaw - baseline),
          dailyToken,
          dailyTokenPercentage:
            dailyToken <= 0
              ? 0
              : Math.round((dailyToken / staffDailyTokenLimit) * 100),
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
    matchesDateFilter,
    staffDailyTokenLimit,
  ]);

  const visibleOrders = useMemo(() => {
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
        if (!viewer?.userId || order.assignedStaffUserId !== viewer.userId)
          return false;
      }

      if (quickFilter === "unassigned") {
        if (order.assignedStaffUserId) return false;
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
    matchesDateFilter,
    normalizedQuery,
    quickFilter,
    viewer,
  ]);

  const queueSummary = useMemo(() => {
    let totalToken = 0;
    let unassigned = 0;
    let dueToday = 0;

    for (const order of visibleOrders) {
      totalToken += summarizeProductionTokensByItems(order.items ?? []);
      if (!order.assignedStaffUserId) unassigned += 1;
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
    if (!transferOrder.assignedStaffUserId) return teamMembers;
    return teamMembers.filter(
      (member) => member.userId !== transferOrder.assignedStaffUserId,
    );
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
      status as "In Production" | "Ready" | "Delivery" | "Completed",
    );
  };

  const getStatusOptions = (status: string) => {
    if (status === "In Production")
      return ["In Production", "Ready", "Delivery"];
    if (status === "Ready") return ["Ready", "Delivery"];
    if (status === "Delivery") return ["Delivery", "Completed"];
    return ["In Production", "Ready", "Delivery", "Completed"];
  };

  const handleClaimByStaff = (orderId: string) => {
    if (!viewer?.userId) return;
    assignOrderToStaff(orderId, {
      userId: viewer.userId,
      name: viewer.name || userName || "Staff",
    });
  };

  const handleOpenTransferModal = (orderId: string) => {
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) return;

    const candidate = order.assignedStaffUserId
      ? teamMembers.find(
          (member) => member.userId !== order.assignedStaffUserId,
        )
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
    if (!isOwner) return;
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

  const transferOrderToken = transferOrder
    ? summarizeProductionTokensByItems(transferOrder.items ?? [])
    : 0;
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
  const selectedTransferOverLimit =
    transferCandidates.length > 0 &&
    isStaffDailyTokenAssignmentBlocked({
      currentToken: selectedTransferBaselineToken,
      incomingToken: transferOrderToken,
      limit: staffDailyTokenLimit,
    });

  const renderOrderRow = (order: (typeof orders)[number]) => {
    const normalizedOrderStatus = normalizeOrderStatus(order.orderStatus);
    const orderToken = summarizeProductionTokensByItems(order.items ?? []);
    const orderQty = (order.items ?? []).reduce(
      (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
      0,
    );
    const productName =
      order.product ||
      order.items?.[0]?.productName ||
      order.items?.[0]?.subcategory ||
      "Produk";
    const staffName = order.assignedStaffName?.trim();
    const orderDateKey = (order.deliveryDate || "").trim();

    const isUnassigned = !order.assignedStaffUserId;
    const isStaffViewer = isStaff || viewer?.role === "Staff";
    const assignedToMe =
      Boolean(viewer?.userId) && order.assignedStaffUserId === viewer?.userId;
    const claimedByOther =
      Boolean(order.assignedStaffUserId) &&
      viewer?.userId !== order.assignedStaffUserId;
    const canStaffClaim =
      isStaffViewer && isUnassigned && Boolean(viewer?.userId);
    const currentStaffDailyToken =
      viewer?.userId && orderDateKey
        ? (staffDailyTokenByDate.get(`${viewer.userId}:${orderDateKey}`) ?? 0)
        : 0;
    const projectedStaffDailyToken = currentStaffDailyToken + orderToken;
    const exceedsStaffDailyLimit =
      canStaffClaim &&
      isStaffDailyTokenAssignmentBlocked({
        currentToken: currentStaffDailyToken,
        incomingToken: orderToken,
        limit: staffDailyTokenLimit,
      });
    const claimDisabled = claimedByOther || exceedsStaffDailyLimit;

    const canOwnerAssignOrTransfer = isOwner;
    const ownerActionCandidates = canOwnerAssignOrTransfer
      ? teamMembers.filter(
          (member) => member.userId !== order.assignedStaffUserId,
        )
      : [];

    let statusDisabledMessage = "";
    if (!order.assignedStaffUserId) {
      statusDisabledMessage =
        "Ambil order terlebih dahulu sebelum mengubah status";
    } else if (isStaffViewer && !assignedToMe) {
      statusDisabledMessage =
        "Hanya staff yang ditugaskan dapat mengubah status";
    }
    const isStatusDisabled = Boolean(statusDisabledMessage);

    const accentClass =
      normalizedOrderStatus === "In Production"
        ? "border-l-amber-400"
        : normalizedOrderStatus === "Ready"
          ? "border-l-violet-400"
          : "border-l-emerald-400";

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
        className={`group flex cursor-pointer items-center justify-between gap-3 border-l-4 px-4 py-2.5 transition hover:bg-gray-50 ${accentClass}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700">
            {order.customerName || "Walk-in Customer"}
          </p>
          <p className="truncate text-xs text-gray-500">
            {productName} • Qty {orderQty || 0} •{" "}
            {order.deliverySlot || "No slot"}
          </p>
        </div>

        <div className="w-24 shrink-0 text-center text-xs">
          <p className="font-semibold text-gray-700">{orderToken} token</p>
          <p className="text-gray-500">{order.deliveryDate || "-"}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            {staffName ? (
              <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                {staffName}
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                Unassigned
              </span>
            )}

            {canStaffClaim && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleClaimByStaff(order.id);
                }}
                disabled={claimDisabled}
                className="rounded-full bg-blue-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ambil
              </button>
            )}

            {canOwnerAssignOrTransfer && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpenTransferModal(order.id);
                }}
                disabled={ownerActionCandidates.length === 0}
                className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUnassigned ? "Assign" : "Transfer"}
              </button>
            )}

            <div className="w-32" onClick={(event) => event.stopPropagation()}>
              <StatusDropdown
                value={normalizedOrderStatus}
                onChange={(value) => updateStatus(order.id, value)}
                options={getStatusOptions(normalizedOrderStatus)}
                disabled={isStatusDisabled}
              />
            </div>
          </div>

          {exceedsStaffDailyLimit && (
            <p className="text-[11px] font-medium text-rose-600">
              Token harian staff melewati batas ({projectedStaffDailyToken}/
              {staffDailyTokenLimit})
            </p>
          )}

          {statusDisabledMessage && (
            <p className="text-[11px] text-slate-500">
              {statusDisabledMessage}
            </p>
          )}
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
      {isOwner ? (
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

      <div className="sticky top-2 z-10 space-y-4 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-600">
              <Sparkles className="h-3.5 w-3.5" />
              Live Production Queue
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">
              {activeTab === "active"
                ? "Open Queue (Inquiry + In Production)"
                : "Ready & Delivery"}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-700">
                Visible Orders
              </p>
              <p className="text-base font-semibold text-indigo-900">
                {queueSummary.orderCount}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                Total Token
              </p>
              <p className="text-base font-semibold text-emerald-900">
                {queueSummary.totalToken}
              </p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
                Unassigned
              </p>
              <p className="text-base font-semibold text-amber-900">
                {queueSummary.unassigned}
              </p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-rose-700">
                Due Today
              </p>
              <p className="text-base font-semibold text-rose-900">
                {queueSummary.dueToday}
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
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <select
            value={filterMonth}
            onChange={(event) => setFilterMonth(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
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
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
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
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />

          <button
            type="button"
            onClick={resetFilters}
            className="h-9 rounded-lg border border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
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
                ? "bg-slate-800 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter("mine")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              quickFilter === "mine"
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Tugas Saya
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter("unassigned")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              quickFilter === "unassigned"
                ? "bg-amber-500 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Belum Assigned
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter("heavy")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              quickFilter === "heavy"
                ? "bg-rose-500 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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

      {isOwner ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">
              Staff Productivity
            </h4>
            <p className="text-xs text-slate-500">
              Berdasarkan filter aktif saat ini
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {staffStats.length === 0 ? (
              <p className="text-xs text-gray-500">
                Belum ada data token staff.
              </p>
            ) : (
              staffStats.map((staff) => {
                const totalWork = staff.doneVisible + staff.inProgress;
                const completionPct =
                  totalWork <= 0
                    ? 0
                    : Math.round((staff.doneVisible / totalWork) * 100);
                const normalizedDailyLimit = Math.max(1, staffDailyTokenLimit);
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
                const dailyIndicatorClass =
                  overDailyToken > 0 || dailyPct >= 100
                    ? "bg-rose-100 text-rose-700"
                    : dailyPct >= 70
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700";
                const dailyStatusText =
                  overDailyToken > 0
                    ? `Melebihi batas +${overDailyToken} token`
                    : dailyPct >= 100
                      ? "Limit tercapai"
                      : dailyPct >= 70
                        ? `Mendekati limit (${remainingDailyToken} token tersisa)`
                        : `Masih aman (${remainingDailyToken} token tersisa)`;

                return (
                  <div
                    key={staff.userId}
                    className="rounded-xl border border-slate-200 bg-linear-to-br from-white via-slate-50 to-indigo-50/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {staff.name}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${dailyIndicatorClass}`}
                      >
                        Token aktif: {staff.assignedActive} token
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">
                      Token diambil (sesuai filter): {staff.assignedActive}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Tanggal acuan token:{" "}
                      {formatGroupDate(staffDailyIndicatorDateKey)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600">
                      Token harian: {usedDailyToken} / {normalizedDailyLimit}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600">
                      Status token: {dailyStatusText}
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      Selesai {staff.doneVisible} token • In progress{" "}
                      {staff.inProgress} token
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Sisa token hari ini: {remainingDailyToken}
                      {overDailyToken > 0 ? ` • Over ${overDailyToken}` : ""}
                    </p>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.max(0, completionPct))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Progress selesai {completionPct}%
                    </p>

                    {isOwner && (
                      <button
                        type="button"
                        onClick={() =>
                          handleResetStaffMonth(staff.userId, staff.doneRaw)
                        }
                        disabled={resettingUserId === staff.userId}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-500 transition hover:text-red-600 disabled:opacity-60"
                      >
                        {resettingUserId === staff.userId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Reset Token Bulanan
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("active")}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            activeTab === "active"
              ? "bg-slate-900 text-white shadow-sm"
              : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          Open Queue ({activeOrders.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ready")}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            activeTab === "ready"
              ? "bg-slate-900 text-white shadow-sm"
              : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          Ready / Delivery ({readyOrders.length})
        </button>
      </div>

      <div
        className={`transition-all duration-300 ease-out ${
          isListTransitioning
            ? "translate-y-1 opacity-70"
            : "translate-y-0 opacity-100"
        }`}
      >
        {groupedOrders.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">
            Tidak ada order pada filter yang dipilih.
          </div>
        ) : (
          <div className="space-y-4">
            {groupedOrders.map((group) => (
              <div
                key={group.dateKey}
                className="rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {group.label}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    {group.items.length} orders • {group.totalToken} token
                  </span>
                </div>
                <div className="divide-y bg-white">
                  {group.items.map((order) => renderOrderRow(order))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
                <h3
                  id="transfer-order-modal-title"
                  className="text-base font-semibold text-slate-900"
                >
                  {transferOrder.assignedStaffUserId
                    ? "Transfer Order"
                    : "Assign Order"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {transferOrder.assignedStaffUserId
                    ? "Pindahkan order ke staff lain."
                    : "Assign order ke staff untuk mulai produksi."}{" "}
                  Token order: {transferOrderToken}
                </p>
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
                {transferOrder.assignedStaffUserId
                  ? "Tidak ada staff lain yang tersedia untuk transfer."
                  : "Belum ada staff tersedia untuk assignment."}
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
                    const overLimit = isStaffDailyTokenAssignmentBlocked({
                      currentToken: baselineDailyToken,
                      incomingToken: transferOrderToken,
                      limit: staffDailyTokenLimit,
                    });

                    return (
                      <option key={member.userId} value={String(member.userId)}>
                        {member.name} ({projected}/{staffDailyTokenLimit}
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
                  {staffDailyTokenLimit}
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
                {transferOrder.assignedStaffUserId
                  ? "Konfirmasi Transfer"
                  : "Konfirmasi Assign"}
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
