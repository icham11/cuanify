import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { GROQ_MODELS, createGroqCompletion } from "@/lib/groq";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { businessId } = await requireAuth();

    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // ── Gather all business data ──
    const [metrics, sales, products, ingredients] = await Promise.all([
      prisma.businessMetrics.findMany({
        where: { businessId, date: { gte: firstDay, lte: lastDay } },
      }),
      prisma.sale.findMany({
        where: { businessId, createdAt: { gte: firstDay, lte: lastDay } },
        include: {
          saleItems: {
            include: {
              product: { select: { name: true, sellingPrice: true, id: true, category: { select: { name: true } } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.product.findMany({
        where: { businessId },
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

    const totalRevenue = metrics.reduce((sum, m) => sum + Number(m.totalRevenue), 0);
    const totalProfit = metrics.reduce((sum, m) => sum + Number(m.totalProfit), 0);
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const txCount = sales.length;

    // Product sales ranking
    const productSales: Record<string, number> = {};
    for (const sale of sales) {
      for (const item of sale.saleItems) {
        const name = item.product?.name || `Produk #${item.productId}`;
        productSales[name] = (productSales[name] || 0) + item.quantity;
      }
    }
    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => `${name}: ${qty} pcs`);

    // Top categories
    const categorySales: Record<string, number> = {};
    for (const sale of sales) {
      for (const item of sale.saleItems) {
        const category = item.product?.category?.name || "Lain-lain";
        categorySales[category] = (categorySales[category] || 0) + item.quantity;
      }
    }
    const topCategories = Object.entries(categorySales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, qty]) => `${name}: ${qty} pcs`);

    // Low stock
    const lowStock = ingredients
      .map((ing) => {
        const stock = ing.inventoryBatches.reduce((s, b) => s + Number(b.remainingQty), 0);
        return { name: ing.name, stock, min: ing.minStock };
      })
      .filter((i) => i.min > 0 && i.stock <= i.min);

    // Product price listing
    const productPrices = products
      .map((p) => ({
        name: p.name,
        price: `Rp ${Number(p.sellingPrice).toLocaleString("id-ID")}`,
      }))
      .slice(0, 10);

    // ── Build AI prompt ──
    const dataContext = `
BUSINESS DATA (Bulan ini, ${today.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}):

📊 KEUANGAN:
- Total Revenue: Rp ${totalRevenue.toLocaleString("id-ID")}
- Total Profit: Rp ${totalProfit.toLocaleString("id-ID")}
- Margin: ${margin.toFixed(1)}%
- Jumlah Transaksi: ${txCount}
- Rata-rata per transaksi: Rp ${txCount > 0 ? Math.round(totalRevenue / txCount).toLocaleString("id-ID") : 0}

🏆 TOP PRODUK:
${topProducts.length > 0 ? topProducts.join("\n") : "Belum ada data penjualan"}

📈 TOP KATEGORI:
${topCategories.length > 0 ? topCategories.join("\n") : "Belum ada data kategori"}

⚠️ STOK RENDAH:
${lowStock.length > 0 ? lowStock.map((i) => `${i.name}: sisa ${i.stock} (min: ${i.min})`).join("\n") : "Semua stok aman"}

💰 HARGA PRODUK:
${productPrices.length > 0 ? productPrices.map((p) => `${p.name}: ${p.price}`).join("\n") : "Belum ada produk"}

📦 TOTAL PRODUK: ${products.length}
🧂 TOTAL BAHAN BAKU: ${ingredients.length}
`.trim();

    const systemPrompt = `Kamu adalah konsultan bisnis AI untuk pemilik dan manajer UMKM (Usaha Mikro Kecil Menengah) di Indonesia.
Tugasmu adalah menyusun ringkasan dan analisis bisnis yang profesional, berbasis data, dan berorientasi pada pengambilan keputusan.

Gunakan Bahasa Indonesia yang formal dan jelas, seperti laporan manajemen atau presentasi ke pemilik usaha.
Fokus pada dampak bisnis: pendapatan, profitabilitas, efisiensi operasional, risiko, dan peluang pertumbuhan.

PENTING: Output harus berformat JSON VALID seperti ini:
{
  "summary": "Ringkasan eksekutif 2-3 kalimat tentang kondisi bisnis dan highlight utama berdasarkan data",
  "insights": [
    {
      "category": "revenue|profit|inventory|product|growth",
      "severity": "success|warning|danger|info",
      "title": "Judul singkat dan profesional (maksimal 8 kata)",
      "description": "Penjelasan ringkas (1-2 kalimat) yang menjelaskan kondisi, penyebab utama, dan saran tindakan bisnis yang konkret",
      "metric": "Angka atau persentase kunci terkait (misalnya: revenue, margin, jumlah transaksi, unit terjual)"
    }
  ]
}

Berikan 5-7 insights yang beragam, spesifik, dan langsung terkait dengan data (bukan saran yang terlalu umum). Hindari bahasa kasual atau emotikon.`;

    let aiInsights = null;

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

      const raw = completion.choices?.[0]?.message?.content || "";
      aiInsights = JSON.parse(raw);
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

        const raw = completion.choices?.[0]?.message?.content || "";
        aiInsights = JSON.parse(raw);
      } catch {
        console.warn("Fallback AI also failed, using rule-based");
      }
    }

    // ── Fallback rule-based ──
    if (!aiInsights) {
      const insights = [];

      if (totalRevenue > 500_000) {
        insights.push({
          category: "revenue",
          severity: "success",
          title: "Revenue bulan ini baik",
          description: `Revenue sudah mencapai Rp ${totalRevenue.toLocaleString("id-ID")}. Pertahankan strategi saat ini.`,
          metric: `Rp ${formatShort(totalRevenue)}`,
        });
      } else {
        insights.push({
          category: "revenue",
          severity: "warning",
          title: "Revenue perlu ditingkatkan",
          description: "Coba tingkatkan volume penjualan dengan promo atau bundling produk.",
          metric: `Rp ${formatShort(totalRevenue)}`,
        });
      }

      if (margin > 40) {
        insights.push({
          category: "profit",
          severity: "success",
          title: "Margin profit sangat sehat",
          description: `Margin ${margin.toFixed(1)}% menunjukkan pricing yang baik.`,
          metric: `${margin.toFixed(1)}%`,
        });
      } else {
        insights.push({
          category: "profit",
          severity: "danger",
          title: "Margin profit perlu perhatian",
          description: "Evaluasi cost bahan baku dan harga jual untuk meningkatkan margin.",
          metric: `${margin.toFixed(1)}%`,
        });
      }

      if (lowStock.length > 0) {
        insights.push({
          category: "inventory",
          severity: "danger",
          title: `${lowStock.length} bahan stok rendah`,
          description: `Segera restock: ${lowStock.map((i) => i.name).join(", ")}.`,
          metric: `${lowStock.length} item`,
        });
      } else {
        insights.push({
          category: "inventory",
          severity: "success",
          title: "Stok bahan baku aman",
          description: "Semua bahan dalam level stok yang cukup.",
          metric: "OK",
        });
      }

      if (txCount < 10) {
        insights.push({
          category: "growth",
          severity: "warning",
          title: "Volume transaksi masih rendah",
          description: "Tingkatkan traffic dengan promosi sosial media atau program loyalitas.",
          metric: `${txCount} transaksi`,
        }); // Changed from "danger" to "warning"
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
        isAI: !!aiInsights.summary,
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

function formatShort(val: number) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}jt`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}rb`;
  return val.toLocaleString("id-ID");
}

// ─── POST: Per-chart AI explanation ──────────────────────────────────
const SECTION_PROMPTS: Record<string, string> = {
  revenue: `Analisis tren pendapatan harian UMKM ini secara profesional. Jelaskan pola utama (stabil, naik, turun), hari atau periode dengan penjualan tertinggi/terendah, rata-rata harian, serta faktor risiko atau peluang yang terlihat. Akhiri dengan rekomendasi konkret untuk mengoptimalkan pendapatan.`,
  growth: `Analisis pertumbuhan bisnis UMKM ini dari bulan ke bulan dengan sudut pandang manajemen. Jelaskan apakah bisnis sedang tumbuh, stagnan, atau menurun, dengan membandingkan pendapatan dan laba antar periode. Soroti dampak ke arus kas dan keberlanjutan bisnis, lalu berikan 2-3 langkah strategis yang dapat diambil.`,
  products: `Analisis performa produk UMKM ini seperti laporan produk ke manajemen. Jelaskan produk mana yang paling berkontribusi ke omzet dan profit, produk dengan margin rendah atau perputaran lambat, serta potensi cannibalization antar produk. Berikan rekomendasi strategi portofolio produk (promosi, bundling, penyesuaian harga, atau pengurangan varian).`,
  health: `Analisis kesehatan keuangan UMKM ini secara menyeluruh. Hubungkan rasio margin, arus kas, dan indikator keuangan lain dengan kemampuan bisnis untuk bertahan dan bertumbuh. Jelaskan area yang sehat dan area yang berisiko (misalnya margin menipis, penjualan tidak stabil, atau biaya tinggi), lalu berikan prioritas tindakan perbaikan.`,
  waste: `Analisis data limbah/waste produk pada UMKM ini dari perspektif efisiensi operasional dan profitabilitas. Jelaskan produk mana yang paling banyak terbuang, estimasi dampak finansialnya, serta pola yang muncul (misalnya overstock, salah perencanaan produksi, atau menu yang kurang laku). Berikan rekomendasi praktis untuk menurunkan waste tanpa mengganggu penjualan.`,
  kasbon: `Analisis data kasbon (piutang) UMKM ini secara bisnis. Jelaskan posisi kasbon saat ini (total, yang sudah dibayar, dan yang tertunggak), risiko terhadap arus kas, serta perilaku pembayaran pelanggan (tepat waktu atau sering terlambat). Berikan rekomendasi kebijakan pengelolaan piutang yang lebih sehat (batas kasbon, tenor, penagihan).`,
  forecast: `Analisis data prediksi penjualan UMKM ini sebagai bahan pertimbangan perencanaan bisnis. Jelaskan tren yang diprediksi (naik/turun/stabil), kategori atau produk yang menjadi pendorong utama, serta implikasinya terhadap stok, tenaga kerja, dan cash flow. Berikan saran strategi yang selaras dengan proyeksi tersebut.`,
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

  Berikut data yang perlu dianalisis (anggap sebagai bahan laporan singkat untuk pemilik/manajer bisnis):
  ${dataStr}

  PENTING:
  - Jawab SELURUHNYA dalam Bahasa Indonesia dengan gaya profesional (bukan bahasa kasual)
  - Gunakan format yang ringkas (maksimal 3-4 paragraf) dan terstruktur (kondisi utama, analisis, lalu rekomendasi)
  - Sertakan angka-angka penting (Rp, %, unit) yang mendukung analisis
  - Akhiri dengan 2-3 saran tindakan yang konkret dan dapat langsung dipertimbangkan oleh pemilik bisnis
  - Gunakan format Rp untuk mata uang (contoh: Rp 500.000)`;

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
