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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { type BakeryOrder, useOrders } from "@/components/bakery/store";
import {
  checkSlotAvailability,
  countConcurrentOrdersByTypeForSlot,
  getDeliverySlotsForDate,
  getSlotLimitByOrderType,
  type SlotOrderType,
} from "@/lib/bookings/operations";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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
    | {
        source: "internal";
        order: BakeryOrder;
      }
    | {
        source: "google";
        htmlLink?: string;
        status?: string;
      };
};

type GoogleCalendarApiEvent = {
  id?: string;
  summary?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: {
    private?: {
      bookingId?: string;
      bookingCode?: string;
    };
  };
};

function toDateKey(value: Date) {
  return format(value, "yyyy-MM-dd");
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
  if (![year, month, day].every((part) => Number.isFinite(part))) {
    return null;
  }
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
      timeMin: startOfWeek(date, { weekStartsOn: 1 }).toISOString(),
      timeMax: endOfWeek(date, { weekStartsOn: 1 }).toISOString(),
    };
  }

  return {
    timeMin: startOfMonth(date).toISOString(),
    timeMax: endOfMonth(date).toISOString(),
  };
}

type DayLoadTone = "normal" | "busy" | "full";

function slotStatusBadge(status: "AVAILABLE" | "ALMOST_FULL" | "FULL"): string {
  if (status === "FULL") return "FULL";
  if (status === "ALMOST_FULL") return "ALMOST FULL";
  return "AVAILABLE";
}

function slotStatusTextClass(status: "AVAILABLE" | "ALMOST_FULL" | "FULL"): string {
  if (status === "FULL") return "text-rose-700";
  if (status === "ALMOST_FULL") return "text-amber-700";
  return "text-emerald-700";
}

function slotStatusTone(status: "AVAILABLE" | "ALMOST_FULL" | "FULL"): string {
  if (status === "FULL") return "border-rose-200 bg-rose-50";
  if (status === "ALMOST_FULL") return "border-amber-200 bg-amber-50";
  return "border-emerald-200 bg-emerald-50";
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
  const { orders, syncOrderCalendar } = useOrders();
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [syncingIds, setSyncingIds] = useState<string[]>([]);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
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
  }>({
    connected: false,
    connectedEmail: null,
    calendarId: null,
  });

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
    const { timeMin, timeMax } = getCalendarRange(date, view);
    setIsLoadingGoogleEvents(true);
    try {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        maxResults: "500",
      });
      const response = await fetch(
        `/api/bookings/google-calendar/events?${params.toString()}`,
        {
          cache: "no-store",
        },
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
        resource: {
          source: "internal",
          order,
        },
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
          source: "google",
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

  const selectedDateKey = selectedDate ? toDateKey(selectedDate) : "";

  const selectedEvents = selectedDateKey
    ? events
        .filter((event) => safeToDateKey(event.start) === selectedDateKey)
        .sort((a, b) => a.start.getTime() - b.start.getTime())
    : [];

  const filteredSelectedEvents = selectedEvents.filter((entry) => {
    if (entry.resource.source !== "internal") return true;
    if (listFilterMode === "needs-sync") {
      return !entry.resource.order.simulations?.calendarEventCreated;
    }
    if (listFilterMode === "synced") {
      return Boolean(entry.resource.order.simulations?.calendarEventCreated);
    }
    return true;
  });

  const selectedCount = filteredSelectedEvents.length;

  const selectedDateLabel = selectedDate
    ? format(selectedDate, "EEEE, dd MMMM yyyy", { locale: localeId })
    : "Select a date";

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

    const { timeMin, timeMax } = getCalendarRange(currentDate, currentView);
    const minDate = safeToDateKey(new Date(timeMin));
    const maxDate = safeToDateKey(new Date(timeMax));
    if (!minDate || !maxDate) return null;

    return orders.filter((order) => {
      if (order.deliveryDate < minDate || order.deliveryDate > maxDate) {
        return false;
      }
      if (["Cancelled", "Delivered", "Completed"].includes(order.orderStatus)) {
        return false;
      }
      return !bookingIdsOnGoogle.has(order.id);
    }).length;
  }, [googleEvents, currentDate, currentView, orders]);

  const dayToneByDate = useMemo(() => {
    const result = new Map<string, DayLoadTone>();
    if (calendarViewMode !== "internal") return result;

    const rangeStart =
      currentView === Views.WEEK
        ? startOfWeek(currentDate, { weekStartsOn: 1 })
        : startOfMonth(currentDate);
    const rangeEnd =
      currentView === Views.WEEK
        ? endOfWeek(currentDate, { weekStartsOn: 1 })
        : endOfMonth(currentDate);

    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const dateKey = safeToDateKey(cursor);
      if (dateKey) {
        const slots = getDeliverySlotsForDate(dateKey);
        let tone: DayLoadTone = "normal";
        for (const slot of slots) {
          const customStatus = checkSlotAvailability(dateKey, slot, "CUSTOM", {
            orders,
          });
          const seasonalStatus = checkSlotAvailability(
            dateKey,
            slot,
            "SEASONAL",
            { orders },
          );
          if (customStatus === "FULL" || seasonalStatus === "FULL") {
            tone = "full";
            break;
          }
          if (
            customStatus === "ALMOST_FULL" ||
            seasonalStatus === "ALMOST_FULL"
          ) {
            tone = "busy";
          }
        }
        result.set(dateKey, tone);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }, [calendarViewMode, currentDate, currentView, orders]);

  const selectedDateSlotBoard = useMemo(() => {
    if (!selectedDateKey || calendarViewMode !== "internal") return [];
    const orderTypes: SlotOrderType[] = ["CUSTOM", "SEASONAL"];
    return getDeliverySlotsForDate(selectedDateKey).map((slot) => {
      const rows = orderTypes.map((orderType) => {
        const used = countConcurrentOrdersByTypeForSlot({
          orders,
          deliveryDate: selectedDateKey,
          deliverySlot: slot,
          orderType,
        });
        const status = checkSlotAvailability(selectedDateKey, slot, orderType, {
          orders,
        });
        return {
          orderType,
          used,
          limit: getSlotLimitByOrderType(orderType),
          status,
        };
      });
      return {
        slot,
        rows,
      };
    });
  }, [selectedDateKey, calendarViewMode, orders]);

  const selectedDateOverallStatus = useMemo<
    "AVAILABLE" | "ALMOST_FULL" | "FULL"
  >(() => {
    if (selectedDateSlotBoard.length === 0) return "AVAILABLE";

    let hasAlmostFull = false;
    for (const slot of selectedDateSlotBoard) {
      for (const row of slot.rows) {
        if (row.status === "FULL") return "FULL";
        if (row.status === "ALMOST_FULL") hasAlmostFull = true;
      }
    }

    return hasAlmostFull ? "ALMOST_FULL" : "AVAILABLE";
  }, [selectedDateSlotBoard]);

  const slotMessage =
    selectedDateOverallStatus === "FULL"
      ? "Ada slot yang sudah penuh"
      : selectedDateOverallStatus === "ALMOST_FULL"
        ? "Ada slot yang hampir penuh"
        : "Slot masih tersedia";

  const DateHeader = ({ date, label }: DateHeaderProps) => {
    const dateKey = safeToDateKey(date);
    const count = dateKey ? (ordersByDate.get(dateKey)?.length ?? 0) : 0;
    return (
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        {count > 0 && (
          <span className="text-[10px] font-semibold text-indigo-600">
            {count} orders
          </span>
        )}
      </div>
    );
  };

  const handleSyncSingle = async (orderId: string) => {
    if (syncingIds.includes(orderId)) return;
    setSyncingIds((prev) => [...prev, orderId]);
    try {
      await syncOrderCalendar(orderId);
    } finally {
      setSyncingIds((prev) => prev.filter((id) => id !== orderId));
    }
  };

  const handleSyncAllSelectedDate = async () => {
    if (calendarViewMode !== "internal") {
      toast.message("Mode Google tidak membutuhkan re-sync internal.");
      return;
    }

    const selectedOrders = filteredSelectedEvents.flatMap((entry) =>
      entry.resource.source === "internal" ? [entry.resource.order] : [],
    );

    if (!selectedOrders.length || isSyncingAll) return;
    setIsSyncingAll(true);
    try {
      for (const order of selectedOrders) {
        await syncOrderCalendar(order.id);
      }
      toast.success("Semua order pada tanggal terpilih berhasil di-sync.");
    } catch {
      toast.error("Sebagian sync gagal. Coba ulang untuk order tertentu.");
    } finally {
      setIsSyncingAll(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Delivery Calendar"
        description="Visual scheduling board for delivery workload, slot load, and quick booking navigation."
        icon={CalendarDays}
      />

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
        </CardContent>
      </Card>

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
            onSelectSlot={(slotInfo) => setSelectedDate(slotInfo.start)}
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
              const tone = dayToneByDate.get(toDateKey(date)) ?? "normal";
              if (tone === "full") {
                return { className: "rbc-day-full" };
              }
              if (tone === "busy") {
                return { className: "rbc-day-busy" };
              }
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

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{" "}
              Slot available
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Slot
              almost full
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Slot
              full
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

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Orders on {selectedDateLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-6 pb-6 pt-0">
          {!selectedDate ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-sm text-gray-500">
              Click a date in the calendar to view its delivery schedule.
            </div>
          ) : filteredSelectedEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-sm text-gray-500">
              No entries match current filters on this date.
            </div>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-1 gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">
                    Total Orders
                  </p>
                  <p className="mt-1 text-xl font-bold text-indigo-900">
                    {selectedCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">
                    Capacity Status
                  </p>
                  <p
                    className={`mt-1 text-sm font-semibold ${slotStatusTextClass(selectedDateOverallStatus)}`}
                  >
                    {slotMessage}
                  </p>
                </div>
              </div>

              {calendarViewMode === "internal" &&
              selectedDateSlotBoard.length > 0 ? (
                <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Slot Availability Board
                    </p>
                    <span
                      className={`text-xs font-semibold ${slotStatusTextClass(selectedDateOverallStatus)}`}
                    >
                      {slotStatusBadge(selectedDateOverallStatus)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {selectedDateSlotBoard.map((slotEntry) => (
                      <div
                        key={slotEntry.slot}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-2"
                      >
                        <p className="text-xs font-semibold text-gray-600">
                          {slotEntry.slot}
                        </p>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {slotEntry.rows.map((row) => (
                            <div
                              key={row.orderType}
                              className={`rounded-lg border px-3 py-2 ${slotStatusTone(row.status)}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                                  {row.orderType === "SEASONAL"
                                    ? "Seasonal"
                                    : "Custom"}
                                </span>
                                <span
                                  className={`text-[11px] font-bold ${slotStatusTextClass(row.status)}`}
                                >
                                  {slotStatusBadge(row.status)}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-gray-600">
                                {row.used}/{row.limit} orders
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mb-3">
                <Button
                  type="button"
                  variant="outline"
                  className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  onClick={handleSyncAllSelectedDate}
                  disabled={
                    calendarViewMode !== "internal" ||
                    !filteredSelectedEvents.length ||
                    isSyncingAll
                  }
                >
                  {isSyncingAll
                    ? "Syncing..."
                    : "Re-sync Calendar for Selected Date"}
                </Button>
              </div>

              {filteredSelectedEvents.map((entry) => {
                if (entry.resource.source === "google") {
                  return (
                    <div
                      key={entry.id}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3 text-left text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900">
                          {entry.title}
                        </p>
                        <p className="text-xs text-gray-500">
                          {format(entry.start, "HH:mm")} -{" "}
                          {format(entry.end, "HH:mm")}
                        </p>
                      </div>
                      {entry.resource.htmlLink ? (
                        <a
                          href={entry.resource.htmlLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  );
                }

                const order = entry.resource.order;
                const isSyncing = syncingIds.includes(order.id);

                return (
                  <div
                    key={entry.id}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-left text-sm transition hover:border-indigo-200 hover:bg-indigo-50/40"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/bakery/bookings/${order.id}`)
                      }
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="font-semibold text-gray-900">
                        {order.customerName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {order.items?.[0]?.productName ?? order.product} -{" "}
                        {order.deliverySlot}
                      </p>
                    </button>

                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                        style={{
                          backgroundColor: statusColor(order.orderStatus),
                        }}
                      >
                        {order.orderStatus}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 border-indigo-200 px-3 text-xs text-indigo-700 hover:bg-indigo-50"
                        onClick={() => void handleSyncSingle(order.id)}
                        disabled={isSyncing || isSyncingAll}
                      >
                        {isSyncing ? "Syncing..." : "Re-sync"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </CardContent>
      </Card>

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

        .rbc-day-busy {
          background: #fffbeb;
        }

        .rbc-day-full {
          background: #fff1f2;
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
