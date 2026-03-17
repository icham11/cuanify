"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import StatusBadge from "@/components/bakery/shared/StatusBadge";
import PaymentBadge from "@/components/bakery/shared/PaymentBadge";
import PriceSummaryCard from "@/components/bakery/bookings/PriceSummaryCard";
import OrderStepper from "@/components/bakery/shared/OrderStepper";
import OrderTimeline from "@/components/bakery/shared/OrderTimeline";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileText } from "lucide-react";
import { useOrders } from "@/components/bakery/store";
import { useParams } from "next/navigation";

export default function OrderDetailPage() {
  const { orders, approveOrder } = useOrders();
  const params = useParams();
  const orderId = typeof params?.id === "string" ? params.id : "";

  const order = useMemo(
    () => orders.find((item) => item.id === orderId),
    [orders, orderId]
  );

  const totalPrice = order?.totalPrice ?? 0;

  const handleApprove = () => {
    if (!order) return;
    approveOrder(order.id);
  };

  if (!order) {
    return (
      <div className="space-y-6 pb-10">
        <GradientPageHeader
          title="Order Detail"
          description="We could not find this booking."
          icon={FileText}
        />
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
          Order not found. Please return to the bookings list.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Order Detail"
        description="Review the booking, confirm details, and move the order forward."
        icon={FileText}
        actions={
          <Button
            onClick={handleApprove}
            disabled={order.orderStatus !== "Pending"}
            className={
              order.orderStatus !== "Pending"
                ? "gap-2"
                : "gap-2 bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500"
            }
            variant={order.orderStatus !== "Pending" ? "secondary" : "default"}
          >
            <CheckCircle2 size={16} />
            {order.orderStatus !== "Pending" ? "Approved" : "Approve Order"}
          </Button>
        }
      />

      {order.orderStatus !== "Pending" && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">
          Order approved. Resi generated: {order.resi}
        </div>
      )}

      <OrderStepper status={order.orderStatus} />

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Customer Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-6 pb-6 pt-0 text-sm text-gray-700">
              <p>
                <span className="font-semibold">Name:</span> {order.customerName}
              </p>
              <p>
                <span className="font-semibold">Phone:</span> {order.customerPhone ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Address:</span> {order.customerAddress ?? "-"}
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-6 pb-6 pt-0 text-sm text-gray-700">
              <p>
                <span className="font-semibold">Cake Type:</span> {order.cakeType ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Size:</span> {order.size ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Delivery Date:</span> {order.deliveryDate}
              </p>
              <p>
                <span className="font-semibold">Add-ons:</span> {order.addOns ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Notes:</span> {order.notes ?? "-"}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <PriceSummaryCard
            basePrice={order.basePrice ?? 0}
            addOnTotal={order.addOnTotal ?? 0}
            deliveryFee={order.deliveryFee ?? 0}
            totalPrice={totalPrice}
          />
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-6 pb-6 pt-0">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Payment Status</span>
                <PaymentBadge status={order.paymentStatus} />
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Order Status</span>
                <StatusBadge status={order.orderStatus} />
              </div>
            </CardContent>
          </Card>

          <OrderTimeline
            status={order.orderStatus}
            deliveryDate={order.deliveryDate}
          />
        </div>
      </div>
    </div>
  );
}
