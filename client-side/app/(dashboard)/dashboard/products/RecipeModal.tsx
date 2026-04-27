"use client";

import { useRef } from "react";
import { ChefHat, Tag, X } from "lucide-react";
import type { Product } from "@/types/product";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);

export default function RecipeModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cogs = Number(product.cogs);
  const sellingPrice = Number(product.sellingPrice);
  const margin =
    sellingPrice > 0
      ? Math.round(((sellingPrice - cogs) / sellingPrice) * 100)
      : 0;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 bg-linear-to-r from-indigo-50 to-indigo-50">
          <div>
            <div className="flex items-center gap-2">
              <ChefHat size={18} className="text-indigo-500" />
              <h2 className="text-lg font-extrabold text-indigo-700">
                {product.name}
              </h2>
            </div>
            {product.category && (
              <span className="inline-flex items-center gap-1 mt-1 bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                <Tag size={10} />
                {product.category.name}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pricing summary */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 text-center">
          <div className="px-4 py-3">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
              Selling Price
            </p>
            <p className="text-sm font-extrabold text-indigo-700 mt-0.5">
              {formatCurrency(sellingPrice)}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
              COGS
            </p>
            <p className="text-sm font-extrabold text-slate-700 mt-0.5">
              {cogs > 0 ? formatCurrency(cogs) : "—"}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
              Margin
            </p>
            <p
              className={`text-sm font-extrabold mt-0.5 ${
                margin >= 50
                  ? "text-green-600"
                  : margin >= 20
                  ? "text-yellow-600"
                  : "text-red-600"
              }`}
            >
              {sellingPrice > 0 ? `${margin}%` : "—"}
            </p>
          </div>
        </div>

        {/* Recipe list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {product.recipes.length === 0 ? (
            <p className="text-center text-gray-400 italic py-8">
              Tidak ada bahan dalam resep ini.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                <div className="col-span-5">Bahan</div>
                <div className="col-span-2 text-right">Jml</div>
                <div className="col-span-2">Satuan</div>
                <div className="col-span-3 text-right">Biaya</div>
              </div>

              {product.recipes.map((r) => {
                const costPerUnit = Number(r.ingredient.costPerUnit ?? 0);
                const rowCost = Number(r.quantity) * costPerUnit;

                return (
                  <div
                    key={r.id}
                    className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100"
                  >
                    <div className="col-span-5 font-medium text-slate-700 text-sm truncate">
                      {r.ingredient.name}
                    </div>
                    <div className="col-span-2 text-right text-sm text-gray-600">
                      {Number(r.quantity)}
                    </div>
                    <div className="col-span-2 text-sm text-gray-500">
                      {r.ingredient.unit}
                    </div>
                    <div className="col-span-3 text-right text-xs font-bold text-indigo-600">
                      {rowCost > 0 ? formatCurrency(rowCost) : "—"}
                    </div>
                  </div>
                );
              })}

              {cogs > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-gray-100 px-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Total COGS/HPP
                  </span>
                  <span className="text-sm font-extrabold text-indigo-700">
                    {formatCurrency(cogs)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}