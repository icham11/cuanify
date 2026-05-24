import { describe, expect, it } from "vitest";

import {
  getLateOrders,
  LATE_ORDERS_PAGE_SIZE,
  paginateItems,
} from "@/lib/bakery/dashboard-orders";

describe("dashboard late orders helpers", () => {
  it("excludes completed and fulfilled late orders from notifications", () => {
    const orders = [
      { id: "1", deliveryDate: "2026-05-01", orderStatus: "In Production" },
      { id: "2", deliveryDate: "2026-05-02", orderStatus: "Ready" },
      { id: "3", deliveryDate: "2026-05-03", orderStatus: "Completed" },
      { id: "4", deliveryDate: "2026-05-04", orderStatus: "Delivery" },
      { id: "5", deliveryDate: "2026-05-05", orderStatus: "Delivered" },
      { id: "6", deliveryDate: "2026-05-06", orderStatus: "Cancelled" },
    ];

    expect(getLateOrders(orders, "2026-05-24").map((order) => order.id)).toEqual([
      "1",
      "2",
    ]);
  });

  it("removes an overdue order from the notification as soon as it becomes completed", () => {
    const before = [
      { id: "late-1", deliveryDate: "2026-05-10", orderStatus: "In Production" },
      { id: "late-2", deliveryDate: "2026-05-11", orderStatus: "Ready" },
    ];
    const after = before.map((order) =>
      order.id === "late-1"
        ? { ...order, orderStatus: "Completed" }
        : order,
    );

    expect(getLateOrders(before, "2026-05-24")).toHaveLength(2);
    expect(getLateOrders(after, "2026-05-24").map((order) => order.id)).toEqual([
      "late-2",
    ]);
  });

  it("paginates late orders with ten items per page", () => {
    const lateOrders = Array.from({ length: 19 }, (_, index) => ({
      id: `late-${index + 1}`,
      deliveryDate: "2026-05-01",
      orderStatus: "In Production",
    }));

    const firstPage = paginateItems(lateOrders, 1, LATE_ORDERS_PAGE_SIZE);
    const secondPage = paginateItems(lateOrders, 2, LATE_ORDERS_PAGE_SIZE);

    expect(firstPage.totalPages).toBe(2);
    expect(firstPage.items).toHaveLength(10);
    expect(firstPage.items[0]?.id).toBe("late-1");
    expect(firstPage.items[9]?.id).toBe("late-10");
    expect(secondPage.items).toHaveLength(9);
    expect(secondPage.items[0]?.id).toBe("late-11");
    expect(secondPage.items[8]?.id).toBe("late-19");
  });
});
