import { addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BakeryOrder } from "@/components/bakery/store";
import {
  isOpenOrderStatus,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
import { toIsoDateString } from "@/lib/helpers/date-normalization";

function formatDate(value: Date) {
  return toIsoDateString(value);
}

export default function BookingStats({ orders }: { orders: BakeryOrder[] }) {
  const todayDate = new Date();
  const today = formatDate(todayDate);
  const tomorrowDate = addDays(todayDate, 1);
  const tomorrow = formatDate(tomorrowDate);

  const todayOrders = orders.filter(
    (order) => order.deliveryDate === today,
  ).length;
  const activeQueue = orders.filter((order) =>
    isOpenOrderStatus(order.orderStatus),
  ).length;
  const inProduction = orders.filter(
    (order) => normalizeOrderStatus(order.orderStatus) === "In Production",
  ).length;
  const upcoming = orders.filter(
    (order) => order.deliveryDate >= today && order.deliveryDate <= tomorrow,
  ).length;

  const stats = [
    { label: "Today", value: todayOrders },
    { label: "Queue Aktif", value: activeQueue },
    { label: "In Production", value: inProduction },
    { label: "Hari ini + Besok", value: upcoming },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="rounded-2xl border-[var(--crumbella-border)] bg-[var(--crumbella-surface)]">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--crumbella-muted)]">
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-0">
            <div className="text-2xl font-semibold text-[var(--foreground)]">
              {stat.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
