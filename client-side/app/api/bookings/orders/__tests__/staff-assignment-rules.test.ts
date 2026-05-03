declare const describe: {
  (name: string, fn: () => void): void;
  skip: (name: string, fn: () => void) => void;
};
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toThrow: (message?: string | RegExp) => void;
};

import {
  validateAssignmentTransitionRules,
  validateProjectedStaffDailyTokenLimit,
} from "../staff-assignment-rules";

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ORD-1",
    orderStatus: "Inquiry",
    assignedStaffUserId: null,
    deliveryDate: "2026-04-10",
    items: [
      {
        category: "Cake",
        quantity: 10,
        tokenDifficulty: "simple",
      },
    ],
    ...overrides,
  };
}

function makeExistingAssignment(overrides: Record<string, unknown> = {}) {
  return {
    external_id: "ORD-1",
    order_status: "Inquiry",
    assigned_staff_user_id: null,
    ...overrides,
  };
}

describe("Orders API staff assignment and status transition rules", () => {
  it("rejects status change when order is still unassigned", () => {
    const orders = [
      makeOrder({
        orderStatus: "Ready",
        assignedStaffUserId: null,
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        order_status: "Inquiry",
        assigned_staff_user_id: null,
      }),
    ];

    expect(() =>
      validateAssignmentTransitionRules({
        orders,
        existingAssignments,
        roleName: "Owner",
        userId: 1,
      }),
    ).toThrow("Order must be assigned before changing status");
  });

  it("allows cancelling unassigned order", () => {
    const orders = [
      makeOrder({
        orderStatus: "Cancelled",
        assignedStaffUserId: null,
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        order_status: "Inquiry",
        assigned_staff_user_id: null,
      }),
    ];

    validateAssignmentTransitionRules({
      orders,
      existingAssignments,
      roleName: "Owner",
      userId: 1,
    });
  });

  it("rejects staff unassign action for already claimed order", () => {
    const orders = [
      makeOrder({
        assignedStaffUserId: null,
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        assigned_staff_user_id: 22,
      }),
    ];

    expect(() =>
      validateAssignmentTransitionRules({
        orders,
        existingAssignments,
        roleName: "Staff",
        userId: 22,
      }),
    ).toThrow("tidak bisa dilepas");
  });

  it("rejects staff transfer action to another staff", () => {
    const orders = [
      makeOrder({
        assignedStaffUserId: 33,
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        assigned_staff_user_id: 22,
      }),
    ];

    expect(() =>
      validateAssignmentTransitionRules({
        orders,
        existingAssignments,
        roleName: "Staff",
        userId: 22,
      }),
    ).toThrow("Hanya owner/admin yang dapat memindahkan assignment order");
  });

  it("allows owner transfer action", () => {
    const orders = [
      makeOrder({
        assignedStaffUserId: 33,
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        assigned_staff_user_id: 22,
      }),
    ];

    validateAssignmentTransitionRules({
      orders,
      existingAssignments,
      roleName: "Owner",
      userId: 1,
    });
  });

  it("allows admin transfer action", () => {
    const orders = [
      makeOrder({
        assignedStaffUserId: 33,
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        assigned_staff_user_id: 22,
      }),
    ];

    validateAssignmentTransitionRules({
      orders,
      existingAssignments,
      roleName: "Admin",
      userId: 7,
    });
  });

  it("allows staff to claim unassigned order for self", () => {
    const orders = [
      makeOrder({
        assignedStaffUserId: 22,
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        assigned_staff_user_id: null,
      }),
    ];

    validateAssignmentTransitionRules({
      orders,
      existingAssignments,
      roleName: "Staff",
      userId: 22,
    });
  });

  it("allows status change when order is assigned through production stages", () => {
    const orders = [
      makeOrder({
        orderStatus: "Ready",
        assignedStaffUserId: null,
        productionStages: [
          { stage: "listing", staffId: 22, tokenAmount: 25, percentage: 25 },
          { stage: "filling", staffId: null, tokenAmount: 25, percentage: 25 },
          { stage: "finishing", staffId: null, tokenAmount: 50, percentage: 50 },
        ],
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        order_status: "In Production",
        assigned_staff_user_id: null,
      }),
    ];

    validateAssignmentTransitionRules({
      orders,
      existingAssignments,
      roleName: "Owner",
      userId: 1,
    });
  });
});

describe("Orders API projected daily token limit for staff assignment", () => {
  it("rejects assignment when projected token exceeds 500", () => {
    const orders = [
      makeOrder({
        id: "ORD-1",
        assignedStaffUserId: 22,
        deliveryDate: "2026-04-10",
        items: [{ category: "Cake", quantity: 300, tokenDifficulty: "simple" }],
      }),
      makeOrder({
        id: "ORD-2",
        assignedStaffUserId: 22,
        deliveryDate: "2026-04-10",
        items: [{ category: "Cake", quantity: 260, tokenDifficulty: "simple" }],
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        external_id: "ORD-1",
        assigned_staff_user_id: null,
      }),
      makeExistingAssignment({
        external_id: "ORD-2",
        assigned_staff_user_id: null,
      }),
    ];

    expect(() =>
      validateProjectedStaffDailyTokenLimit({
        orders,
        existingAssignments,
        limit: 500,
      }),
    ).toThrow("Token harian staff melebihi limit");
  });

  it("allows assignment when projected token is exactly 500", () => {
    const orders = [
      makeOrder({
        id: "ORD-1",
        assignedStaffUserId: 22,
        deliveryDate: "2026-04-10",
        items: [{ category: "Cake", quantity: 250, tokenDifficulty: "simple" }],
      }),
      makeOrder({
        id: "ORD-2",
        assignedStaffUserId: 22,
        deliveryDate: "2026-04-10",
        items: [{ category: "Cake", quantity: 250, tokenDifficulty: "simple" }],
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        external_id: "ORD-1",
        assigned_staff_user_id: null,
      }),
      makeExistingAssignment({
        external_id: "ORD-2",
        assigned_staff_user_id: null,
      }),
    ];

    validateProjectedStaffDailyTokenLimit({
      orders,
      existingAssignments,
      limit: 500,
    });
  });

  it("ignores delivered orders when calculating projected limit", () => {
    const orders = [
      makeOrder({
        id: "ORD-1",
        orderStatus: "Delivered",
        assignedStaffUserId: 22,
        deliveryDate: "2026-04-10",
        items: [{ category: "Cake", quantity: 600, tokenDifficulty: "simple" }],
      }),
      makeOrder({
        id: "ORD-2",
        orderStatus: "Inquiry",
        assignedStaffUserId: 22,
        deliveryDate: "2026-04-10",
        items: [{ category: "Cake", quantity: 100, tokenDifficulty: "simple" }],
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        external_id: "ORD-1",
        assigned_staff_user_id: null,
      }),
      makeExistingAssignment({
        external_id: "ORD-2",
        assigned_staff_user_id: null,
      }),
    ];

    validateProjectedStaffDailyTokenLimit({
      orders,
      existingAssignments,
      limit: 500,
    });
  });

  it("counts staged assignments toward projected limit", () => {
    const orders = [
      makeOrder({
        id: "ORD-1",
        assignedStaffUserId: null,
        deliveryDate: "2026-04-10",
        productionStages: [
          { stage: "listing", staffId: 22, tokenAmount: 250, percentage: 25 },
          { stage: "filling", staffId: null, tokenAmount: 250, percentage: 25 },
          { stage: "finishing", staffId: null, tokenAmount: 500, percentage: 50 },
        ],
        items: [{ category: "Cake", quantity: 1000, tokenDifficulty: "simple" }],
      }),
      makeOrder({
        id: "ORD-2",
        assignedStaffUserId: null,
        deliveryDate: "2026-04-10",
        productionStages: [
          { stage: "listing", staffId: 22, tokenAmount: 260, percentage: 25 },
          { stage: "filling", staffId: null, tokenAmount: 260, percentage: 25 },
          { stage: "finishing", staffId: null, tokenAmount: 520, percentage: 50 },
        ],
        items: [{ category: "Cake", quantity: 1040, tokenDifficulty: "simple" }],
      }),
    ];

    const existingAssignments = [
      makeExistingAssignment({
        external_id: "ORD-1",
        assigned_staff_user_id: null,
      }),
      makeExistingAssignment({
        external_id: "ORD-2",
        assigned_staff_user_id: null,
      }),
    ];

    expect(() =>
      validateProjectedStaffDailyTokenLimit({
        orders,
        existingAssignments,
        existingOrders: [
          makeOrder({ id: "ORD-1" }),
          makeOrder({ id: "ORD-2" }),
        ],
        limit: 500,
      }),
    ).toThrow("Token harian staff melebihi limit");
  });
});
