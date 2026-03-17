import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BakeryOrder } from "@/components/bakery/store";

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default function BookingStats({ orders }: { orders: BakeryOrder[] }) {
  const todayDate = new Date();
  const today = formatDate(todayDate);
  const tomorrowDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
  const tomorrow = formatDate(tomorrowDate);

  const todayOrders = orders.filter((order) => order.deliveryDate === today).length;
  const pendingApproval = orders.filter((order) => order.orderStatus === "Pending").length;
  const inProduction = orders.filter((order) => order.orderStatus === "In Production").length;
  const upcoming = orders.filter(
    (order) => order.deliveryDate >= today && order.deliveryDate <= tomorrow
  ).length;

  const stats = [
    { label: "Today Orders", value: todayOrders },
    { label: "Pending Approval", value: pendingApproval },
    { label: "In Production", value: inProduction },
    { label: "Upcoming Deliveries", value: upcoming },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="rounded-xl shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-sm text-gray-600">
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <div className="text-2xl font-semibold text-gray-900">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
