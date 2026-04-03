"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/orders/formatters";
import { useOrders } from "@/components/bakery/store";
import {
  BarChart3,
  CheckCircle2,
  Factory,
  PackageCheck,
  Wallet,
} from "lucide-react";

const icons = [BarChart3, CheckCircle2, Factory, PackageCheck, Wallet];

export default function OrdersStats() {
  const { orders } = useOrders();

  const summaryCards = [
    { title: "Total Orders", value: String(orders.length) },
    {
      title: "Pending Approval",
      value: String(
        orders.filter((order) =>
          ["Inquiry", "Quoted", "DP Paid"].includes(order.orderStatus),
        ).length,
      ),
    },
    {
      title: "In Production",
      value: String(
        orders.filter((order) => order.orderStatus === "In Production").length,
      ),
    },
    {
      title: "Completed",
      value: String(
        orders.filter((order) =>
          ["Completed", "Delivered"].includes(order.orderStatus),
        ).length,
      ),
    },
    {
      title: "Total Revenue",
      value: formatCurrency(
        orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      ),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {summaryCards.map((card, index) => {
        const Icon = icons[index] ?? BarChart3;
        return (
          <Card key={card.title} className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-500">
                  {card.title}
                </CardTitle>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <Icon size={18} />
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">
              <div className="text-3xl font-semibold text-gray-900">
                {card.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
