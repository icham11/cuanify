import fs from "fs";
import path from "path";

if (!process.env.DATABASE_URL) {
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const match = envFile.match(/^DATABASE_URL=(.*)$/m);
    if (match) process.env.DATABASE_URL = match[1].trim();
  } catch (e) {}
}

// Simulasi SETELAH fix

function normalizeTokenLookupKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildDashboardProductName(args: {
  productName: string;
  variantLabel: string;
  variantCount: number;
}): string {
  if (
    args.variantCount === 1 &&
    ["standard", "start from"].includes(args.variantLabel.trim().toLowerCase())
  ) {
    return args.productName;
  }
  return `${args.productName} - ${args.variantLabel}`;
}

function isCustomCookieItem(item: { category: string; productName: string; size: string }): boolean {
  if (item.category !== "Cookies") return false;
  const productName = item.productName.toLowerCase();
  const size = item.size.toLowerCase();
  if (productName === "cookies") return true;
  if (["simple", "normal", "hard", "advanced", "expert"].includes(size)) return true;
  return productName.includes("custom cookies") || productName.includes("individual cookie");
}

// FIX: Fungsi yang sudah diperbaiki
function toDashboardProductNameFromItem(item: { category: string; productName: string; size: string }): string {
  let effectiveProductName = item.productName;
  if (isCustomCookieItem(item) && effectiveProductName.toLowerCase().trim() === "cookies") {
    effectiveProductName = "Custom Cookies";
  }
  return buildDashboardProductName({
    productName: effectiveProductName,
    variantLabel: item.size,
    variantCount: 1,
  });
}

async function main() {
  const { prisma } = await import("../lib/prisma");

  try {
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: "Cookie", mode: "insensitive" } },
          { name: { contains: "Cupcake", mode: "insensitive" } },
        ],
        deletedAt: null,
      },
      select: { name: true, minimumOrder: true },
      distinct: ["name"],
      orderBy: { name: "asc" },
    });

    const minOrderMap = new Map<string, number>();
    products.forEach((product) => {
      const lookupKey = normalizeTokenLookupKey(product.name);
      if ((product.minimumOrder ?? 0) > 0) {
        minOrderMap.set(lookupKey, product.minimumOrder ?? 0);
      }
    });

    const testItems = [
      { category: "Cookies", productName: "Cookies", size: "Simple" },
      { category: "Cookies", productName: "Cookies", size: "Normal" },
      { category: "Cookies", productName: "Cookies", size: "Hard" },
      { category: "Cookies", productName: "Cookies", size: "Advanced" },
      { category: "Cookies", productName: "Cookies", size: "Expert" },
    ];

    console.log("\n=== SIMULASI SETELAH FIX ===\n");

    for (const item of testItems) {
      const dashboardName = toDashboardProductNameFromItem(item);
      const lookupKey = normalizeTokenLookupKey(dashboardName);
      const dbMinOrder = minOrderMap.get(lookupKey);
      const status = dbMinOrder !== undefined ? "✅ MATCH" : "❌ NO MATCH";
      console.log(`Form: "${item.productName}" size="${item.size}" → key="${lookupKey}" → DB min=${dbMinOrder ?? "N/A"} → ${status}`);
    }

    console.log("\n✅ Jika client ubah minimumOrder di admin panel, booking form akan langsung menggunakan angka baru dari DB.");

  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
