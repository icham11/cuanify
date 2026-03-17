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

    const metrics = await prisma.businessMetrics.findMany({
      where: {
        businessId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: "asc",
      },
    });

    // Create full month array (fill missing days with 0)
    const daysInMonth = endDate.getDate();

    const result = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month - 1, day);
      const found = metrics.find(
        (m) => m.date.toISOString().split("T")[0] === currentDate.toISOString().split("T")[0]
      );

      result.push({
        date: currentDate.toISOString().split("T")[0],
        revenue: Number(found?.totalRevenue ?? 0),
        profit: Number(found?.totalProfit ?? 0),
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Monthly analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch monthly analytics" },
      { status: 500 }
    );
  }
}