import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AuthError, requireAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAPSHOT_SOURCE_TYPE = "bakery_orders_snapshot";

function parseOrdersContent(content: string | null | undefined): unknown[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const { businessId } = await requireAuth();

    const snapshot = await prisma.businessDocument.findFirst({
      where: {
        businessId,
        sourceType: SNAPSHOT_SOURCE_TYPE,
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        content: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: snapshot?.id ?? null,
        orders: parseOrdersContent(snapshot?.content),
        updatedAt: snapshot?.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to load bakery orders." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { businessId, userId } = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as {
      orders?: unknown;
    };
    const orders = Array.isArray(body.orders) ? body.orders : null;

    if (!orders) {
      return NextResponse.json(
        { error: "Invalid payload. 'orders' must be an array." },
        { status: 400 },
      );
    }

    const existing = await prisma.businessDocument.findFirst({
      where: {
        businessId,
        sourceType: SNAPSHOT_SOURCE_TYPE,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    const content = JSON.stringify(orders);
    const metadata = {
      kind: SNAPSHOT_SOURCE_TYPE,
      itemCount: orders.length,
      updatedByUserId: userId,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      await prisma.businessDocument.update({
        where: { id: existing.id },
        data: {
          content,
          metadata,
          sourceId: businessId,
          chunkIndex: 0,
        },
      });
    } else {
      await prisma.businessDocument.create({
        data: {
          businessId,
          sourceType: SNAPSHOT_SOURCE_TYPE,
          sourceId: businessId,
          content,
          chunkIndex: 0,
          metadata,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        itemCount: orders.length,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to persist bakery orders." },
      { status: 500 },
    );
  }
}
