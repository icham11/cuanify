import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getOrderItemsSummary } from "@/lib/bookings/order-display";

export const BOOKING_AUDIT_SOURCE_TYPE = "bakery_booking_audit_log_v1";

export type BookingAuditAction = "created" | "edited" | "deleted";

export type BookingAuditEntry = {
  id: number;
  action: BookingAuditAction;
  orderId: string;
  bookingCode: string;
  customerName: string;
  orderSummary: string;
  actorUserId: number | null;
  actorName: string;
  actorEmail: string;
  occurredAt: string;
  createdAt: string;
};

type BookingAuditDocumentParams = {
  businessId: number;
  action: BookingAuditAction;
  orderId: string;
  bookingCode?: string | null;
  customerName?: string | null;
  orderSummary?: string | null;
  actorUserId?: number | null;
  actorName?: string | null;
  actorEmail?: string | null;
  occurredAt?: string | Date;
};

export type BookingAuditEntryPage = {
  entries: BookingAuditEntry[];
  nextCursor: number | null;
  total: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asPositiveIntOrNull(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildBookingAuditDocument(
  params: BookingAuditDocumentParams,
): Prisma.BusinessDocumentCreateManyInput {
  const occurredAt =
    params.occurredAt instanceof Date
      ? params.occurredAt.toISOString()
      : typeof params.occurredAt === "string" && params.occurredAt.trim()
        ? params.occurredAt
        : new Date().toISOString();

  return {
    businessId: params.businessId,
    sourceType: BOOKING_AUDIT_SOURCE_TYPE,
    content: JSON.stringify({
      orderId: params.orderId,
      bookingCode: params.bookingCode ?? "",
      customerName: params.customerName ?? "",
      orderSummary: params.orderSummary ?? "",
    }),
    metadata: {
      action: params.action,
      orderId: params.orderId,
      bookingCode: params.bookingCode ?? "",
      customerName: params.customerName ?? "",
      orderSummary: params.orderSummary ?? "",
      actorUserId: params.actorUserId ?? null,
      actorName: params.actorName ?? "",
      actorEmail: params.actorEmail ?? "",
      occurredAt,
    },
  };
}

export function buildBookingAuditOrderSummary(params: {
  items: Array<Record<string, unknown> | null | undefined> | null | undefined;
  fallbackLabel?: string | null;
}): string {
  const normalizedItems =
    params.items?.map((item) => ({
      productName:
        asString(item?.productName) ||
        asString(item?.subcategory) ||
        asString(item?.category),
      quantity: asPositiveIntOrNull(item?.quantity) ?? 1,
    })) ?? [];

  return getOrderItemsSummary(normalizedItems, params.fallbackLabel);
}

export async function listBookingAuditEntries(params: {
  businessId: number;
  limit?: number;
  cursor?: number | null;
}): Promise<BookingAuditEntryPage> {
  const safeLimit = Math.min(50, Math.max(1, params.limit ?? 20));
  const baseWhere: Prisma.BusinessDocumentWhereInput = {
    businessId: params.businessId,
    sourceType: BOOKING_AUDIT_SOURCE_TYPE,
  };
  const where: Prisma.BusinessDocumentWhereInput =
    typeof params.cursor === "number" && params.cursor > 0
      ? {
          ...baseWhere,
          id: { lt: params.cursor },
        }
      : baseWhere;

  const [docs, total] = await Promise.all([
    prisma.businessDocument.findMany({
      where,
      orderBy: [{ id: "desc" }],
      take: safeLimit + 1,
      select: {
        id: true,
        createdAt: true,
        metadata: true,
        content: true,
      },
    }),
    prisma.businessDocument.count({
      where: baseWhere,
    }),
  ]);

  const hasMore = docs.length > safeLimit;
  const visibleDocs = hasMore ? docs.slice(0, safeLimit) : docs;

  const entries = visibleDocs
    .map((doc) => {
      const metadata = asRecord(doc.metadata) ?? {};
      const contentRecord = asRecord(
        (() => {
          try {
            return JSON.parse(doc.content) as unknown;
          } catch {
            return null;
          }
        })(),
      );

      const action = metadata.action;
      if (action !== "created" && action !== "edited" && action !== "deleted") {
        return null;
      }

      return {
        id: doc.id,
        action,
        orderId: asString(metadata.orderId) || asString(contentRecord?.orderId),
        bookingCode:
          asString(metadata.bookingCode) || asString(contentRecord?.bookingCode),
        customerName:
          asString(metadata.customerName) ||
          asString(contentRecord?.customerName),
        orderSummary:
          asString(metadata.orderSummary) ||
          asString(contentRecord?.orderSummary),
        actorUserId: asPositiveIntOrNull(metadata.actorUserId),
        actorName: asString(metadata.actorName),
        actorEmail: asString(metadata.actorEmail),
        occurredAt:
          asString(metadata.occurredAt) || doc.createdAt.toISOString(),
        createdAt: doc.createdAt.toISOString(),
      } satisfies BookingAuditEntry;
    })
    .filter((entry): entry is BookingAuditEntry => Boolean(entry));

  return {
    entries,
    nextCursor: hasMore ? visibleDocs[visibleDocs.length - 1]?.id ?? null : null,
    total,
  };
}
