"use client";

import { useEffect, useMemo, useState } from "react";
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
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { id as localeId } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { type BakeryOrder, useOrders } from "@/components/bakery/store";
import { ChevronLeft, ChevronRight, X, Loader2, Calendar as IconCalendar } from "lucide-react";
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
import { useRole } from "@/context/RoleContext";
import { summarizeProductionTokensByItems } from "@/lib/bookings/operations";
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

function safeToDateKey(value: Date) {
  if (!Number.isFinite(value.getTime())) return "";
  try {
    return toDateKey(value);
  } catch {
    return "";
  }
}

function normalizeCalendarDeliveryDate(deliveryDate?: string) {
  const raw = (deliveryDate ?? "").trim();
  if (!raw) return "";

  const normalized = normalizeDateInput(raw);
  if (normalized) return normalized;

  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!isoPrefix) return "";

  return normalizeDateInput(isoPrefix) ?? "";
}

function parseOrderDateTime(deliveryDate?: string, deliverySlot?: string) {
  const normalizedDate = normalizeCalendarDeliveryDate(deliveryDate);
  if (!normalizedDate) return null;

  const [year, month, day] = normalizedDate.split("-").map(Number);
  if (![year, month, day].every((part) => Number.isFinite(part))) return null;
  const [hours, minutes] = (deliverySlot ?? "09:00").split(":").map(Number);
  const parsed = new Date(
    year,
    (month || 1) - 1,
    day || 1,
    hours || 9,
    minutes || 0,
    0,
    0,
  );
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function statusColor(status: BakeryOrder["orderStatus"]) {
  if (status === "Confirmed" || status === "In Production") return "#f97316";
  if (status === "Ready") return "#7c3aed";
  if (status === "Delivered" || status === "Completed") return "#16a34a";
  return "#4f46e5";
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
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate("PREV")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#e1c5ac] bg-white text-[#7d4b26] transition hover:bg-[#fff0e1]"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate("NEXT")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#e1c5ac] bg-white text-[#7d4b26] transition hover:bg-[#fff0e1]"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <h3 className="text-lg font-bold text-[#22150d] sm:text-[1.7rem]">
        {label}
      </h3>
      <button
        type="button"
        onClick={() => onNavigate("TODAY")}
        className="rounded-full border border-[#df642b] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#df642b] transition hover:bg-[#fff2ea]"
      >
        Hari Ini
      </button>
    </div>
  );
}

export default function BakeryCalendarPage() {
  const router = useRouter();
  const { orders } = useOrders();
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
  const [oauthStatus, setOauthStatus] = useState<{
    connected: boolean;
    connectedEmail: string | null;
    calendarId: string | null;
  }>({ connected: false, connectedEmail: null, calendarId: null });

  const calendarRange = useMemo(
    () => getCalendarRange(currentDate, currentView),
    [currentDate, currentView],
  );

  const {
    getCapacity,
    isLoading: isCapacityLoading,
    error: capacityError,
    refetch: refetchCapacity,
  } = useCalendarCapacity(calendarRange.start, calendarRange.end);
  const { settings: bakerySettings } = useBakerySettings();
  const blockedDates = bakerySettings?.blockedDates;
  const cutoffHour = bakerySettings?.cutoffHour ?? 10;
  const calendarMaxToken =
    bakerySettings?.dailyProductionTokenLimit ?? DEFAULT_MAX_TOKEN;

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

  const liveUsedTokenByDate = useMemo(() => {
    const result = new Map<string, number>();

    for (const order of orders) {
      const normalizedDate = normalizeCalendarDeliveryDate(order.deliveryDate);
      if (!normalizedDate) continue;

      const normalizedStatus = normalizeOrderStatus(order.orderStatus);
      if (
        ["Cancelled", "Completed", "Delivered", "Delivery"].includes(
          normalizedStatus,
        )
      ) {
        continue;
      }

      const currentUsedToken = result.get(normalizedDate) ?? 0;
      result.set(
        normalizedDate,
        currentUsedToken + summarizeProductionTokensByItems(order.items ?? []),
      );
    }

    return result;
  }, [orders]);

  const getEffectiveCapacity = useMemo(() => {
    return (dateKey: string) => {
      const serverCapacity = getCapacity(dateKey);
      const liveUsedToken = liveUsedTokenByDate.get(dateKey);

      return {
        date: dateKey,
        usedToken:
          liveUsedToken !== undefined
            ? liveUsedToken
            : serverCapacity.usedToken,
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

  const filteredInternalOrders = useMemo(() => {
    if (listFilterMode === "needs-sync") {
      return orders.filter((order) => !order.simulations?.calendarEventCreated);
    }
    if (listFilterMode === "synced") {
      return orders.filter((order) =>
        Boolean(order.simulations?.calendarEventCreated),
      );
    }
    return orders;
  }, [orders, listFilterMode]);

  const internalEvents = useMemo<CalendarOrderEvent[]>(() => {
    return filteredInternalOrders.flatMap((order) => {
      const start = parseOrderDateTime(order.deliveryDate, order.deliverySlot);
      if (!start) return [];
      return {
        id: order.id,
        title: `${order.customerName} - ${order.items?.[0]?.productName ?? order.product}`,
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
      const normalizedDate = normalizeCalendarDeliveryDate(order.deliveryDate);
      if (!normalizedDate) return;

      const dateOrders = result.get(normalizedDate) ?? [];
      dateOrders.push(order);
      result.set(normalizedDate, dateOrders);
    });
    return result;
  }, [filteredInternalOrders]);

  const selectedDateLabel = selectedDate
    ? format(selectedDate, "EEEE, dd MMMM yyyy", { locale: localeId })
    : "Select a date";

  const selectedDateOrdersAll = useMemo(() => {
    if (!selectedDateKey) return [];
    return orders
      .filter(
        (order) =>
          normalizeCalendarDeliveryDate(order.deliveryDate) === selectedDateKey,
      )
      .slice()
      .sort((a, b) => a.deliverySlot.localeCompare(b.deliverySlot));
  }, [orders, selectedDateKey]);

  const todayKey = toDateKey(new Date());
  const internalTodayCount = orders.filter(
    (order) => normalizeCalendarDeliveryDate(order.deliveryDate) === todayKey,
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
      const normalizedDate = normalizeCalendarDeliveryDate(order.deliveryDate);
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
      <GradientPageHeader title="Calendar" description={`Kapasitas ${calendarMaxToken} tok/hari · ${isRoleLoading ? "..." : ""}`} icon={IconCalendar} />

      <section className="space-y-3 rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.45)]">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
        <div className="rounded-[34px] border border-[#dec8b6] bg-[#fffaf4] p-4 shadow-[0_24px_60px_-38px_rgba(94,53,30,0.45)]">
        <div className="flex items-start justify-between gap-3 border-b border-[#ead6c8] pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[1.05rem] font-bold leading-none text-[#1f140d]">
                Calendar
              </h1>
            </div>
            <p className="mt-1 text-[11px] text-[#b0734d]">
              Kapasitas {calendarMaxToken} tok/hari · 2 staff aktif
            </p>
          </div>

          <div className="inline-flex rounded-full border border-[#e1c9b6] bg-[#fff1e6] p-1">
            <button
              type="button"
              onClick={() => setCurrentView(Views.WEEK)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                currentView === Views.WEEK
                  ? "bg-white text-[#4c2b15] shadow-sm"
                  : "text-[#ab7757]"
              }`}
            >
              Minggu
            </button>
            <button
              type="button"
              onClick={() => setCurrentView(Views.MONTH)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                currentView === Views.MONTH
                  ? "bg-[#d9692d] text-white shadow-sm"
                  : "text-[#ab7757]"
              }`}
            >
              Bulan
            </button>
          </div>
        </div>

        {capacityError ? (
          <div className="mt-4 rounded-[16px] border border-[#f2b0a7] bg-[#fff1ef] px-4 py-3 text-xs text-[#ba5644]">
            Failed to load capacity data: {capacityError}
          </div>
        ) : null}

          <div className="mt-4 rounded-[20px] border border-[#dec8b6] bg-[#fffdf9] p-3 lg:p-4">
          {isCapacityLoading ? (
            <div className="flex items-center justify-center gap-2 pb-3 text-xs font-medium text-[#8c5f44]">
              <Loader2 className="h-4 w-4 animate-spin text-[#cb6531]" />
              Loading capacity data...
            </div>
          ) : null}

            <div
              className={
                currentView === Views.MONTH
                  ? "h-[392px] md:h-[500px] xl:h-[640px]"
                  : "h-[540px] md:h-[640px] xl:h-[760px]"
              }
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
              selectable
              popup
              onNavigate={(newDate) => setCurrentDate(newDate)}
              onView={(nextView) => setCurrentView(nextView)}
              onSelectSlot={(slotInfo) => {
                openDateOrdersPopup(slotInfo.start);
              }}
              onSelectEvent={(event) => {
                if (event.resource.source === "internal") {
                  router.push(`/bakery/bookings/${event.resource.order.id}`);
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

                if (status === "PAST") return { className: "rbc-day-past" };
                if (status === "BLOCKED") return { className: "rbc-day-blocked" };
                if (status === "FULL") return { className: "rbc-day-full" };
                if (status === "CUTOFF") return { className: "rbc-day-cutoff" };
                if (status === "WARNING") return { className: "rbc-day-warning" };
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

            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 rounded-[16px] border border-[#ead6c8] bg-white px-3 py-2 text-[10px] font-medium text-[#8a6a54]">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#bdb4ae]" /> Passed
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#ec9e9e]" /> Libur
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#3d9958]" /> Available
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#d3a423]" /> {">=80% penuh"}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#db6b2e]" /> Terlambat
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#d24f40]" /> Closed H-1
            </span>
            </div>
          </div>
        </div>

        {selectedDate && selectedCapacity ? (
          <div className="overflow-hidden rounded-[20px] border border-[#dd8c5a] bg-[#fffdf9] xl:sticky xl:top-4 xl:self-start">
            <div className="flex items-start justify-between gap-3 border-b border-[#ebc8b0] bg-[#fff1e6] px-4 py-3">
              <div>
                <p className="text-lg font-semibold leading-tight text-[#cb6531]">
                  {selectedDateLabel}
                </p>
                <p
                  className={`mt-1 text-xs font-medium ${
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
              <button
                type="button"
                onClick={() => router.push("/bakery/bookings/new")}
                className="rounded-full bg-[#d3662d] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#bc5925]"
              >
                + Booking
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 px-4 py-4 text-center sm:grid-cols-4 xl:grid-cols-2">
              <div>
                <p className="text-[2rem] font-bold leading-none text-[#1e140e]">
                  {selectedCapacity.usedToken}
                </p>
                <p className="mt-1 text-[11px] text-[#8a6a54]">Terpakai</p>
              </div>
              <div>
                <p className="text-[2rem] font-bold leading-none text-[#1e140e]">
                  {selectedCapacity.maxToken}
                </p>
                <p className="mt-1 text-[11px] text-[#8a6a54]">Maks</p>
              </div>
              <div>
                <p
                  className={`text-[2rem] font-bold leading-none ${
                    selectedCapacity.maxToken - selectedCapacity.usedToken <= 0
                      ? "text-[#d24f40]"
                      : selectedCapacity.maxToken - selectedCapacity.usedToken <=
                          selectedCapacity.maxToken * 0.2
                        ? "text-[#a27516]"
                        : "text-[#2d8a55]"
                  }`}
                >
                  {selectedCapacity.maxToken - selectedCapacity.usedToken}
                </p>
                <p className="mt-1 text-[11px] text-[#8a6a54]">Sisa</p>
              </div>
              <div>
                <p className="text-[2rem] font-bold leading-none text-[#1e140e]">
                  {selectedDateOrdersAll.length}
                </p>
                <p className="mt-1 text-[11px] text-[#8a6a54]">Orders</p>
              </div>
            </div>

            <div className="px-4 pb-4">
              <div className="h-2 rounded-full bg-[#eadbcf]">
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
              <p className="mt-2 text-right text-[11px] text-[#b28061]">
                {selectedUsagePercent}% kapasitas terpakai
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
                      {selectedCapacity.usedToken} / {selectedCapacity.maxToken}{" "}
                      token &mdash; sisa{" "}
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
              <button
                type="button"
                aria-label="Close popup"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-100"
                onClick={() => setIsDateOrdersPopupOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
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
                        {order.items?.[0]?.productName ?? order.product} -{" "}
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
        }

        .rbc-header {
          padding: 0.7rem 0;
          font-size: 0.68rem;
          font-weight: 700;
          color: #9b775e;
          border-bottom: 1px solid #ead9cd;
          background: #fff8f1;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .rbc-day-bg {
          transition: background-color 180ms ease;
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
          border-color: #ead9cd;
        }

        .rbc-month-view,
        .rbc-time-view {
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid #ead9cd;
          background: #fffdf9;
        }

        .rbc-event,
        .rbc-day-slot .rbc-background-event {
          box-shadow: none;
        }

        .rbc-month-row {
          min-height: 96px;
        }

        @media (min-width: 1280px) {
          .rbc-month-row {
            min-height: 128px;
          }
        }

        .rbc-date-cell {
          padding: 3px 4px 2px;
          overflow: hidden;
        }

        .rbc-month-view .rbc-row-content {
          pointer-events: none;
          overflow: hidden;
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
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
}


