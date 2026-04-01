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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { type BakeryOrder, useOrders } from "@/components/bakery/store";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getCalendarStatus,
  type CalendarStatus,
} from "@/lib/calendar/getCalendarStatus";
import { useCalendarCapacity } from "@/hooks/useCalendarCapacity";
import CalendarCell from "@/components/calendar/CalendarCell";

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

function parseOrderDateTime(deliveryDate?: string, deliverySlot?: string) {
  if (!deliveryDate || !deliveryDate.includes("-")) return null;
  const [year, month, day] = deliveryDate.split("-").map(Number);
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
  if (status === "Confirmed") return "#2563eb";
  if (status === "In Production") return "#f97316";
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
  onView,
  view,
}: ToolbarProps<CalendarOrderEvent, object>) {
  const label = format(date, "MMMM yyyy", { locale: localeId });

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate("PREV")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-200 bg-white text-indigo-700 transition hover:bg-indigo-100"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate("NEXT")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-200 bg-white text-indigo-700 transition hover:bg-indigo-100"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate("TODAY")}
          className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
        >
          Today
        </button>
      </div>
      <h3 className="text-base font-semibold text-indigo-900 sm:text-lg">
        {label}
      </h3>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onView(Views.MONTH)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
            view === Views.MONTH
              ? "bg-indigo-600 text-white"
              : "border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100"
          }`}
        >
          Month
        </button>
        <button
          type="button"
          onClick={() => onView(Views.WEEK)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
            view === Views.WEEK
              ? "bg-indigo-600 text-white"
              : "border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100"
          }`}
        >
          Week
        </button>
      </div>
    </div>
  );
}

export default function BakeryCalendarPage() {
  const router = useRouter();
  const { orders } = useOrders();
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

  // ─── Token Capacity System ──────────────────────────────────────────────────
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

  const statusByDate = useMemo(() => {
    const result = new Map<string, CalendarStatus>();
    const now = new Date();
    const cursor = new Date(calendarRange.start);
    while (cursor <= calendarRange.end) {
      const dateKey = safeToDateKey(cursor);
      if (dateKey) {
        const capacity = getCapacity(dateKey);
        const status = getCalendarStatus(
          {
            usedToken: capacity.usedToken,
            maxToken: capacity.maxToken,
            date: dateKey,
          },
          now,
        );
        result.set(dateKey, status);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [calendarRange, getCapacity]);

  const selectedDateKey = selectedDate ? toDateKey(selectedDate) : "";
  const selectedCapacity = selectedDateKey
    ? getCapacity(selectedDateKey)
    : null;
  const selectedStatus = selectedDateKey
    ? (statusByDate.get(selectedDateKey) ?? "AVAILABLE")
    : "AVAILABLE";

  // ─── OAuth ──────────────────────────────────────────────────────────────────
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

  // ─── Events ─────────────────────────────────────────────────────────────────
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

  const ordersByDate = useMemo(() => {
    const result = new Map<string, BakeryOrder[]>();
    filteredInternalOrders.forEach((order) => {
      const dateOrders = result.get(order.deliveryDate) ?? [];
      dateOrders.push(order);
      result.set(order.deliveryDate, dateOrders);
    });
    return result;
  }, [filteredInternalOrders]);

  const selectedDateLabel = selectedDate
    ? format(selectedDate, "EEEE, dd MMMM yyyy", { locale: localeId })
    : "Select a date";

  const selectedDateOrdersAll = useMemo(() => {
    if (!selectedDateKey) return [];
    return orders
      .filter((order) => order.deliveryDate === selectedDateKey)
      .slice()
      .sort((a, b) => a.deliverySlot.localeCompare(b.deliverySlot));
  }, [orders, selectedDateKey]);

  // ─── Stats ──────────────────────────────────────────────────────────────────
  const todayKey = toDateKey(new Date());
  const internalTodayCount = orders.filter(
    (order) => order.deliveryDate === todayKey,
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
      if (order.deliveryDate < minDate || order.deliveryDate > maxDate)
        return false;
      if (["Cancelled", "Delivered", "Completed"].includes(order.orderStatus))
        return false;
      return !bookingIdsOnGoogle.has(order.id);
    }).length;
  }, [googleEvents, currentDate, currentView, orders]);

  // ─── Token status message ──────────────────────────────────────────────────
  const selectedStatusMessage = useMemo(() => {
    if (!selectedCapacity) return "";
    switch (selectedStatus) {
      case "PAST":
        return "Tanggal sudah terlewat";
      case "BLOCKED":
        return "Tanggal libur admin — tidak bisa menerima order";
      case "FULL":
        return "Kapasitas penuh — tidak bisa menerima order baru";
      case "CUTOFF":
        return "Closed (H-1) — cutoff jam 10:00 sudah lewat";
      case "WARNING":
        return "Hampir penuh — segera capai batas kapasitas";
      case "AVAILABLE":
      default:
        return "Kapasitas masih tersedia";
    }
  }, [selectedStatus, selectedCapacity]);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const openDateOrdersPopup = (date: Date) => {
    const dateKey = toDateKey(date);
    const status = statusByDate.get(dateKey) ?? "AVAILABLE";
    if (
      status === "PAST" ||
      status === "BLOCKED" ||
      status === "FULL" ||
      status === "CUTOFF"
    )
      return;
    setSelectedDate(date);
    setIsDateOrdersPopupOpen(true);
  };

  const DateHeader = ({ date, label }: DateHeaderProps) => {
    const dateKey = safeToDateKey(date);
    const count = dateKey ? (ordersByDate.get(dateKey)?.length ?? 0) : 0;
    const capacity = dateKey
      ? getCapacity(dateKey)
      : { usedToken: 0, maxToken: 600, date: dateKey };
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

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Delivery Calendar"
        description="Visual scheduling board for delivery workload, token capacity, and quick booking navigation."
        icon={CalendarDays}
      />

      {/* Google Calendar Account Card */}
      <Card className="rounded-xl border-indigo-100 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="text-sm">
            <p className="font-semibold text-gray-900">
              Google Calendar Account
            </p>
            <p className="text-xs text-gray-600">
              {isOAuthLoading
                ? "Checking OAuth status..."
                : oauthStatus.connected
                  ? `Connected as ${oauthStatus.connectedEmail || "Google user"} (${oauthStatus.calendarId || "primary"})`
                  : "Not connected via OAuth. Currently using service account fallback."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={calendarViewMode === "internal" ? "default" : "outline"}
              className={
                calendarViewMode === "internal"
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              }
              onClick={() => setCalendarViewMode("internal")}
            >
              Internal Orders
            </Button>
            <Button
              type="button"
              variant={calendarViewMode === "google" ? "default" : "outline"}
              className={
                calendarViewMode === "google"
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              }
              onClick={() => setCalendarViewMode("google")}
            >
              Google Events
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              onClick={connectGoogleCalendar}
            >
              {oauthStatus.connected
                ? "Reconnect OAuth"
                : "Connect Google OAuth"}
            </Button>
            {oauthStatus.connected ? (
              <Button
                type="button"
                variant="outline"
                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                onClick={() => void disconnectGoogleCalendar()}
                disabled={isDisconnectingOAuth}
              >
                {isDisconnectingOAuth ? "Disconnecting..." : "Disconnect"}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Stats Bar */}
      <Card className="rounded-xl border-indigo-100 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700">
              Internal Today: {internalTodayCount}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
              Needs Sync: {needsSyncCount}
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
              Google Today: {googleTodayCount}
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">
              {mismatchCount === null
                ? "Mismatch: load Google mode first"
                : `Mismatch in view: ${mismatchCount}`}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              onClick={() => void fetchGoogleEvents(currentDate, currentView)}
              disabled={isLoadingGoogleEvents}
            >
              {isLoadingGoogleEvents
                ? "Refreshing..."
                : "Refresh Google Snapshot"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={refetchCapacity}
              disabled={isCapacityLoading}
            >
              {isCapacityLoading ? "Loading..." : "Refresh Capacity"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Capacity Error Banner */}
      {capacityError ? (
        <Card className="rounded-xl border-rose-200 bg-rose-50 shadow-sm">
          <CardContent className="px-6 py-3">
            <p className="text-sm font-medium text-rose-700">
              Failed to load capacity data: {capacityError}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-2 border-rose-200 text-rose-700 hover:bg-rose-100"
              onClick={refetchCapacity}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Quick Navigation + Filters */}
      <Card className="rounded-xl border-indigo-100 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              onClick={() => setSelectedDate(new Date())}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setSelectedDate(tomorrow);
              }}
            >
              Tomorrow
            </Button>
          </div>
          {calendarViewMode === "internal" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={listFilterMode === "all" ? "default" : "outline"}
                className={
                  listFilterMode === "all"
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                }
                onClick={() => setListFilterMode("all")}
              >
                All
              </Button>
              <Button
                type="button"
                variant={
                  listFilterMode === "needs-sync" ? "default" : "outline"
                }
                className={
                  listFilterMode === "needs-sync"
                    ? "bg-amber-600 text-white hover:bg-amber-700"
                    : "border-amber-200 text-amber-700 hover:bg-amber-50"
                }
                onClick={() => setListFilterMode("needs-sync")}
              >
                Needs Sync
              </Button>
              <Button
                type="button"
                variant={listFilterMode === "synced" ? "default" : "outline"}
                className={
                  listFilterMode === "synced"
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                }
                onClick={() => setListFilterMode("synced")}
              >
                Synced
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Loading State */}
      {isCapacityLoading ? (
        <Card className="rounded-xl border-indigo-100 shadow-sm">
          <CardContent className="flex items-center justify-center gap-3 px-6 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-indigo-600">
              Loading capacity data...
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Calendar */}
      <Card className="rounded-xl border-indigo-100 shadow-sm">
        <CardContent className="px-3 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
          <Calendar
            localizer={localizer}
            culture="id"
            events={events}
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
                borderRadius: "10px",
                padding: "2px 6px",
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
            className="rounded-xl"
          />

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> Passed
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" /> Libur
              Admin
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{" "}
              Available
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Almost
              Full (≥80%)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Full
              (100%)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" /> Closed
              (H-1)
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#2563eb" }}
              />{" "}
              Confirmed
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#f97316" }}
              />{" "}
              In Production
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#7c3aed" }}
              />{" "}
              Ready
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#16a34a" }}
              />{" "}
              Delivered
            </span>
          </div>

          {calendarViewMode === "google" && isLoadingGoogleEvents ? (
            <p className="mt-2 text-xs text-indigo-600">
              Loading Google Calendar events...
            </p>
          ) : null}
        </CardContent>
      </Card>

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
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-2xl"
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
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
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
                      token used
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
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50"
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

      {/* Global Styles */}
      <style jsx global>{`
        .rbc-calendar {
          font-family: inherit;
        }

        .rbc-header {
          padding: 0.55rem 0;
          font-size: 0.75rem;
          font-weight: 700;
          color: #4b5563;
          border-bottom: 1px solid #e5e7eb;
          background: #f8fafc;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .rbc-day-bg {
          transition: background-color 180ms ease;
        }

        .rbc-day-normal {
          background: #ffffff;
        }

        .rbc-day-warning {
          background: #fffbeb;
        }

        .rbc-day-past {
          background: #f3f4f6;
        }

        .rbc-day-blocked {
          background: repeating-linear-gradient(
            -45deg,
            #fff1f2,
            #fff1f2 8px,
            #ffe4e6 8px,
            #ffe4e6 16px
          );
        }

        .rbc-day-full {
          background: #fef2f2;
        }

        .rbc-day-cutoff {
          background: repeating-linear-gradient(
            -45deg,
            #fff1f2,
            #fff1f2 8px,
            #ffe4e6 8px,
            #ffe4e6 16px
          );
        }

        .rbc-today {
          background-color: #eef2ff;
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
          border-color: #e5e7eb;
        }

        .rbc-event,
        .rbc-day-slot .rbc-background-event {
          box-shadow: none;
        }

        .rbc-month-row {
          min-height: 112px;
        }

        .rbc-date-cell {
          padding: 4px 6px;
        }

        .rbc-date-cell > a {
          color: #111827;
          font-weight: 600;
          text-decoration: none;
        }

        .rbc-off-range-bg {
          background: #f9fafb;
        }

        .rbc-show-more {
          color: #4f46e5;
          font-size: 0.72rem;
          font-weight: 600;
          background: transparent;
        }
      `}</style>
    </div>
  );
}
