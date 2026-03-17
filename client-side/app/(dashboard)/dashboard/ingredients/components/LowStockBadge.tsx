interface Props {
  stock: number;
  minStock: number;
}

export default function LowStockBadge({ stock, minStock }: Props) {
  if (stock > minStock) return null;

  return (
    <span className="ml-2 text-xs bg-red-500 text-white px-2 py-1 rounded-full">
      Low Stock
    </span>
  );
}