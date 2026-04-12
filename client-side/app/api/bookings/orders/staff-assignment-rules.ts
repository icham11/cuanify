import { ForbiddenError } from "@/lib/auth/session";
import { calculateOrderTokenFromItems } from "@/lib/bookings/token-capacity-service";

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
    if (!order.assignedStaffUserId || !order.deliveryDate) continue;
    if (INACTIVE_STATUSES.includes(order.orderStatus || "")) continue;

    const token = calculateOrderTokenForLimit(order);
    if (token <= 0) continue;

    const key = `${order.assignedStaffUserId}:${order.deliveryDate}`;
    usage.set(key, (usage.get(key) ?? 0) + token);
  }

  return usage;
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
    const currentAssignee = asPositiveIntOrNull(
      existing.assigned_staff_user_id,
    );
    const nextAssignee = order.assignedStaffUserId;

    if (statusChanged && !nextAssignee) {
      throw new ForbiddenError("Order must be assigned before changing status");
    }

    if (currentAssignee === nextAssignee) {
      continue;
    }

    if (currentAssignee !== null && nextAssignee === null) {
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
  limit?: number;
}) {
  const { orders, existingAssignments, limit = 500 } = params;
  if (limit <= 0) return;

  const projectedStaffDailyTokenMap = buildStaffDailyTokenMap(orders);
  const existingAssignmentMap = new Map(
    existingAssignments.map((row) => [row.external_id, row]),
  );

  for (const order of orders) {
    const existing = existingAssignmentMap.get(order.id);
    if (!existing) continue;

    const currentAssignee = asPositiveIntOrNull(
      existing.assigned_staff_user_id,
    );
    const nextAssignee = order.assignedStaffUserId;
    if (!nextAssignee || currentAssignee === nextAssignee) continue;

    if (!order.deliveryDate) continue;
    if (INACTIVE_STATUSES.includes(order.orderStatus || "")) continue;

    const incomingToken = calculateOrderTokenForLimit(order);
    if (incomingToken <= 0) continue;

    const staffDayKey = `${nextAssignee}:${order.deliveryDate}`;
    const projectedToken = projectedStaffDailyTokenMap.get(staffDayKey) ?? 0;
    const tokenBeforeAssignment = Math.max(0, projectedToken - incomingToken);

    if (projectedToken > limit && tokenBeforeAssignment > 0) {
      throw new ForbiddenError(
        `${STAFF_DAILY_TOKEN_LIMIT_MESSAGE}. Staff ${nextAssignee} pada ${order.deliveryDate}: ${projectedToken}/${limit} token.`,
      );
    }
  }
}
