import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import { flattenCatalogProductsForDashboard } from "@/lib/bookings/product-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function GET() {
  try {
    const { businessId } = await requireAuth();
    const [products, effectiveCatalog] = await Promise.all([
      prisma.product.findMany({ // Query data produk menggunakan Prisma ORM
        where: { // Kriteria pencarian data
          businessId, // Bisnis aktif yang sedang login
          deletedAt: null, // Hanya ambil produk yang tidak dihapus (aktif/soft-delete check)
        }, // Akhir dari kriteria where
        select: { // Pilih kolom tertentu untuk menghemat bandwidth
          name: true, // Ambil nama produk dashboard
          productionToken: true, // Ambil token produksi aktif
          minimumOrder: true, // TAMBAHKAN: Ambil batas minimal order dari DB
        }, // Akhir dari select
        orderBy: { // Urutan pengembalian data
          name: "asc", // Urutkan nama produk dari A ke Z
        }, // Akhir dari orderBy
      }), // Akhir dari query findMany
      loadEffectiveBookingCatalog(businessId), // Muat katalog booking efektif untuk fallback token
    ]); // Akhir dari Promise.all

    const fallbackTokenMap = new Map<string, number>(); // Inisialisasi map untuk token fallback
    flattenCatalogProductsForDashboard(effectiveCatalog.productCatalog).forEach( // Iterasi produk katalog
      (item) => { // Setiap item katalog diproses
        fallbackTokenMap.set(normalizeKey(item.name), Math.max(0, Number(item.productionToken || 0))); // Set token fallback dengan key nama produk yang dinormalisasi
      }, // Akhir iterasi item
    ); // Akhir dari forEach

    const data = products.map((product) => { // Petakan setiap produk hasil DB ke array response
      const current = Math.max(0, Number(product.productionToken || 0)); // Parsing token produksi aktif dari DB
      const fallback = fallbackTokenMap.get(normalizeKey(product.name)) ?? 0; // Dapatkan fallback token jika token DB bernilai 0
      return { // Kembalikan objek data produk terformat
        name: product.name, // Nama produk dashboard
        productionToken: current > 0 ? current : fallback, // Gunakan token aktif DB atau fallback katalog
        minimumOrder: Math.max(0, Number(product.minimumOrder || 0)), // Sertakan batas minimal order dari DB
      }; // Akhir pengembalian objek
    }); // Akhir pemetaan map data

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/products/token-map error:", error);
    return NextResponse.json(
      { error: "Failed to load product token map" },
      { status: 500 },
    );
  }
}

