"use client";

import { useMemo, useState } from "react";
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
import { addHours, format, getDay, parse, startOfWeek } from "date-fns";
import { id as localeId } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { type BakeryOrder, useOrders } from "@/components/bakery/store";
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
  resource: BakeryOrder;
};

function toDateKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function parseOrderDateTime(deliveryDate: string, deliverySlot?: string) {
  const [year, month, day] = deliveryDate.split("-").map(Number);
  const [hours, minutes] = (deliverySlot ?? "09:00").split(":").map(Number);
  return new Date(
    year,
    (month || 1) - 1,
    day || 1,
    hours || 9,
    minutes || 0,
    0,
    0,
  );
}

function statusColor(status: BakeryOrder["orderStatus"]) {
  if (status === "Confirmed") return "#2563eb";
  if (status === "In Production") return "#f97316";
  if (status === "Ready") return "#7c3aed";
  if (status === "Delivered" || status === "Completed") return "#16a34a";
  return "#4f46e5";
}

function loadTone(totalOrders: number) {
  if (totalOrders >= 7) return "full";
  if (totalOrders >= 4) return "busy";
  return "normal";
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

  const events = useMemo<CalendarOrderEvent[]>(() => {
    return orders.map((order) => {
      const start = parseOrderDateTime(order.deliveryDate, order.deliverySlot);
      return {
        id: order.id,
        title: `${order.customerName} - ${order.items?.[0]?.productName ?? order.product}`,
        start,
        end: addHours(start, 1),
        resource: order,
      };
    });
  }, [orders]);

  const ordersByDate = useMemo(() => {
    const result = new Map<string, BakeryOrder[]>();
    orders.forEach((order) => {
      const dateOrders = result.get(order.deliveryDate) ?? [];
      dateOrders.push(order);
      result.set(order.deliveryDate, dateOrders);
    });
    return result;
  }, [orders]);

  const selectedDateKey = selectedDate ? toDateKey(selectedDate) : "";

  const selectedOrders = selectedDateKey
    ? orders
        .filter((order) => order.deliveryDate === selectedDateKey)
        .sort((a, b) => a.deliverySlot.localeCompare(b.deliverySlot))
    : [];

  const selectedCount = selectedOrders.length;
  const slotMessage =
    selectedCount >= 4 ? "Slots almost full" : "Slots available";

  const selectedDateLabel = selectedDate
    ? format(selectedDate, "EEEE, dd MMMM yyyy", { locale: localeId })
    : "Select a date";

  const DateHeader = ({ date, label }: DateHeaderProps) => {
    const count = ordersByDate.get(toDateKey(date))?.length ?? 0;
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
            onSelectEvent={(event) =>
              router.push(`/bakery/bookings/${event.id}`)
            }
            eventPropGetter={(event) => ({
              style: {
                backgroundColor: statusColor(event.resource.orderStatus),
                color: "#ffffff",
                border: "none",
                borderRadius: "10px",
                padding: "2px 6px",
              },
            })}
            dayPropGetter={(date) => {
              const count = ordersByDate.get(toDateKey(date))?.length ?? 0;
              const tone = loadTone(count);
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
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" /> 0-3
              orders
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> 4-6
              orders
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> 7+
              orders
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
          ) : selectedOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-sm text-gray-500">
              No orders scheduled for this date.
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
                    className={`mt-1 text-sm font-semibold ${selectedCount >= 4 ? "text-amber-700" : "text-emerald-700"}`}
                  >
                    {slotMessage}
                  </p>
                </div>
              </div>

              <div className="mb-3">
                <Button
                  type="button"
                  variant="outline"
                  className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  onClick={handleSyncAllSelectedDate}
                  disabled={!selectedOrders.length || isSyncingAll}
                >
                  {isSyncingAll
                    ? "Syncing..."
                    : "Re-sync Calendar for Selected Date"}
                </Button>
              </div>

              {selectedOrders.map((order) => {
                const isSyncing = syncingIds.includes(order.id);

                return (
                  <div
                    key={order.id}
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
