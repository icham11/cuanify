export interface OrderSummaryItemLike {
  productName?: string | null;
  quantity?: number | null;
}

function normalizeLabel(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function getOrderItemsSummary(
  items: OrderSummaryItemLike[] | null | undefined,
  fallbackLabel?: string | null,
) {
  const parts =
    items
      ?.map((item) => {
        const productName = normalizeLabel(item.productName);
        if (!productName) return null;

        const quantity = Math.max(1, Number(item.quantity) || 1);
        return `${quantity}x ${productName}`;
      })
      .filter((value): value is string => Boolean(value)) ?? [];

  if (parts.length > 0) {
    return parts.join(" + ");
  }

  return normalizeLabel(fallbackLabel) || "Order";
}
