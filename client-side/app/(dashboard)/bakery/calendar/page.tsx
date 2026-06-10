"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Views,
  dateFnsLocalizer,
  type DateHeaderProps,
  type EventProps,
  type ToolbarProps,
  type View,
} from "react-big-calendar";
import {
  addHours,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  parse,
  setHours,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { id as localeId } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { type BakeryOrder, useOrders } from "@/components/bakery/store";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Calendar as IconCalendar,
  BookOpen,
} from "lucide-react";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { toast } from "sonner";
import {
  DEFAULT_MAX_TOKEN,
  getCalendarStatus,
  type CalendarStatus,
} from "@/lib/calendar/getCalendarStatus";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import { useCalendarCapacity } from "@/hooks/useCalendarCapacity";
import { useBakerySettings } from "@/hooks/useBakerySettings";
import CalendarCell from "@/components/calendar/CalendarCell";
import { useBusiness } from "@/context/BusinessContext";
import { useRole } from "@/context/RoleContext";
import { summarizeProductionTokensByItems } from "@/lib/bookings/operations";
import { getOrderItemsSummary } from "@/lib/bookings/order-display";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";

const locales = { id: localeId };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

type CalendarOrderEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource:
    | { source: "internal"; order: BakeryOrder }
    | { source: "google"; htmlLink?: string; status?: string };
};

type GoogleCalendarApiEvent = {
  id?: string;
  summary?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: {
    private?: { bookingId?: string; bookingCode?: string };
  };
};

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeToDateKey(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return toDateKey(date);
}

function normalizeCalendarDeliveryDate(value: string | null | undefined) {
  return normalizeDateInput(value ?? "") ?? "";
}

function extractCalendarDateFromBookingReference(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return "";

  const match = normalized.match(/-(\d{2})(\d{2})(\d{2})-(\d{3})$/);
  if (!match) return "";

  const [, day, month, year] = match;
  return normalizeDateInput(`20${year}-${month}-${day}`) ?? "";
}

function resolveCalendarOrderDateKey(
  order: Pick<
    BakeryOrder,
    "deliveryDate" | "bookingCode" | "resi" | "createdAt" | "updatedAt"
  >,
) {
  const fromDeliveryDate = normalizeCalendarDeliveryDate(order.deliveryDate);
  if (fromDeliveryDate) return fromDeliveryDate;

  const fromBookingCode = extractCalendarDateFromBookingReference(
    order.bookingCode,
  );
  if (fromBookingCode) return fromBookingCode;

  const fromResi = extractCalendarDateFromBookingReference(order.resi);
  if (fromResi) return fromResi;

  const fromCreatedAt = normalizeDateInput(order.createdAt ?? "") ?? "";
  if (fromCreatedAt) return fromCreatedAt;

  return normalizeDateInput(order.updatedAt ?? "") ?? "";
}

function parseOrderDateTime(dateValue: string, slotValue?: string | null) {
  const normalizedDate = normalizeCalendarDeliveryDate(dateValue);
  if (!normalizedDate) return null;

  const timeValue = (slotValue ?? "").trim();
  const timeMatch = timeValue.match(/^(\d{1,2})(?::(\d{2}))?$/);
  const hours = timeMatch ? Number(timeMatch[1]) : 0;
  const minutes = timeMatch && timeMatch[2] ? Number(timeMatch[2]) : 0;

  const parsed = new Date(`${normalizedDate}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return null;

  parsed.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );

  return parsed;
}

function findBestCalendarFocusDate(
  orders: BakeryOrder[],
  referenceDate: Date,
): Date | null {
  const referenceKey = toDateKey(referenceDate);
  const uniqueDateKeys = Array.from(
    new Set(
      orders.map((order) => resolveCalendarOrderDateKey(order)).filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  if (uniqueDateKeys.length === 0) return null;

  const currentMonthKey = referenceKey.slice(0, 7);
  const hasCurrentMonthOrders = uniqueDateKeys.some(
    (dateKey) => dateKey.slice(0, 7) === currentMonthKey,
  );
  if (hasCurrentMonthOrders) {
    return null;
  }

  const referenceTime = new Date(`${referenceKey}T00:00:00`).getTime();
  let bestDateKey = uniqueDateKeys[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  uniqueDateKeys.forEach((dateKey) => {
    const nextTime = new Date(`${dateKey}T00:00:00`).getTime();
    if (!Number.isFinite(nextTime)) return;
    const distance = Math.abs(nextTime - referenceTime);
    if (
      distance < bestDistance ||
      (distance === bestDistance && dateKey > bestDateKey)
    ) {
      bestDateKey = dateKey;
      bestDistance = distance;
    }
  });

  const focusedDate = new Date(`${bestDateKey}T00:00:00`);
  return Number.isFinite(focusedDate.getTime()) ? focusedDate : null;
}

function getCalendarOrderItemSummary(order: BakeryOrder) {
  return getOrderItemsSummary(order.items ?? [], order.product ?? "Order");
}

function statusColor(status: string) {
  const normalized = normalizeOrderStatus(status);
  if (normalized === "Cancelled") return "#d9534f";
  if (normalized === "Delivered" || normalized === "Completed")
    return "#2d8a55";
  if (normalized === "Delivery" || normalized === "Ready") return "#cb6531";
  if (normalized === "DP Paid" || normalized === "Quoted") return "#d3a423";
  return "#8a6a54";
}

function getCalendarRange(date: Date, view: View) {
  if (view === Views.WEEK) {
    return {
      start: startOfWeek(date, { weekStartsOn: 1 }),
      end: endOfWeek(date, { weekStartsOn: 1 }),
    };
  }

  return {
    start: startOfMonth(date),
    end: endOfMonth(date),
  };
}

function getCalendarRangeISO(date: Date, view: View) {
  const range = getCalendarRange(date, view);
  return {
    timeMin: range.start.toISOString(),
    timeMax: range.end.toISOString(),
  };
}

function CalendarEventItem({ event }: EventProps<CalendarOrderEvent>) {
  return (
    <div className="truncate text-[11px] font-semibold">{event.title}</div>
  );
}

function CalendarToolbar({
  date,
  onNavigate,
}: ToolbarProps<CalendarOrderEvent, object>) {
  const label = format(date, "MMMM yyyy", { locale: localeId });

  return (
    <div className="mb-3 w-full rounded-[20px] border border-[#ead8cb] bg-[#fffdfb] px-3 py-3 shadow-[0_18px_34px_-26px_rgba(47,30,19,0.34)] sm:px-4">
      <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate("PREV")}
          className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#e3c8b0] bg-[#fff8f2] text-[#8c5633] transition hover:bg-[#ffefdf]"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b48c72]">
            Periode Aktif
          </p>
          <h3 className="truncate text-lg font-bold leading-tight text-[#22150d] sm:text-xl">
            {label}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("NEXT")}
          className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#e3c8b0] bg-[#fff8f2] text-[#8c5633] transition hover:bg-[#ffefdf]"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-5 text-[#8c6b57]">
          Lihat periode lain dengan panah, lalu pakai tombol ini untuk kembali
          ke tanggal hari ini.
        </p>
        <button
          type="button"
          onClick={() => onNavigate("TODAY")}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#df642b] bg-[#fff4ec] px-4 text-sm font-semibold text-[#d1642d] transition hover:bg-[#ffe9db]"
          title="Kembali ke minggu atau bulan yang memuat tanggal hari ini"
        >
          Ke Periode Hari Ini
        </button>
      </div>
    </div>
  );
}

export default function BakeryCalendarPage() {
  const router = useRouter();
  const { orders } = useOrders();
  const { business } = useBusiness();
  const { isOwner, isAdmin, loading: isRoleLoading } = useRole();
  const canManageCalendarConnection = isOwner || isAdmin;
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [isDateOrdersPopupOpen, setIsDateOrdersPopupOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [isOAuthLoading, setIsOAuthLoading] = useState(true);
  const [isDisconnectingOAuth, setIsDisconnectingOAuth] = useState(false);
  const [calendarViewMode, setCalendarViewMode] = useState<
    "internal" | "google"
  >("internal");
  const [listFilterMode, setListFilterMode] = useState<
    "all" | "needs-sync" | "synced"
  >("all");
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarApiEvent[]>(
    [],
  );
  const [isLoadingGoogleEvents, setIsLoadingGoogleEvents] = useState(false);
  const [calendarRangeOrders, setCalendarRangeOrders] = useState<BakeryOrder[]>(
    [],
  );
  const [loadedCalendarRangeKey, setLoadedCalendarRangeKey] = useState("");
  const [oauthStatus, setOauthStatus] = useState<{
    connected: boolean;
    connectedEmail: string | null;
    calendarId: string | null;
  }>({ connected: false, connectedEmail: null, calendarId: null });
  const didAutoFocusInitialPeriodRef = useRef(false);

  const calendarRange = useMemo(
    () => getCalendarRange(currentDate, currentView),
    [currentDate, currentView],
  );
  const calendarMinTime = useMemo(() => setHours(new Date(), 6), []);
  const calendarMaxTime = useMemo(() => setHours(new Date(), 21), []);
  const calendarScrollToTime = useMemo(() => setHours(new Date(), 8), []);
  const calendarRangeStartKey = useMemo(
    () => safeToDateKey(calendarRange.start),
    [calendarRange.start],
  );
  const calendarRangeEndKey = useMemo(
    () => safeToDateKey(calendarRange.end),
    [calendarRange.end],
  );
  const calendarRangeKey = `${calendarRangeStartKey}:${calendarRangeEndKey}`;

  const { settings: bakerySettings } = useBakerySettings();
  const blockedDates = bakerySettings?.blockedDates;
  const cutoffHour = bakerySettings?.cutoffHour ?? 10;
  const calendarMaxToken =
    bakerySettings?.dailyProductionTokenLimit ?? DEFAULT_MAX_TOKEN;
  const {
    getCapacity,
    isLoading: isCapacityLoading,
    error: capacityError,
    refetch: refetchCapacity,
  } = useCalendarCapacity(
    calendarRange.start,
    calendarRange.end,
    calendarMaxToken,
  );

  const capacitySyncKey = useMemo(() => {
    return orders
      .map(
        (order) =>
          `${order.id}:${order.deliveryDate}:${order.orderStatus}:${order.items?.length ?? 0}`,
      )
      .sort()
      .join("|");
  }, [orders]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refetchCapacity();
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [capacitySyncKey, refetchCapacity]);

  useEffect(() => {
    refetchCapacity();
  }, [calendarMaxToken, refetchCapacity]);

  useEffect(() => {
    if (!calendarRangeStartKey || !calendarRangeEndKey) return;

    const controller = new AbortController();

    const loadCalendarOrders = async () => {
      try {
        const params = new URLSearchParams({
          mode: "calendar",
          view: "all",
          startDate: calendarRangeStartKey,
          endDate: calendarRangeEndKey,
        });
        const response = await fetch(
          `/api/bookings/orders?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { orders?: BakeryOrder[] };
        };

        if (!response.ok || !payload.success) return;
        setCalendarRangeOrders(
          Array.isArray(payload.data?.orders) ? payload.data.orders : [],
        );
        setLoadedCalendarRangeKey(calendarRangeKey);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    };

    void loadCalendarOrders();

    return () => {
      controller.abort();
    };
  }, [calendarRangeEndKey, calendarRangeKey, calendarRangeStartKey]);

  const scopedCalendarOrders = useMemo(() => {
    if (loadedCalendarRangeKey === calendarRangeKey) {
      return calendarRangeOrders;
    }

    return orders.filter((order) => {
      const dateKey = resolveCalendarOrderDateKey(order);
      return (
        Boolean(dateKey) &&
        dateKey >= calendarRangeStartKey &&
        dateKey <= calendarRangeEndKey
      );
    });
  }, [
    calendarRangeEndKey,
    calendarRangeKey,
    calendarRangeOrders,
    calendarRangeStartKey,
    loadedCalendarRangeKey,
    orders,
  ]);

  const liveUsedTokenByDate = useMemo(() => {
    const result = new Map<string, number>();

    for (const order of scopedCalendarOrders) {
      const normalizedDate = resolveCalendarOrderDateKey(order);
      if (!normalizedDate) continue;

      const normalizedStatus = normalizeOrderStatus(order.orderStatus);
      if (normalizedStatus === "Cancelled") {
        continue;
      }

      const currentUsedToken = result.get(normalizedDate) ?? 0;
      result.set(
        normalizedDate,
        currentUsedToken + summarizeProductionTokensByItems(order.items ?? []),
      );
    }

    return result;
  }, [scopedCalendarOrders]);

  const getEffectiveCapacity = useMemo(() => {
    return (dateKey: string) => {
      const serverCapacity = getCapacity(dateKey);
      const liveUsedToken = liveUsedTokenByDate.get(dateKey) ?? 0;

      return {
        date: dateKey,
        usedToken: Math.max(
          Number(serverCapacity.usedToken) || 0,
          liveUsedToken,
        ),
        maxToken:
          Number(serverCapacity.maxToken) > 0
            ? serverCapacity.maxToken
            : calendarMaxToken,
      };
    };
  }, [calendarMaxToken, getCapacity, liveUsedTokenByDate]);

  const statusByDate = useMemo(() => {
    const result = new Map<string, CalendarStatus>();
    const now = new Date();
    const cursor = new Date(calendarRange.start);
    while (cursor <= calendarRange.end) {
      const dateKey = safeToDateKey(cursor);
      if (dateKey) {
        const capacity = getEffectiveCapacity(dateKey);
        const status = getCalendarStatus(
          {
            usedToken: capacity.usedToken,
            maxToken: capacity.maxToken,
            date: dateKey,
          },
          now,
          { blockedDates, cutoffHour },
        );
        result.set(dateKey, status);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [blockedDates, cutoffHour, calendarRange, getEffectiveCapacity]);

  const selectedDateKey = selectedDate ? toDateKey(selectedDate) : "";
  const selectedCapacity = selectedDateKey
    ? getEffectiveCapacity(selectedDateKey)
    : null;
  const selectedStatus = selectedDateKey
    ? (statusByDate.get(selectedDateKey) ?? "AVAILABLE")
    : "AVAILABLE";

  const loadOAuthStatus = async () => {
    setIsOAuthLoading(true);
    try {
      const response = await fetch("/api/bookings/google-calendar/status", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        connected?: boolean;
        connectedEmail?: string | null;
        calendarId?: string | null;
      };
      if (!response.ok) return;
      setOauthStatus({
        connected: Boolean(payload.connected),
        connectedEmail: payload.connectedEmail || null,
        calendarId: payload.calendarId || null,
      });
    } finally {
      setIsOAuthLoading(false);
    }
  };

  useEffect(() => {
    void loadOAuthStatus();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (!gcal) return;
    if (gcal === "connected") {
      toast.success("Google Calendar OAuth connected.");
      void loadOAuthStatus();
      params.delete("gcal");
      params.delete("reason");
      const next = params.toString();
      window.history.replaceState(
        {},
        "",
        next ? `?${next}` : window.location.pathname,
      );
      return;
    }
    if (gcal === "error") {
      const reason = params.get("reason") || "unknown";
      toast.error(`Google OAuth failed: ${reason}`);
      params.delete("gcal");
      params.delete("reason");
      const next = params.toString();
      window.history.replaceState(
        {},
        "",
        next ? `?${next}` : window.location.pathname,
      );
    }
  }, []);

  const connectGoogleCalendar = () => {
    window.location.href = "/api/bookings/google-calendar/connect";
  };

  const disconnectGoogleCalendar = async () => {
    if (isDisconnectingOAuth) return;
    setIsDisconnectingOAuth(true);
    try {
      const response = await fetch("/api/bookings/google-calendar/disconnect", {
        method: "POST",
      });
      if (!response.ok) {
        toast.error("Failed to disconnect Google Calendar.");
        return;
      }
      toast.success("Google Calendar disconnected.");
      await loadOAuthStatus();
    } finally {
      setIsDisconnectingOAuth(false);
    }
  };

  const fetchGoogleEvents = async (date: Date, view: View) => {
    const { timeMin, timeMax } = getCalendarRangeISO(date, view);
    setIsLoadingGoogleEvents(true);
    try {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        maxResults: "500",
      });
      const response = await fetch(
        `/api/bookings/google-calendar/events?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        events?: GoogleCalendarApiEvent[];
        error?: string;
      };
      if (!response.ok) {
        toast.error(payload.error || "Failed to load Google Calendar events.");
        return;
      }
      setGoogleEvents(payload.events || []);
    } finally {
      setIsLoadingGoogleEvents(false);
    }
  };

  useEffect(() => {
    if (calendarViewMode !== "google") return;
    void fetchGoogleEvents(currentDate, currentView);
  }, [calendarViewMode, currentDate, currentView]);

  useEffect(() => {
    if (didAutoFocusInitialPeriodRef.current) return;
    if (orders.length === 0) return;

    const focusedDate = findBestCalendarFocusDate(orders, new Date());
    didAutoFocusInitialPeriodRef.current = true;
    if (!focusedDate) return;

    setCurrentDate(focusedDate);
    setSelectedDate(focusedDate);
  }, [orders]);

  const filteredInternalOrders = useMemo(() => {
    if (listFilterMode === "needs-sync") {
      return scopedCalendarOrders.filter(
        (order) => !order.simulations?.calendarEventCreated,
      );
    }
    if (listFilterMode === "synced") {
      return scopedCalendarOrders.filter((order) =>
        Boolean(order.simulations?.calendarEventCreated),
      );
    }
    return scopedCalendarOrders;
  }, [listFilterMode, scopedCalendarOrders]);

  const internalEvents = useMemo<CalendarOrderEvent[]>(() => {
    return filteredInternalOrders.flatMap((order) => {
      const effectiveDate = resolveCalendarOrderDateKey(order);
      const start = parseOrderDateTime(effectiveDate, order.deliverySlot);
      if (!start) return [];
      return {
        id: order.id,
        title: `${order.customerName} - ${getCalendarOrderItemSummary(order)}`,
        start,
        end: addHours(start, 1),
        resource: { source: "internal" as const, order },
      };
    });
  }, [filteredInternalOrders]);

  const googleCalendarEvents = useMemo<CalendarOrderEvent[]>(() => {
    const mapped: CalendarOrderEvent[] = [];
    googleEvents.forEach((event) => {
      const startRaw = event.start?.dateTime || event.start?.date;
      const endRaw = event.end?.dateTime || event.end?.date;
      if (!startRaw) return;
      const start = new Date(startRaw);
      const end = endRaw ? new Date(endRaw) : addHours(start, 1);
      if (!Number.isFinite(start.getTime())) return;
      mapped.push({
        id: event.id || `google-${startRaw}`,
        title: event.summary || "Google Calendar Event",
        start,
        end,
        resource: {
          source: "google" as const,
          htmlLink: event.htmlLink,
          status: event.status,
        },
      });
    });
    return mapped;
  }, [googleEvents]);

  const events =
    calendarViewMode === "google" ? googleCalendarEvents : internalEvents;
  const visibleEvents = currentView === Views.MONTH ? [] : events;

  const ordersByDate = useMemo(() => {
    const result = new Map<string, BakeryOrder[]>();
    filteredInternalOrders.forEach((order) => {
      const normalizedDate = resolveCalendarOrderDateKey(order);
      if (!normalizedDate) return;

      const dateOrders = result.get(normalizedDate) ?? [];
      dateOrders.push(order);
      result.set(normalizedDate, dateOrders);
    });
    return result;
  }, [filteredInternalOrders]);

  const currentPeriodOrderDates = useMemo(() => {
    const startKey = safeToDateKey(calendarRange.start);
    const endKey = safeToDateKey(calendarRange.end);
    if (!startKey || !endKey) return [];

    return Array.from(ordersByDate.keys())
      .filter((dateKey) => dateKey >= startKey && dateKey <= endKey)
      .sort((left, right) => left.localeCompare(right));
  }, [calendarRange, ordersByDate]);

  const currentPeriodOrderCount = useMemo(() => {
    return currentPeriodOrderDates.reduce(
      (total, dateKey) => total + (ordersByDate.get(dateKey)?.length ?? 0),
      0,
    );
  }, [currentPeriodOrderDates, ordersByDate]);

  const nearestOrderInScope = useMemo(
    () => findBestCalendarFocusDate(orders, currentDate),
    [currentDate, orders],
  );

  const currentPeriodEmptyMessage = useMemo(() => {
    if (scopedCalendarOrders.length === 0) {
      return "Belum ada order pada periode kalender ini.";
    }
    if (currentPeriodOrderCount > 0) return "";
    if (orders.length === 0) {
      return "Belum ada order pada business ini.";
    }
    if (!nearestOrderInScope) {
      return "Belum ada order pada periode kalender ini.";
    }

    return `Belum ada order di periode ini. Order terdekat ada pada ${format(
      nearestOrderInScope,
      "dd MMMM yyyy",
      { locale: localeId },
    )}.`;
  }, [
    currentPeriodOrderCount,
    nearestOrderInScope,
    orders.length,
    scopedCalendarOrders.length,
  ]);

  const selectedDateLabel = selectedDate
    ? format(selectedDate, "EEEE, dd MMMM yyyy", { locale: localeId })
    : "Select a date";

  const selectedDateOrdersAll = useMemo(() => {
    if (!selectedDateKey) return [];
    return scopedCalendarOrders
      .filter(
        (order) => resolveCalendarOrderDateKey(order) === selectedDateKey,
      )
      .slice()
      .sort((a, b) => a.deliverySlot.localeCompare(b.deliverySlot));
  }, [scopedCalendarOrders, selectedDateKey]);

  const openSelectedDateInBookings = () => {
    if (!selectedDateKey) return;

    const nextParams = new URLSearchParams({
      source: "calendar",
      view: "all",
      date: selectedDateKey,
      sort: "delivery-asc",
    });

    setIsDateOrdersPopupOpen(false);
    router.push(`/bakery/bookings?${nextParams.toString()}`);
  };

  const todayKey = toDateKey(new Date());
  const internalTodayCount = orders.filter(
    (order) => resolveCalendarOrderDateKey(order) === todayKey,
  ).length;
  const needsSyncCount = orders.filter(
    (order) => !order.simulations?.calendarEventCreated,
  ).length;
  const googleTodayCount = googleCalendarEvents.filter(
    (entry) => safeToDateKey(entry.start) === todayKey,
  ).length;

  const mismatchCount = useMemo(() => {
    const bookingIdsOnGoogle = new Set(
      googleEvents
        .map((event) => event.extendedProperties?.private?.bookingId)
        .filter((value): value is string => Boolean(value)),
    );
    if (bookingIdsOnGoogle.size === 0) return null;
    const { timeMin, timeMax } = getCalendarRangeISO(currentDate, currentView);
    const minDate = safeToDateKey(new Date(timeMin));
    const maxDate = safeToDateKey(new Date(timeMax));
    if (!minDate || !maxDate) return null;
    return orders.filter((order) => {
      const normalizedDate = resolveCalendarOrderDateKey(order);
      if (!normalizedDate) return false;
      if (normalizedDate < minDate || normalizedDate > maxDate) return false;
      if (["Cancelled", "Delivered", "Completed"].includes(order.orderStatus))
        return false;
      return !bookingIdsOnGoogle.has(order.id);
    }).length;
  }, [googleEvents, currentDate, currentView, orders]);

  const selectedStatusMessage = useMemo(() => {
    if (!selectedCapacity) return "";
    switch (selectedStatus) {
      case "PAST":
        return "Tanggal sudah terlewat";
      case "BLOCKED":
        return "Tanggal libur admin";
      case "FULL":
        return "Kapasitas penuh, tidak bisa menerima order baru";
      case "CUTOFF":
        return `Closed (H-1), cutoff jam ${String(cutoffHour).padStart(2, "0")}:00 sudah lewat`;
      case "WARNING":
        return "Hampir penuh, segera capai batas kapasitas";
      case "AVAILABLE":
      default:
        return "Kapasitas masih tersedia";
    }
  }, [selectedStatus, selectedCapacity, cutoffHour]);

  const selectedUsagePercent = selectedCapacity
    ? Math.min(
        100,
        Math.round(
          (selectedCapacity.usedToken /
            (selectedCapacity.maxToken || calendarMaxToken)) *
            100,
        ),
      )
    : 0;

  const activeModeSubtitle =
    calendarViewMode === "google"
      ? "Google calendar aktif"
      : "Order internal aktif";

  void canManageCalendarConnection;
  void isOAuthLoading;
  void setCalendarViewMode;
  void setListFilterMode;
  void isLoadingGoogleEvents;
  void oauthStatus;
  void connectGoogleCalendar;
  void disconnectGoogleCalendar;
  void internalTodayCount;
  void needsSyncCount;
  void googleTodayCount;
  void mismatchCount;
  void activeModeSubtitle;

  const openDateOrdersPopup = (date: Date) => {
    setSelectedDate(date);
    setIsDateOrdersPopupOpen(true);
  };

  const DateHeader = ({ date, label }: DateHeaderProps) => {
    const dateKey = safeToDateKey(date);
    const count = dateKey ? (ordersByDate.get(dateKey)?.length ?? 0) : 0;
    const capacity = dateKey
      ? getEffectiveCapacity(dateKey)
      : { usedToken: 0, maxToken: calendarMaxToken, date: dateKey };
    const status = dateKey
      ? (statusByDate.get(dateKey) ?? "AVAILABLE")
      : "AVAILABLE";

    return (
      <CalendarCell
        label={label}
        date={date}
        usedToken={capacity.usedToken}
        maxToken={capacity.maxToken}
        status={status}
        orderCount={count}
        onDateClick={openDateOrdersPopup}
      />
    );
  };

  if (isRoleLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-5 text-sm text-gray-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat hak akses kalender...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10 text-[#2f1e13]">
      <GradientPageHeader
        title="Calendar"
        description={`Kapasitas ${calendarMaxToken} tok/hari${business?.name ? ` · ${business.name}` : ""}`}
        icon={IconCalendar}
      />

      <section className="min-w-0 space-y-3 rounded-3xl border border-[#e2d1c3] bg-white p-3 shadow-sm md:p-4 lg:p-5 lg:shadow-[0_8px_16px_-8px_rgba(30,18,10,0.1)]">
        <div className="min-w-0 grid gap-3 lg:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.85fr)]">
          <div className="min-w-0 rounded-3xl border border-[#e2d1c3] bg-linear-to-br from-[#fffaf4] to-[#fffdf9] p-3 md:p-4 lg:p-5">
            <div className="flex flex-col items-start justify-between gap-3 border-b border-[#e8dcd0] pb-3 md:flex-row md:items-center md:gap-4 md:pb-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold leading-tight text-[#1f140d] md:text-xl">
                    📅 Calendar
                  </h1>
                </div>
                <p className="mt-1 text-xs text-[#8a6a54] md:text-sm">
                  Kapasitas {calendarMaxToken} tok/hari · 2 staff aktif
                </p>
              </div>

              <div className="grid w-full shrink-0 grid-cols-2 rounded-full border border-[#e3cdbd] bg-[#fbf5ef] p-1 md:inline-flex md:w-auto">
                <button
                  type="button"
                  onClick={() => setCurrentView(Views.WEEK)}
                  className={`rounded-full px-2.5 py-2 text-center text-xs font-semibold transition md:px-3 md:py-1.5 md:text-sm ${
                    currentView === Views.WEEK
                      ? "bg-white text-[#4c2b15] shadow-[0_8px_18px_-14px_rgba(47,30,19,0.35)]"
                      : "text-[#8a6a54] hover:text-[#5c3e2e]"
                  }`}
                >
                  Minggu
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView(Views.MONTH)}
                  className={`rounded-full px-2.5 py-2 text-center text-xs font-semibold transition md:px-3 md:py-1.5 md:text-sm ${
                    currentView === Views.MONTH
                      ? "bg-[#cb6837] text-white shadow-[0_10px_18px_-14px_rgba(203,104,55,0.8)]"
                      : "text-[#8a6a54] hover:text-[#5c3e2e]"
                  }`}
                >
                  Bulan
                </button>
              </div>
            </div>

            {capacityError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 md:mt-4 md:px-4 md:py-3">
                ⚠️ Gagal memuat data kapasitas: {capacityError}
              </div>
            )}

            <div className="mt-3 min-w-0 rounded-[24px] border border-[#dcc7b8] bg-[#fffdf9] p-2.5 md:mt-4 md:p-4">
              {isCapacityLoading && (
                <div className="flex items-center justify-center gap-2 pb-3 text-xs font-medium text-[#8c5f44] md:text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-[#cb6837]" />
                  Loading...
                </div>
              )}

              <div
                className={`bakery-calendar-shell w-full max-w-full rounded-xl border border-[#e2d1c3] bg-white overscroll-contain ${
                  currentView === Views.MONTH
                    ? "month-view h-auto overflow-visible"
                    : "week-view overflow-x-auto overflow-y-hidden touch-pan-x touch-pan-y h-[25rem] sm:h-[30rem] md:h-[34rem] lg:h-[38rem]"
                }`}
              >
                <div
                  className={`${
                    currentView === Views.MONTH
                      ? "min-w-0"
                      : "h-full min-w-[840px] md:min-w-full"
                  }`}
                >
                  <Calendar
                    localizer={localizer}
                    culture="id"
                    events={visibleEvents}
                    startAccessor="start"
                    endAccessor="end"
                    date={currentDate}
                    view={currentView}
                    defaultView={Views.MONTH}
                    views={[Views.MONTH, Views.WEEK]}
                    min={calendarMinTime}
                    max={calendarMaxTime}
                    scrollToTime={calendarScrollToTime}
                    selectable
                    popup
                    onNavigate={(newDate) => {
                      setCurrentDate(newDate);
                      setSelectedDate(newDate);
                    }}
                    onView={(nextView) => setCurrentView(nextView)}
                    onSelectSlot={(slotInfo) => {
                      openDateOrdersPopup(slotInfo.start);
                    }}
                    onSelectEvent={(event) => {
                      if (event.resource.source === "internal") {
                        router.push(
                          `/bakery/bookings/${event.resource.order.id}`,
                        );
                        return;
                      }
                      if (event.resource.htmlLink) {
                        window.open(
                          event.resource.htmlLink,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      }
                    }}
                    eventPropGetter={(event) => ({
                      style: {
                        backgroundColor:
                          event.resource.source === "internal"
                            ? statusColor(event.resource.order.orderStatus)
                            : "#0ea5e9",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        padding: "1px 4px",
                        fontSize: "10px",
                      },
                    })}
                    dayPropGetter={(date) => {
                      const dateKey = toDateKey(date);
                      const status = statusByDate.get(dateKey) ?? "AVAILABLE";

                      if (status === "PAST")
                        return { className: "rbc-day-past" };
                      if (status === "BLOCKED")
                        return { className: "rbc-day-blocked" };
                      if (status === "FULL")
                        return { className: "rbc-day-full" };
                      if (status === "CUTOFF")
                        return { className: "rbc-day-cutoff" };
                      if (status === "WARNING")
                        return { className: "rbc-day-warning" };
                      return { className: "rbc-day-normal" };
                    }}
                    components={{
                      toolbar: CalendarToolbar,
                      event: CalendarEventItem,
                      month: {
                        dateHeader: DateHeader,
                      },
                    }}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1.5 rounded-[18px] border border-[#dcc7b8] bg-[#faf7f3] px-3 py-2.5 text-[10px] font-medium text-[#8a6a54] md:gap-x-3 md:gap-y-2 md:px-4 md:py-3 md:text-xs">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#bdb4ae]" /> Passed
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#ec9e9e]" /> Libur
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#3d9958]" />{" "}
                  Available
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#d3a423]" />{" "}
                  {">=80% penuh"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#db6b2e]" />{" "}
                  Terlambat
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#d24f40]" /> Closed
                  H-1
                </span>
              </div>

              {currentPeriodEmptyMessage ? (
                <div className="mt-3 rounded-[18px] border border-[#ead8cb] bg-[#fff8f2] px-4 py-3 text-xs leading-5 text-[#8a6a54] md:text-sm">
                  {currentPeriodEmptyMessage}
                </div>
              ) : null}
            </div>
          </div>

          {selectedDate && selectedCapacity ? (
            <div className="mt-4 overflow-hidden rounded-3xl border border-[#dcc7b8] bg-linear-to-br from-[#fffaf4] to-[#fffdf9] lg:mt-0 lg:sticky lg:top-4 lg:self-start">
              <div className="flex flex-col items-start justify-between gap-3 border-b border-[#e8dcd0] bg-[#f8f1e8] px-4 py-3 md:flex-row md:items-center md:px-5 md:py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold leading-tight text-[#cb6837] md:text-lg">
                    {selectedDateLabel}
                  </p>
                  <p
                    className={`mt-1 text-xs font-medium md:text-sm ${
                      selectedStatus === "PAST"
                        ? "text-[#8d837c]"
                        : selectedStatus === "BLOCKED"
                          ? "text-[#dc6e59]"
                          : selectedStatus === "FULL"
                            ? "text-[#d7662d]"
                            : selectedStatus === "WARNING"
                              ? "text-[#a27516]"
                              : selectedStatus === "CUTOFF"
                                ? "text-[#d24f40]"
                                : "text-[#4f8b57]"
                    }`}
                  >
                    {selectedStatusMessage}
                  </p>
                </div>
                <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
                  <button
                    type="button"
                    onClick={openSelectedDateInBookings}
                    className="shrink-0 rounded-full border border-[#e6d1be] bg-[#fff7f0] px-3 py-2 text-xs font-semibold text-[#8a4b22] transition hover:bg-[#ffefdf] md:px-4 md:py-2.5 md:text-sm"
                  >
                    Lihat Booking
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/bakery/bookings/new")}
                    className="shrink-0 rounded-full bg-[#cb6837] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#b15a31] md:px-4 md:py-2.5 md:text-sm"
                  >
                    + Booking
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 px-4 py-4 text-center md:gap-3 md:px-5 md:py-5 lg:grid-cols-2">
                <div className="rounded-lg border border-[#e2d1c3] bg-white p-2 md:p-3">
                  <p className="text-xl font-bold leading-none text-[#1e140e] md:text-2xl">
                    {selectedCapacity.usedToken}
                  </p>
                  <p className="mt-1.5 text-[10px] text-[#8a6a54] md:text-xs">
                    Terpakai
                  </p>
                </div>
                <div className="rounded-lg border border-[#e2d1c3] bg-white p-2 md:p-3">
                  <p className="text-xl font-bold leading-none text-[#1e140e] md:text-2xl">
                    {selectedCapacity.maxToken}
                  </p>
                  <p className="mt-1.5 text-[10px] text-[#8a6a54] md:text-xs">
                    Maks
                  </p>
                </div>
                <div className="rounded-lg border border-[#e2d1c3] bg-white p-2 md:p-3">
                  <p
                    className={`text-xl font-bold leading-none md:text-2xl ${
                      selectedCapacity.maxToken - selectedCapacity.usedToken <=
                      0
                        ? "text-[#d24f40]"
                        : selectedCapacity.maxToken -
                              selectedCapacity.usedToken <=
                            selectedCapacity.maxToken * 0.2
                          ? "text-[#a27516]"
                          : "text-[#2d8a55]"
                    }`}
                  >
                    {selectedCapacity.maxToken - selectedCapacity.usedToken}
                  </p>
                  <p className="mt-1.5 text-[10px] text-[#8a6a54] md:text-xs">
                    Sisa
                  </p>
                </div>
                <div className="rounded-lg border border-[#e2d1c3] bg-white p-2 md:p-3">
                  <p className="text-xl font-bold leading-none text-[#1e140e] md:text-2xl">
                    {selectedDateOrdersAll.length}
                  </p>
                  <p className="mt-1.5 text-[10px] text-[#8a6a54] md:text-xs">
                    Orders
                  </p>
                </div>
              </div>

              <div className="mt-4 px-4 pb-4 md:px-5 md:pb-5">
                <div className="h-2 rounded-full bg-[#e8dcd0]">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      selectedCapacity.usedToken >= selectedCapacity.maxToken
                        ? "bg-[#d24f40]"
                        : selectedCapacity.usedToken >=
                            selectedCapacity.maxToken * 0.8
                          ? "bg-[#d3a423]"
                          : "bg-[#3d9958]"
                    }`}
                    style={{ width: `${selectedUsagePercent}%` }}
                  />
                </div>
                <p className="mt-2.5 text-right text-xs font-medium text-[#8a6a54] md:text-sm">
                  {selectedUsagePercent}% terpakai
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Date Orders Popup */}
        {isDateOrdersPopupOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="date-orders-popup-title"
            onClick={() => setIsDateOrdersPopupOpen(false)}
          >
            <div
              className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[#ffd8b7] bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h3
                    id="date-orders-popup-title"
                    className="text-base font-semibold text-gray-900"
                  >
                    Orders on {selectedDateLabel}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-gray-500">
                      {selectedDateOrdersAll.length} order(s)
                    </p>
                    {selectedCapacity ? (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          selectedStatus === "PAST"
                            ? "bg-gray-200 text-gray-700"
                            : selectedStatus === "BLOCKED"
                              ? "bg-rose-100 text-rose-700"
                              : selectedStatus === "FULL"
                                ? "bg-red-100 text-red-700"
                                : selectedStatus === "WARNING"
                                  ? "bg-amber-100 text-amber-700"
                                  : selectedStatus === "CUTOFF"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {selectedCapacity.usedToken} /{" "}
                        {selectedCapacity.maxToken} token &mdash; sisa{" "}
                        {selectedCapacity.maxToken - selectedCapacity.usedToken}
                      </span>
                    ) : null}
                  </div>
                  {selectedStatusMessage ? (
                    <p
                      className={`mt-1 text-xs font-medium ${
                        selectedStatus === "PAST"
                          ? "text-gray-600"
                          : selectedStatus === "BLOCKED"
                            ? "text-rose-600"
                            : selectedStatus === "FULL"
                              ? "text-red-600"
                              : selectedStatus === "WARNING"
                                ? "text-amber-600"
                                : selectedStatus === "CUTOFF"
                                  ? "text-rose-600"
                                  : "text-emerald-600"
                      }`}
                    >
                      {selectedStatusMessage}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {selectedDate ? (
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#ffd8b7] bg-[#fff4df] px-3 text-[11px] font-semibold text-[#8a4b22] transition hover:bg-[#ffedd1]"
                      onClick={openSelectedDateInBookings}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Lihat di Bookings
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Close popup"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-100"
                    onClick={() => setIsDateOrdersPopupOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-[70vh] space-y-2 overflow-y-auto px-5 py-4">
                {!selectedDate ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-sm text-gray-500">
                    Pilih tanggal di kalender untuk melihat order.
                  </div>
                ) : selectedDateOrdersAll.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-sm text-gray-500">
                    Tidak ada order pada tanggal ini.
                  </div>
                ) : (
                  selectedDateOrdersAll.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-left transition hover:border-[#ffd8b7] hover:bg-[#fff4df]"
                      onClick={() => {
                        setIsDateOrdersPopupOpen(false);
                        router.push(`/bakery/bookings/${order.id}`);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-900">
                          {order.customerName}
                        </p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {getCalendarOrderItemSummary(order)} -{" "}
                          {order.deliverySlot || "-"}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                        style={{
                          backgroundColor: statusColor(order.orderStatus),
                        }}
                      >
                        {order.orderStatus}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Global Styles */}
      <style jsx global>{`
        .rbc-calendar {
          font-family: inherit;
          color: #2f1e13;
          font-size: clamp(0.8rem, 1.5vw, 1rem);
          height: 100%;
          min-height: 100%;
        }

        .rbc-header {
          padding: clamp(0.5rem, 1.5vw, 0.9rem) 0;
          font-size: clamp(0.65rem, 1.2vw, 0.75rem);
          font-weight: 700;
          color: #8a6a54;
          border-bottom: 1px solid #dcc7b8;
          background: linear-gradient(135deg, #fffaf4 0%, #fffdf9 100%);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .rbc-day-bg {
          transition: background-color 180ms ease;
          border: 1px solid #e8dcd0;
        }

        .rbc-day-normal {
          background: #fffdf9;
        }

        .rbc-day-warning {
          background: #fff8e4;
        }

        .rbc-day-past {
          background: #f1ece8;
        }

        .rbc-day-blocked {
          background: #fff2f0;
        }

        .rbc-day-full {
          background: #fff1e8;
        }

        .rbc-day-cutoff {
          background: #fff1f0;
        }

        .rbc-today {
          background-color: #eefaf3;
        }

        .rbc-month-view,
        .rbc-time-view,
        .rbc-agenda-view,
        .rbc-time-content,
        .rbc-time-header,
        .rbc-time-header-content,
        .rbc-day-slot .rbc-time-slot,
        .rbc-timeslot-group,
        .rbc-time-gutter {
          border-color: #e2d1c3;
        }

        .rbc-month-view,
        .rbc-time-view {
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #dcc7b8;
          background: white;
          box-shadow: 0 1px 3px rgba(47, 30, 19, 0.05);
        }

        .rbc-month-view {
          height: 100%;
          min-height: 100%;
        }

        .rbc-event,
        .rbc-day-slot .rbc-background-event {
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
          border-radius: 4px !important;
        }

        .rbc-month-row {
          min-height: clamp(76px, 13vw, 112px);
        }

        @media (min-width: 1280px) {
          .rbc-month-row {
            min-height: 140px;
          }
        }

        .rbc-date-cell {
          padding: 3px 4px 2px;
          overflow: hidden;
        }

        .rbc-month-view .rbc-row-content {
          pointer-events: auto;
          overflow: hidden;
        }

        .rbc-month-view .rbc-event {
          pointer-events: auto;
          margin: 2px 4px 0;
          min-height: 20px;
          font-size: 10px;
          line-height: 1.15;
        }

        .rbc-month-view .rbc-event-content {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rbc-month-view .rbc-date-cell {
          pointer-events: auto;
        }

        .rbc-month-view .rbc-row {
          overflow: hidden;
        }

        .rbc-month-view .rbc-date-cell > div,
        .rbc-month-view .rbc-date-cell > span,
        .rbc-month-view .rbc-date-cell > button {
          max-width: 100%;
        }

        .rbc-date-cell > a {
          color: #2f1e13;
          font-weight: 600;
          text-decoration: none;
        }

        .rbc-off-range-bg {
          background: #f7f2ee;
        }

        .rbc-off-range .rbc-date-cell,
        .rbc-off-range .rbc-date-cell button,
        .rbc-off-range .rbc-date-cell span {
          color: #c2b4a8 !important;
        }

        .rbc-show-more {
          color: #cb6531;
          font-size: 0.65rem;
          font-weight: 600;
          background: transparent;
        }

        .rbc-row-content {
          z-index: 3;
        }

        .rbc-date-cell button:focus-visible {
          outline: 2px solid #d9692d;
          outline-offset: 1px;
        }

        .rbc-toolbar {
          display: block;
          width: 100%;
          margin-bottom: 0;
        }

        .bakery-calendar-shell.month-view .rbc-calendar {
          height: auto;
          min-height: 0;
        }

        .bakery-calendar-shell.month-view .rbc-month-view {
          height: auto;
          min-height: 0;
          flex: none;
        }

        .bakery-calendar-shell.month-view .rbc-month-row {
          flex: 0 0 auto;
          height: 7.5rem;
          min-height: 7.5rem;
        }

        @media (max-width: 767px) {
          .rbc-header {
            padding: 0.42rem 0.1rem;
            font-size: 0.56rem;
            letter-spacing: 0.04em;
          }

          .rbc-month-row {
            min-height: 58px;
          }

          .bakery-calendar-shell.month-view .rbc-month-row {
            height: 5.75rem;
            min-height: 5.75rem;
          }

          .rbc-date-cell {
            padding: 1px;
          }

          .rbc-month-view .rbc-row-content,
          .rbc-month-view .rbc-row-bg,
          .rbc-month-view .rbc-row,
          .rbc-month-view .rbc-date-cell {
            min-width: 0;
          }
        }

        @media (min-width: 768px) {
          .bakery-calendar-shell.month-view .rbc-month-row {
            height: 8.5rem;
            min-height: 8.5rem;
          }
        }

        @media (min-width: 1280px) {
          .bakery-calendar-shell.month-view .rbc-month-row {
            height: 9rem;
            min-height: 9rem;
          }
        }

      `}</style>
    </div>
  );
}
