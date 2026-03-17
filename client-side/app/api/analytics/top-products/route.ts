import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";

export async function GET(request: Request) {
  try {
    const { businessId } = await requireAuth();

    const url = new URL(request.url);
    const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
    const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const metrics = await prisma.productMetrics.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        product: {
          businessId,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const aggregated = metrics.map((m) => {
      const revenue = Number(m.revenue);
      const profit = Number(m.profit);
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        productId: m.product.id,
        name: m.product.name,
        quantitySold: m.quantitySold,
        revenue,
        profit,
        margin: Math.round(margin * 100) / 100,
      };
    });

    const sorted = aggregated.sort((a, b) => b.quantitySold - a.quantitySold);

    return NextResponse.json({
      success: true,
      data: sorted,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Top products error:", error);
    return NextResponse.json(
      { error: "Failed to fetch top products" },
      { status: 500 }
    );
  }
}