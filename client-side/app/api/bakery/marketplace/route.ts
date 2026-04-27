import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const sales = await prisma.marketplaceSale.findMany({
      where: { businessId },
      orderBy: { saleDate: "desc" },
      take: limit,
      skip: offset,
    });

    const totalCount = await prisma.marketplaceSale.count({
      where: { businessId },
    });

    return NextResponse.json({
      success: true,
      data: sales,
      pagination: {
        total: totalCount,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: error.status || 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();

    const { marketplace, orderId, totalAmount, itemName, saleDate } = body;

    if (!marketplace || !totalAmount) {
      return NextResponse.json(
        { success: false, error: "Marketplace and Total Amount are required" },
        { status: 400 }
      );
    }

    const sale = await prisma.marketplaceSale.create({
      data: {
        businessId,
        marketplace,
        orderId: orderId || null,
        totalAmount: parseFloat(totalAmount),
        itemName: itemName || null,
        saleDate: saleDate ? new Date(saleDate) : new Date(),
      },
    });

    return NextResponse.json({ success: true, data: sale });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: error.status || 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
    try {
      const { businessId } = await requireAuth();
      const searchParams = request.nextUrl.searchParams;
      const id = searchParams.get("id");
  
      if (!id) {
        return NextResponse.json(
          { success: false, error: "ID is required" },
          { status: 400 }
        );
      }
  
      await prisma.marketplaceSale.delete({
        where: { 
            id: parseInt(id),
            businessId // Ensure it belongs to the business
        },
      });
  
      return NextResponse.json({ success: true });
    } catch (error: any) {
      return NextResponse.json(
        { success: false, error: error.message || "Internal Server Error" },
        { status: error.status || 500 }
      );
    }
  }
