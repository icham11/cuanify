import { ForbiddenError } from "@/lib/auth/session";
import { calculateOrderTokenFromItems } from "@/lib/bookings/token-capacity-service";
import type { ProductionStageAssignment } from "@/lib/bookings/production-stages";

const INACTIVE_STATUSES = ["Cancelled", "Completed", "Delivery", "Delivered"];
const STAFF_DAILY_TOKEN_LIMIT_MESSAGE =
  "Token harian staff melebihi limit assignment";

type JsonRecord = Record<string, unknown>;

export interface ExistingAssignmentState {
  external_id: string;
  order_status: string | null;
  assigned_staff_user_id: number | null;
}

export interface StaffValidationOrder {
  id: string;
  orderStatus: string;
  assignedStaffUserId: number | null;
  deliveryDate: string;
  productionStages?: ProductionStageAssignment[];
  items: JsonRecord[];
}

function asPositiveIntOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function calculateOrderTokenForLimit(
  order: Pick<StaffValidationOrder, "items">,
): number {
  const orderItems = (order.items || []).map((item) => ({
    category: typeof item.category === "string" ? item.category : "",
    subcategory:
      typeof item.subcategory === "string" ? item.subcategory : undefined,
    productName:
      typeof item.productName === "string" ? item.productName : undefined,
    size: typeof item.size === "string" ? item.size : undefined,
    quantity: typeof item.quantity === "number" ? item.quantity : undefined,
    tokenDifficulty:
      typeof item.tokenDifficulty === "string"
        ? item.tokenDifficulty
        : undefined,
    customTokenPerUnit:
      typeof item.customTokenPerUnit === "number"
        ? item.customTokenPerUnit
        : undefined,
    cookieDifficultyBreakdown:
      typeof item.cookieDifficultyBreakdown === "string"
        ? item.cookieDifficultyBreakdown
        : undefined,
  }));

  return calculateOrderTokenFromItems(orderItems);
}

function buildStaffDailyTokenMap(
  orders: StaffValidationOrder[],
): Map<string, number> {
  const usage = new Map<string, number>();

  for (const order of orders) {
    if (!order.deliveryDate) continue;
    if (INACTIVE_STATUSES.includes(order.orderStatus || "")) continue;

    for (const assignment of getOrderStaffTokenAssignmentsForLimit(order)) {
      if (assignment.token <= 0) continue;
      const key = `${assignment.staffUserId}:${order.deliveryDate}`;
      usage.set(key, (usage.get(key) ?? 0) + assignment.token);
    }
  }

  return usage;
}

function getOrderStaffTokenAssignmentsForLimit(
  order: Pick<
    StaffValidationOrder,
    "assignedStaffUserId" | "items" | "productionStages"
  >,
) {
  const stageAssignments = (order.productionStages ?? [])
    .filter((stage) => stage.staffId && stage.tokenAmount > 0)
    .map((stage) => ({
      staffUserId: Number(stage.staffId),
      token: Math.max(0, Math.round(Number(stage.tokenAmount) || 0)),
    }));

  if (stageAssignments.length > 0) return stageAssignments;
  if (!order.assignedStaffUserId) return [];

  return [
    {
      staffUserId: order.assignedStaffUserId,
      token: calculateOrderTokenForLimit(order),
    },
  ];
}

function collectAssignedStaffUserIds(
  order: Pick<StaffValidationOrder, "assignedStaffUserId" | "productionStages">,
): number[] {
  const assignedIds = new Set<number>();

  if (order.assignedStaffUserId) {
    assignedIds.add(order.assignedStaffUserId);
  }

  for (const stage of order.productionStages ?? []) {
    const staffId = asPositiveIntOrNull(stage.staffId);
    if (staffId) {
      assignedIds.add(staffId);
    }
  }

  return [...assignedIds].sort((left, right) => left - right);
}

function collectAssignmentTargetsBySlot(
  order: Pick<StaffValidationOrder, "assignedStaffUserId" | "productionStages">,
): Map<string, number | null> {
  const targets = new Map<string, number | null>([
    ["order", asPositiveIntOrNull(order.assignedStaffUserId)],
  ]);

  for (const stage of order.productionStages ?? []) {
    targets.set(`stage:${stage.stage}`, asPositiveIntOrNull(stage.staffId));
  }

  return targets;
}

function assignedStaffTargetsChanged(
  current: Pick<StaffValidationOrder, "assignedStaffUserId" | "productionStages">,
  next: Pick<StaffValidationOrder, "assignedStaffUserId" | "productionStages">,
) {
  const currentIds = collectAssignedStaffUserIds(current);
  const nextIds = collectAssignedStaffUserIds(next);

  if (currentIds.length !== nextIds.length) return true;

  return currentIds.some((staffUserId, index) => staffUserId !== nextIds[index]);
}

export function sanitizeAssignableStaffTargets(params: {
  orders: StaffValidationOrder[];
  assignableStaffUserIds: Set<number>;
}) {
  const { orders, assignableStaffUserIds } = params;

  return orders.map((order) => {
    const productionStages = (order.productionStages ?? []).map((stage) => {
      const staffId = asPositiveIntOrNull(stage.staffId);
      if (!staffId || assignableStaffUserIds.has(staffId)) {
        return stage;
      }

      return {
        ...stage,
        staffId: null,
      };
    });

    const uniqueStageAssignees = [
      ...new Set(
        productionStages
          .map((stage) => asPositiveIntOrNull(stage.staffId))
          .filter((staffId): staffId is number => Boolean(staffId)),
      ),
    ];
    const topLevelAssignee = asPositiveIntOrNull(order.assignedStaffUserId);
    const sanitizedAssignedStaffUserId =
      uniqueStageAssignees.length === 1
        ? uniqueStageAssignees[0]
        : topLevelAssignee && assignableStaffUserIds.has(topLevelAssignee)
          ? topLevelAssignee
          : null;

    return {
      ...order,
      assignedStaffUserId: sanitizedAssignedStaffUserId,
      productionStages,
    };
  });
}

export function ensureAssignableStaffTargets(params: {
  orders: Array<
    Pick<StaffValidationOrder, "id" | "assignedStaffUserId" | "productionStages">
  >;
  existingOrders?: Array<
    Pick<StaffValidationOrder, "id" | "assignedStaffUserId" | "productionStages">
  >;
  assignableStaffUserIds: Set<number>;
}) {
  const {
    orders,
    existingOrders = [],
    assignableStaffUserIds,
  } = params;
  const existingOrdersMap = new Map<string, Pick<
    StaffValidationOrder,
    "id" | "assignedStaffUserId" | "productionStages"
  >>(
    existingOrders.map((order) => [order.id, order]),
  );

  for (const order of orders) {
    const existingOrder = existingOrdersMap.get(order.id);
    if (
      existingOrder &&
      !assignedStaffTargetsChanged(existingOrder, order)
    ) {
      continue;
    }

    const nextTargets = collectAssignmentTargetsBySlot(order);
    const currentTargets = existingOrder
      ? collectAssignmentTargetsBySlot(existingOrder)
      : new Map<string, number | null>();
    const invalidTargetIds = [...nextTargets.entries()]
      .filter(([, staffUserId]) => staffUserId !== null)
      .filter(([slotKey, staffUserId]) => {
        if (staffUserId === null) return false;
        if (assignableStaffUserIds.has(staffUserId)) return false;
        return currentTargets.get(slotKey) !== staffUserId;
      })
      .map(([, staffUserId]) => Number(staffUserId));
    if (invalidTargetIds.length === 0) continue;

    throw new ForbiddenError(
      "Assignment produksi hanya boleh ke role Staff. Owner, Admin, dan Cashier tidak bisa di-assign.",
    );
  }
}

export function validateAssignmentTransitionRules(params: {
  orders: StaffValidationOrder[];
  existingAssignments: ExistingAssignmentState[];
  roleName: string;
  userId: number;
}) {
  const { orders, existingAssignments, roleName, userId } = params;
  const isOwnerRequest = roleName === "Owner";
  const isStaffRequest = roleName === "Staff";
  const existingAssignmentMap = new Map(
    existingAssignments.map((row) => [row.external_id, row]),
  );

  for (const order of orders) {
    const existing = existingAssignmentMap.get(order.id);
    if (!existing) continue;

    const currentStatus = existing.order_status ?? "Inquiry";
    const statusChanged = currentStatus !== order.orderStatus;
    const nextStatus = order.orderStatus ?? "";
    const currentAssignee = asPositiveIntOrNull(
      existing.assigned_staff_user_id,
    );
    const nextAssignee = order.assignedStaffUserId;
    const nextHasAssignment =
      getOrderStaffTokenAssignmentsForLimit(order).length > 0;

    if (
      statusChanged &&
      !nextHasAssignment &&
      nextStatus !== "Cancelled" &&
      nextStatus !== "Completed"
    ) {
      throw new ForbiddenError("Order must be assigned before changing status");
    }

    if (currentAssignee === nextAssignee) {
      continue;
    }

    if (
      currentAssignee !== null &&
      nextAssignee === null &&
      !nextHasAssignment &&
      !isOwnerRequest
    ) {
      throw new ForbiddenError(
        "Order yang sudah diambil tidak bisa dilepas. Gunakan transfer oleh owner.",
      );
    }

    if (!isOwnerRequest) {
      const isStaffClaimOwnUnassignedOrder =
        isStaffRequest && currentAssignee === null && nextAssignee === userId;

      if (!isStaffClaimOwnUnassignedOrder) {
        throw new ForbiddenError(
          "Hanya owner yang dapat memindahkan assignment order.",
        );
      }
    }
  }
}

export function validateProjectedStaffDailyTokenLimit(params: {
  orders: StaffValidationOrder[];
  existingAssignments: ExistingAssignmentState[];
  existingOrders?: StaffValidationOrder[];
  limit?: number;
}) {
  const { orders, existingAssignments, existingOrders = [], limit = 500 } = params;
  if (limit <= 0) return;

  const projectedStaffDailyTokenMap = buildStaffDailyTokenMap(orders);
  const existingAssignmentMap = new Map(
    existingAssignments.map((row) => [row.external_id, row]),
  );
  const existingOrdersMap = new Map(
    existingOrders.map((order) => [order.id, order]),
  );

  for (const order of orders) {
    const existing = existingAssignmentMap.get(order.id);
    if (!existing) continue;

    if (!order.deliveryDate) continue;
    if (INACTIVE_STATUSES.includes(order.orderStatus || "")) continue;

    const previousAssignments = getOrderStaffTokenAssignmentsForLimit(
      existingOrdersMap.get(order.id) ?? {
        id: order.id,
        orderStatus: existing.order_status ?? "",
        assignedStaffUserId: asPositiveIntOrNull(
          existing.assigned_staff_user_id,
        ),
        deliveryDate: order.deliveryDate,
        items: order.items,
        productionStages: [],
      },
    );
    const previousByStaff = new Map<number, number>();
    for (const assignment of previousAssignments) {
      previousByStaff.set(
        assignment.staffUserId,
        (previousByStaff.get(assignment.staffUserId) ?? 0) + assignment.token,
      );
    }

    for (const assignment of getOrderStaffTokenAssignmentsForLimit(order)) {
      const staffDayKey = `${assignment.staffUserId}:${order.deliveryDate}`;
      const projectedToken = projectedStaffDailyTokenMap.get(staffDayKey) ?? 0;
      const previousTokenForStaff =
        previousByStaff.get(assignment.staffUserId) ?? 0;
      const incomingDelta = Math.max(0, assignment.token - previousTokenForStaff);
      if (incomingDelta <= 0) continue;

      const tokenBeforeAssignment = Math.max(0, projectedToken - incomingDelta);
      if (projectedToken <= limit || tokenBeforeAssignment <= 0) continue;

      throw new ForbiddenError(
        `${STAFF_DAILY_TOKEN_LIMIT_MESSAGE}. Staff ${assignment.staffUserId} pada ${order.deliveryDate}: ${projectedToken}/${limit} token.`,
      );
    }
  }
}
