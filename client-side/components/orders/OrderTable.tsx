import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PaymentStatusBadge } from "@/components/orders/PaymentStatusBadge";
import { formatCurrency } from "@/components/orders/formatters";

export interface BookingOrder {
  id: string;
  resi: string;
  customerName: string;
  deliveryDate: string;
  product: string;
  totalPrice: number;
  paymentStatus: string;
  orderStatus: string;
}

interface OrderTableProps {
  orders: BookingOrder[];
}

export function OrderTable({ orders }: OrderTableProps) {
  return (
    <Table className="min-w-225">
      <TableHeader>
        <TableRow>
          <TableHead>Resi</TableHead>
          <TableHead>Customer Name</TableHead>
          <TableHead>Delivery Date</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Total Price</TableHead>
          <TableHead>Payment Status</TableHead>
          <TableHead>Order Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="font-semibold text-gray-900">
              {order.resi}
            </TableCell>
            <TableCell>{order.customerName}</TableCell>
            <TableCell>{order.deliveryDate}</TableCell>
            <TableCell>{order.product}</TableCell>
            <TableCell>{formatCurrency(order.totalPrice)}</TableCell>
            <TableCell>
              <PaymentStatusBadge status={order.paymentStatus} />
            </TableCell>
            <TableCell>
              <OrderStatusBadge status={order.orderStatus} />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Link
                  href={`/bakery/bookings/${order.id}`}
                  className="inline-flex h-8 items-center justify-center rounded-xl border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  View
                </Link>
                <Button variant="ghost" size="sm">
                  Message
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
