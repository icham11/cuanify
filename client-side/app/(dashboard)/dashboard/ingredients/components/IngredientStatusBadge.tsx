import React from "react";

interface Props {
  stock: number;
  minStock: number;
}

/**
 * Tier logic (evaluated top-to-bottom):
 *  stock === -1                            → Belum di-set  (gray)   — AI placeholder, never configured
 *  stock === 0                             → Habis          (red)    — completely out of stock
 *  minStock !== -1 && stock <= minStock    → Perlu Restock  (orange) — at or below minimum
 *  minStock !== -1 && stock <= minStock*2  → Bahaya         (yellow) — approaching minimum (within 2× threshold)
 *  otherwise                              → Aman           (green)  — safe
 */
export default function IngredientStatusBadge({ stock, minStock }: Props) {
  let label: string;
  let color: string;

  if (stock === -1) {
    label = "Belum di-set";
    color = "bg-gray-100 text-gray-500";
  } else if (stock === 0) {
    label = "Habis";
    color = "bg-red-100 text-red-700";
  } else if (minStock !== -1 && stock <= minStock) {
    label = "Perlu Restock";
    color = "bg-orange-100 text-orange-700";
  } else if (minStock !== -1 && stock <= minStock * 2) {
    label = "Bahaya";
    color = "bg-yellow-100 text-yellow-700";
  } else {
    label = "Aman";
    color = "bg-green-100 text-green-700";
  }

  return <span className={`px-3 py-1 rounded-full font-semibold text-xs ${color}`}>{label}</span>;
}
