import { analyzeBusinessData } from "@/lib/groq";
import prisma from "@/lib/prisma";
export interface InventoryAlert {
  ingredientName: string;
  currentStock: number;
  minStock: number;
  unit: string;
  daysUntilEmpty: number | null;
  severity: "critical" | "warning" | "info";
  suggestion: string;
}
export interface SalesForecastItem {
  productName: string;
  currentTrend: string;
  predicted7Days: number;
  predicted30Days: number;
  confidence: number;
  recommendation: string;
}
export interface MenuRecommendation {
  type: "new_product" | "modify_existing" | "remove" | "promotion";
  name: string;
  reason: string;
  expectedImpact: string;
  priority: "high" | "medium" | "low";
}
export interface ProfitOptimization {
  area: string;
  currentValue: string;
  suggestion: string;
  potentialSavings: string;
  difficulty: "easy" | "medium" | "hard";
}
export interface SmartInsights {
  inventoryAlerts: InventoryAlert[];
  salesForecast: SalesForecastItem[];
  menuRecommendations: MenuRecommendation[];
  profitOptimizations: ProfitOptimization[];
  summary: string;
  generatedAt: string;
}
export async function getInventoryAlerts(businessId: number): Promise<InventoryAlert[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const ingredients = await prisma.ingredient.findMany({
    where: { businessId },
    include: {
      inventoryBatches: { where: { remainingQty: { gt: 0 } } },
      inventoryMovements: {
        where: { type: "Out", createdAt: { gte: sevenDaysAgo } },
        select: { quantity: true },
      },
    },
  });
  const alerts: InventoryAlert[] = [];
  for (const ing of ingredients) {
    const currentStock = ing.inventoryBatches.reduce((s, b) => s + Number(b.remainingQty), 0);
    const weeklyUsage = ing.inventoryMovements.reduce((s, m) => s + Number(m.quantity), 0);
    const dailyUsage = weeklyUsage / 7;
    const daysUntilEmpty = dailyUsage > 0 ? Math.round(currentStock / dailyUsage) : null;
    let severity: "critical" | "warning" | "info" = "info";
    let suggestion = "";
    if (currentStock <= 0) {
      severity = "critical";
      suggestion = "Stok " + ing.name + " habis! Segera beli.";
    } else if (currentStock <= ing.minStock) {
      severity = "critical";
      suggestion = "Stok " + ing.name + " di bawah minimum. Beli minimal " + (ing.minStock * 2) + " " + ing.unit + ".";
    } else if (daysUntilEmpty !== null && daysUntilEmpty <= 3) {
      severity = "warning";
      suggestion = ing.name + " habis dalam ~" + daysUntilEmpty + " hari. Pertimbangkan restock.";
    } else if (daysUntilEmpty !== null && daysUntilEmpty <= 7) {
      severity = "warning";
      suggestion = ing.name + " cukup untuk " + daysUntilEmpty + " hari.";
    }
    if (severity !== "info") {
      alerts.push({
        ingredientName: ing.name,
        currentStock,
        minStock: ing.minStock,
        unit: ing.unit,
        daysUntilEmpty,
        severity,
        suggestion,
      });
    }
  }
  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}
export async function getSalesForecast(businessId: number): Promise<SalesForecastItem[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sales = await prisma.saleItem.findMany({
    where: { sale: { businessId, createdAt: { gte: thirtyDaysAgo } } },
    include: {
      product: { select: { name: true, sellingPrice: true } },
      sale: { select: { createdAt: true } },
    },
  });
  const productData: Record<string, { name: string; dailySales: Record<string, number> }> = {};
  for (const item of sales) {
    const n = item.product.name;
    if (!productData[n]) productData[n] = { name: n, dailySales: {} };
    const d = item.sale.createdAt.toISOString().split("T")[0];
    productData[n].dailySales[d] = (productData[n].dailySales[d] || 0) + item.quantity;
  }
  const summaries = Object.values(productData).map((p) => {
    const days = Object.keys(p.dailySales).sort();
    const totalQty = Object.values(p.dailySales).reduce((s, q) => s + q, 0);
    const avgDaily = totalQty / Math.max(days.length, 1);
    const mid = Math.floor(days.length / 2);
    const firstHalf = days.slice(0, mid).reduce((s, d) => s + (p.dailySales[d] || 0), 0);
    const secondHalf = days.slice(mid).reduce((s, d) => s + (p.dailySales[d] || 0), 0);
    const trend = secondHalf > firstHalf ? "naik" : secondHalf < firstHalf ? "turun" : "stabil";
    return { name: p.name, totalQty, avgDaily, trend, daysWithSales: days.length };
  });
  if (summaries.length === 0) return [];
  const prompt = "Data penjualan 30 hari UMKM:\n" + JSON.stringify(summaries, null, 2) + "\n\nBuat prediksi penjualan JSON array (TANPA markdown):\n[{\"productName\":\"...\",\"currentTrend\":\"naik/turun/stabil\",\"predicted7Days\":0,\"predicted30Days\":0,\"confidence\":0.0-1.0,\"recommendation\":\"...\"}]\nRespond ONLY valid JSON array.";
  try {
    const result = await analyzeBusinessData({ prompt, maxTokens: 2048, temperature: 0.3 });
    return JSON.parse(result.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch {
    return summaries.map((p) => ({
      productName: p.name,
      currentTrend: p.trend,
      predicted7Days: Math.round(p.avgDaily * 7),
      predicted30Days: Math.round(p.avgDaily * 30),
      confidence: 0.5,
      recommendation: "Rata-rata " + p.avgDaily.toFixed(1) + "/hari.",
    }));
  }
}
export async function getMenuRecommendations(businessId: number): Promise<MenuRecommendation[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [products, sales, ingredients] = await Promise.all([
    prisma.product.findMany({ where: { businessId }, include: { category: true } }),
    prisma.sale.findMany({
      where: { businessId, createdAt: { gte: thirtyDaysAgo } },
      include: { saleItems: { include: { product: true } } },
    }),
    prisma.ingredient.findMany({
      where: { businessId },
      include: { inventoryBatches: { where: { remainingQty: { gt: 0 } } } },
    }),
  ]);
  const salesMap: Record<number, number> = {};
  sales.forEach((s) => s.saleItems.forEach((si) => { salesMap[si.productId] = (salesMap[si.productId] || 0) + si.quantity; }));
  const summary = products.map((p) => ({
    name: p.name, category: p.category?.name, price: Number(p.sellingPrice), isActive: p.isActive, totalSold: salesMap[p.id] || 0,
  }));
  const avail = ingredients.map((i) => ({
    name: i.name, stock: i.inventoryBatches.reduce((s, b) => s + Number(b.remainingQty), 0),
  }));
  const prompt = "Analisis menu UMKM:\nPRODUK: " + JSON.stringify(summary) + "\nBAHAN: " + JSON.stringify(avail) + "\n\nBerikan 3-5 rekomendasi JSON array (TANPA markdown):\n[{\"type\":\"new_product|modify_existing|remove|promotion\",\"name\":\"...\",\"reason\":\"...\",\"expectedImpact\":\"...\",\"priority\":\"high|medium|low\"}]\nRespond ONLY valid JSON array.";
  try {
    const result = await analyzeBusinessData({ prompt, maxTokens: 2048, temperature: 0.5 });
    return JSON.parse(result.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch { return []; }
}
export async function getProfitOptimization(businessId: number): Promise<ProfitOptimization[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sales = await prisma.sale.findMany({
    where: { businessId, createdAt: { gte: thirtyDaysAgo } },
    include: { saleItems: { include: { product: true } } },
  });
  const agg: Record<string, { revenue: number; cost: number; qty: number }> = {};
  sales.forEach((s) => s.saleItems.forEach((si) => {
    const n = si.product.name;
    if (!agg[n]) agg[n] = { revenue: 0, cost: 0, qty: 0 };
    agg[n].revenue += Number(si.priceAtSale) * si.quantity;
    agg[n].cost += Number(si.costAtSale) * si.quantity;
    agg[n].qty += si.quantity;
  }));
  const profitData = Object.entries(agg).map(([name, d]) => ({
    name, ...d, profit: d.revenue - d.cost,
    margin: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue * 100) : 0,
  }));
  const prompt = "Analisis profit UMKM:\n" + JSON.stringify(profitData, null, 2) + "\n\nBerikan 3-5 optimasi JSON array (TANPA markdown):\n[{\"area\":\"pricing|cost|waste|menu-mix\",\"currentValue\":\"...\",\"suggestion\":\"...\",\"potentialSavings\":\"...\",\"difficulty\":\"easy|medium|hard\"}]\nRespond ONLY valid JSON array.";
  try {
    const result = await analyzeBusinessData({ prompt, maxTokens: 2048, temperature: 0.4 });
    return JSON.parse(result.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch { return []; }
}
export async function getSmartInsights(businessId: number): Promise<SmartInsights> {
  const [inventoryAlerts, salesForecast, menuRecommendations, profitOptimizations] =
    await Promise.all([
      getInventoryAlerts(businessId),
      getSalesForecast(businessId),
      getMenuRecommendations(businessId),
      getProfitOptimization(businessId),
    ]);
  const criticalAlerts = inventoryAlerts.filter((a) => a.severity === "critical").length;
  const topProduct = [...salesForecast].sort((a, b) => b.predicted7Days - a.predicted7Days)[0];
  const easyWins = profitOptimizations.filter((p) => p.difficulty === "easy").length;
  let summary = "📊 Ringkasan AI Insights:\n";
  if (criticalAlerts > 0) summary += "⚠️ " + criticalAlerts + " bahan baku kritis!\n";
  if (topProduct) summary += "🏆 Terlaris: " + topProduct.productName + " (~" + topProduct.predicted7Days + " unit/minggu)\n";
  if (easyWins > 0) summary += "💡 " + easyWins + " optimasi mudah tersedia\n";
  if (menuRecommendations.length > 0) summary += "🍽️ " + menuRecommendations.length + " rekomendasi menu\n";
  return { inventoryAlerts, salesForecast, menuRecommendations, profitOptimizations, summary, generatedAt: new Date().toISOString() };
}
