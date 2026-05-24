import { isClosedOrderStatus } from "@/lib/bookings/order-status";

type DashboardOrder = {
  id: string;
  deliveryDate: string;
  orderStatus?: string | null;
};

export const LATE_ORDERS_PAGE_SIZE = 10;

export function getLateOrders<T extends DashboardOrder>(
  orders: T[],
  today: string,
): T[] {
  return orders.filter(
    (order) =>
      Boolean(order.deliveryDate) &&
      order.deliveryDate < today &&
      !isClosedOrderStatus(order.orderStatus),
  );
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * safePageSize;

  return {
    currentPage,
    totalPages,
    items: items.slice(start, start + safePageSize),
  };
}
