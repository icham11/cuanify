import { addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BakeryOrder } from "@/components/bakery/store";
import {
  DAILY_PRODUCTION_TOKEN_LIMIT,
  evaluateProductionTokenCapacity,
} from "@/lib/bookings/operations";
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
  const pendingApproval = orders.filter((order) =>
    ["Inquiry", "Quoted", "DP Paid"].includes(order.orderStatus),
  ).length;
  const inProduction = orders.filter(
    (order) => order.orderStatus === "In Production",
  ).length;
  const upcoming = orders.filter(
    (order) => order.deliveryDate >= today && order.deliveryDate <= tomorrow,
  ).length;

  const tokenToday = evaluateProductionTokenCapacity({
    orders,
    deliveryDate: today,
    incomingItems: [],
  });
  const remainingToday = Math.max(0, tokenToday.allowed - tokenToday.usedToday);
  const isClosedToday = remainingToday <= 0;

  const stats = [
    { label: "Today Orders", value: todayOrders },
    { label: "Pending Approval", value: pendingApproval },
    { label: "In Production", value: inProduction },
    { label: "Upcoming Deliveries", value: upcoming },
    {
      label: "Token Tersisa Hari Ini",
      value: `${remainingToday}`,
      helper: `${tokenToday.usedToday}/${tokenToday.allowed} terpakai${
        tokenToday.allowed > DAILY_PRODUCTION_TOKEN_LIMIT
          ? ` (carry-over ${tokenToday.allowed - DAILY_PRODUCTION_TOKEN_LIMIT})`
          : ""
      }`,
      tone: isClosedToday
        ? "danger"
        : remainingToday <= 50
          ? "warning"
          : "normal",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className={`rounded-xl shadow-sm ${
            stat.tone === "danger"
              ? "border-rose-200 bg-rose-50/40"
              : stat.tone === "warning"
                ? "border-amber-200 bg-amber-50/40"
                : ""
          }`}
        >
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-sm text-gray-600">
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <div className="text-2xl font-semibold text-gray-900">
              {stat.value}
            </div>
            {stat.helper ? (
              <p
                className={`mt-1 text-xs font-medium ${
                  stat.tone === "danger"
                    ? "text-rose-700"
                    : stat.tone === "warning"
                      ? "text-amber-700"
                      : "text-gray-500"
                }`}
              >
                {isClosedToday && stat.label === "Token Tersisa Hari Ini"
                  ? "Closed: token harian habis"
                  : stat.helper}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
