import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { generateInvoiceHTML, generateInvoiceText } from "@/lib/invoice/generator";

export const runtime = "nodejs";

/**
 * GET /api/sales/:saleId/invoice
 *
 * Get invoice for a sale (HTML or TEXT format)
 *
 * Query params:
 *   - format: "html" | "text" (default: "html")
 *   - download: "true" (if true, returns file download)
 *
 * Success (200):
 *   - HTML format: returns HTML page
 *   - TEXT format: returns plain text
 *
 * Errors:
 *   401 — { "error": "Unauthorized" }
 *   404 — { "error": "Sale not found" }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { businessId } = await requireAuth();
    const resolvedParams = await params;
    const saleId = parseInt(resolvedParams.saleId, 10);
    const format = request.nextUrl.searchParams.get("format") || "html";
    const download = request.nextUrl.searchParams.get("download") === "true";

    // Fetch sale with all details
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        business: {
          select: { name: true, location: true },
        },
        saleItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!sale || sale.businessId !== businessId) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    const invoiceData = {
      sale: {
        ...sale,
        saleItems: sale.saleItems,
      },
      businessName: sale.business.name,
      businessLocation: sale.business.location || undefined,
    };

    if (format === "text") {
      const text = generateInvoiceText(invoiceData);
      return new NextResponse(text, {
        headers: {
          "Content-Type": download ? "text/plain; charset=utf-8" : "text/plain",
          ...(download && {
            "Content-Disposition": `attachment; filename="${sale.transactionNumber}.txt"`,
          }),
        },
      });
    }

    // Default to HTML
    const html = generateInvoiceHTML(invoiceData);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...(download && {
          "Content-Disposition": `attachment; filename="${sale.transactionNumber}.html"`,
        }),
      },
    });
  } catch (error) {
    console.error("GET /api/sales/:saleId/invoice error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get invoice" },
      { status: 500 },
    );
  }
}

