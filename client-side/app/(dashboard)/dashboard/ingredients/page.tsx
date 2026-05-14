"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Package } from "lucide-react";

export default function IngredientsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
      <div className="space-y-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="mb-3 flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <h1 className="text-lg font-bold">
              Halaman Ingredients Dinonaktifkan
            </h1>
          </div>
          <p className="text-sm text-amber-800">
            Halaman ini tidak dihapus, tetapi saat ini dinonaktifkan dan tidak
            ditampilkan di menu.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/products"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Package className="h-4 w-4" />
            Buka Products
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
