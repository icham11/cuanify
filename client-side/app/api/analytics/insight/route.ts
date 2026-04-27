import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { GROQ_MODELS, createGroqCompletion } from "@/lib/groq";
import {
  getBakeryCategoryAnalytics,
  getBakeryDailyAnalytics,
  getBakeryProductAnalytics,
  hasBakeryOrders,
} from "@/lib/bookings/bakery-analytics";

export const dynamic = "force-dynamic";

function formatShort(val: number) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}jt`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}rb`;
  return val.toLocaleString("id-ID");
}

export async function GET() {
  try {
    const { businessId } = await requireAuth();

    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    const useBakery = await hasBakeryOrders(businessId);

    const [products, ingredients] = await Promise.all([
      prisma.product.findMany({
        where: { businessId, deletedAt: null },
        select: { id: true, name: true, sellingPrice: true },
      }),
      prisma.ingredient.findMany({
        where: { businessId },
        include: {
          inventoryBatches: {
            where: { remainingQty: { gt: 0 } },
            select: { remainingQty: true, costPerUnit: true },
          },
        },
      }),
    ]);

    let totalRevenue = 0;
    let totalProfit = 0;
    let txCount = 0;
    let topProducts: string[] = [];
    let topCategories: string[] = [];

    if (useBakery) {
      const [daily, productAnalytics, categoryAnalytics, paidOrderCountRows] = await Promise.all([
        getBakeryDailyAnalytics(businessId, firstDay, lastDay),
        getBakeryProductAnalytics(businessId, firstDay, lastDay),
        getBakeryCategoryAnalytics(businessId, firstDay, lastDay),
        prisma.$queryRaw<Array<{ count: bigint }>>`
          WITH latest_orders AS (
            SELECT *
            FROM (
              SELECT
                bo.*,
                ROW_NUMBER() OVER (
                  PARTITION BY bo.business_id, bo.external_id
                  ORDER BY bo.updated_at DESC, bo.id DESC
                ) AS rn
              FROM bakery_orders bo
              WHERE bo.business_id = ${businessId}
            ) ranked_orders
            WHERE ranked_orders.rn = 1
          )
          SELECT COUNT(*)::bigint AS count
          FROM latest_orders
          WHERE business_id = ${businessId}
            AND LOWER(COALESCE(order_status, '')) = 'completed'
            AND deleted_at IS NULL
            AND created_at BETWEEN ${firstDay} AND ${lastDay}
        `,
      ]);

      totalRevenue = daily.totals.revenue;
      totalProfit = daily.totals.profit;
      txCount = Number(paidOrderCountRows[0]?.count ?? 0);
      topProducts = productAnalytics
        .slice(0, 5)
        .map((product) => `${product.productName}: ${product.quantitySold} pcs`);
      topCategories = categoryAnalytics.categories
        .slice(0, 3)
        .map((category) => `${category.categoryName}: ${category.quantitySold} pcs`);
    } else {
      const [metrics, sales] = await Promise.all([
        prisma.businessMetrics.findMany({
          where: { businessId, date: { gte: firstDay, lte: lastDay } },
        }),
        prisma.sale.findMany({
          where: { businessId, createdAt: { gte: firstDay, lte: lastDay } },
          include: {
            saleItems: {
              include: {
                product: {
                  select: {
                    name: true,
                    sellingPrice: true,
                    id: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);

      totalRevenue = metrics.reduce((sum, metric) => sum + Number(metric.totalRevenue), 0);
      totalProfit = metrics.reduce((sum, metric) => sum + Number(metric.totalProfit), 0);
      txCount = sales.length;

      const productSales: Record<string, number> = {};
      const categorySales: Record<string, number> = {};

      for (const sale of sales) {
        for (const item of sale.saleItems) {
          const productName = item.product?.name || `Produk #${item.productId}`;
          const categoryName = item.product?.category?.name || "Lain-lain";
          productSales[productName] = (productSales[productName] || 0) + item.quantity;
          categorySales[categoryName] = (categorySales[categoryName] || 0) + item.quantity;
        }
      }

      topProducts = Object.entries(productSales)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([name, qty]) => `${name}: ${qty} pcs`);
      topCategories = Object.entries(categorySales)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([name, qty]) => `${name}: ${qty} pcs`);
    }

    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const lowStock = ingredients
      .map((ingredient) => {
        const stock = ingredient.inventoryBatches.reduce((sum, batch) => sum + Number(batch.remainingQty), 0);
        return { name: ingredient.name, stock, min: ingredient.minStock };
      })
      .filter((ingredient) => ingredient.min > 0 && ingredient.stock <= ingredient.min);

    const productPrices = products
      .map((product) => ({
        name: product.name,
        price: `Rp ${Number(product.sellingPrice).toLocaleString("id-ID")}`,
      }))
      .slice(0, 10);

    const dataContext = `
BUSINESS DATA (Bulan ini, ${today.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}):

KEUANGAN:
- Total Revenue: Rp ${totalRevenue.toLocaleString("id-ID")}
- Total Profit: Rp ${totalProfit.toLocaleString("id-ID")}
- Margin: ${margin.toFixed(1)}%
- Jumlah Transaksi: ${txCount}
- Rata-rata per transaksi: Rp ${txCount > 0 ? Math.round(totalRevenue / txCount).toLocaleString("id-ID") : 0}

TOP PRODUK:
${topProducts.length > 0 ? topProducts.join("\n") : "Belum ada data penjualan"}

TOP KATEGORI:
${topCategories.length > 0 ? topCategories.join("\n") : "Belum ada data kategori"}

STOK RENDAH:
${lowStock.length > 0 ? lowStock.map((item) => `${item.name}: sisa ${item.stock} (min: ${item.min})`).join("\n") : "Semua stok aman"}

HARGA PRODUK:
${productPrices.length > 0 ? productPrices.map((item) => `${item.name}: ${item.price}`).join("\n") : "Belum ada produk"}

TOTAL PRODUK: ${products.length}
TOTAL BAHAN BAKU: ${ingredients.length}
`.trim();

    const systemPrompt = `Kamu adalah konsultan bisnis AI untuk pemilik dan manajer UMKM di Indonesia.
Tugasmu adalah menyusun ringkasan dan analisis bisnis yang profesional, berbasis data, dan berorientasi pada pengambilan keputusan.

Gunakan Bahasa Indonesia yang formal dan jelas.

Output harus JSON valid:
{
  "summary": "Ringkasan eksekutif 2-3 kalimat",
  "insights": [
    {
      "category": "revenue|profit|inventory|product|growth",
      "severity": "success|warning|danger|info",
      "title": "Judul singkat",
      "description": "Penjelasan singkat",
      "metric": "Angka penting"
    }
  ]
}`;

    let aiInsights: { summary?: string; insights?: Array<Record<string, unknown>> } | null = null;

    try {
      const completion = await createGroqCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: dataContext },
        ],
        model: GROQ_MODELS.text.primary,
        temperature: 0.4,
        maxTokens: 1200,
        responseFormat: { type: "json_object" },
      });

      aiInsights = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
    } catch (err) {
      console.warn("AI insight generation failed, trying fallback:", err instanceof Error ? err.message : err);
      try {
        const completion = await createGroqCompletion({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: dataContext },
          ],
          model: GROQ_MODELS.text.fallback,
          temperature: 0.4,
          maxTokens: 1200,
          responseFormat: { type: "json_object" },
        });

        aiInsights = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
      } catch {
        aiInsights = null;
      }
    }

    if (!aiInsights?.summary) {
      const insights: Array<Record<string, unknown>> = [];

      insights.push({
        category: "revenue",
        severity: totalRevenue > 500_000 ? "success" : "warning",
        title: totalRevenue > 500_000 ? "Revenue bulan ini baik" : "Revenue perlu ditingkatkan",
        description:
          totalRevenue > 500_000
            ? `Revenue sudah mencapai Rp ${totalRevenue.toLocaleString("id-ID")}.`
            : "Coba tingkatkan volume penjualan dengan promo atau bundling produk.",
        metric: `Rp ${formatShort(totalRevenue)}`,
      });

      insights.push({
        category: "profit",
        severity: margin > 40 ? "success" : "danger",
        title: margin > 40 ? "Margin profit sehat" : "Margin perlu perhatian",
        description:
          margin > 40
            ? `Margin ${margin.toFixed(1)}% menunjukkan pricing yang baik.`
            : "Evaluasi cost bahan baku dan harga jual untuk meningkatkan margin.",
        metric: `${margin.toFixed(1)}%`,
      });

      insights.push({
        category: "inventory",
        severity: lowStock.length > 0 ? "danger" : "success",
        title: lowStock.length > 0 ? `${lowStock.length} bahan stok rendah` : "Stok bahan baku aman",
        description:
          lowStock.length > 0
            ? `Segera restock: ${lowStock.map((item) => item.name).join(", ")}.`
            : "Semua bahan dalam level stok yang cukup.",
        metric: lowStock.length > 0 ? `${lowStock.length} item` : "OK",
      });

      if (txCount < 10) {
        insights.push({
          category: "growth",
          severity: "warning",
          title: "Volume transaksi masih rendah",
          description: "Tingkatkan traffic dengan promosi sosial media atau program loyalitas.",
          metric: `${txCount} transaksi`,
        });
      }

      aiInsights = {
        summary: `Bisnis mencatat revenue Rp ${totalRevenue.toLocaleString("id-ID")} dengan margin ${margin.toFixed(1)}% dari ${txCount} transaksi bulan ini.`,
        insights,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        totalRevenue,
        totalProfit,
        margin: Math.round(margin * 100) / 100,
        summary: aiInsights.summary || "",
        insights: aiInsights.insights || [],
        isAI: true,
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Insight API error:", error);
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 });
  }
}

const SECTION_PROMPTS: Record<string, string> = {
  revenue: `Analisis tren pendapatan harian UMKM ini secara profesional. Jelaskan pola utama (stabil, naik, turun), hari atau periode dengan penjualan tertinggi/terendah, rata-rata harian, serta faktor risiko atau peluang yang terlihat. Akhiri dengan rekomendasi konkret untuk mengoptimalkan pendapatan.`,
  growth: `Analisis pertumbuhan bisnis UMKM ini dari bulan ke bulan dengan sudut pandang manajemen. Jelaskan apakah bisnis sedang tumbuh, stagnan, atau menurun, dengan membandingkan pendapatan dan laba antar periode. Soroti dampak ke arus kas dan keberlanjutan bisnis, lalu berikan 2-3 langkah strategis yang dapat diambil.`,
  products: `Analisis performa produk UMKM ini seperti laporan produk ke manajemen. Jelaskan produk mana yang paling berkontribusi ke omzet dan profit, produk dengan margin rendah atau perputaran lambat, serta potensi cannibalization antar produk. Berikan rekomendasi strategi portofolio produk.`,
  health: `Analisis kesehatan keuangan UMKM ini secara menyeluruh. Hubungkan rasio margin, arus kas, dan indikator keuangan lain dengan kemampuan bisnis untuk bertahan dan bertumbuh.`,
  waste: `Analisis data limbah/waste produk pada UMKM ini dari perspektif efisiensi operasional dan profitabilitas.`,
  kasbon: `Analisis data kasbon (piutang) UMKM ini secara bisnis.`,
  forecast: `Analisis data prediksi penjualan UMKM ini sebagai bahan pertimbangan perencanaan bisnis.`,
};

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const { section, data } = body as { section: string; data: unknown };

    if (!section || !data) {
      return NextResponse.json({ error: "section and data required" }, { status: 400 });
    }

    const sectionPrompt = SECTION_PROMPTS[section] || SECTION_PROMPTS.revenue;
    const dataStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);

    const prompt = `${sectionPrompt}

Berikut data yang perlu dianalisis:
${dataStr}

- Jawab dalam Bahasa Indonesia
- Maksimal 3-4 paragraf
- Sertakan angka penting
- Akhiri dengan 2-3 saran tindakan konkret`;

    const completion = await createGroqCompletion({
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah konsultan bisnis AI khusus UMKM Indonesia. Berikan analisis singkat, profesional, dan berorientasi pada keputusan bisnis dalam Bahasa Indonesia.",
        },
        { role: "user", content: prompt },
      ],
      model: GROQ_MODELS.text.primary,
      temperature: 0.5,
      maxTokens: 800,
    });

    const insight = completion.choices?.[0]?.message?.content || "Tidak dapat menghasilkan analisis saat ini.";

    return NextResponse.json({ success: true, insight });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[AI Chart Insight] Error:", error);
    return NextResponse.json({ error: "Gagal menghasilkan analisis", details: String(error) }, { status: 500 });
  }
}
