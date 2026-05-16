type MinimumOrderItem = {
  productId: number;
  quantity: number;
};

type MinimumOrderProduct = {
  name: string;
  minimumOrder?: number | null;
};

export type MinimumOrderViolation = {
  productId: number;
  productName: string;
  quantity: number;
  minimumOrder: number;
};

export function getMinimumOrderViolations(
  items: MinimumOrderItem[],
  productInfoMap: Map<number, MinimumOrderProduct>,
): MinimumOrderViolation[] {
  const violations: MinimumOrderViolation[] = [];
  const quantityByProductId = new Map<number, number>();

  for (const item of items) {
    const current = quantityByProductId.get(item.productId) ?? 0;
    quantityByProductId.set(
      item.productId,
      current + Math.max(0, Number(item.quantity ?? 0)),
    );
  }

  for (const [productId, quantity] of quantityByProductId.entries()) {
    const productInfo = productInfoMap.get(productId);
    if (!productInfo) continue;

    const minimumOrder = Math.max(0, Number(productInfo.minimumOrder ?? 0));
    if (minimumOrder <= 0 || quantity >= minimumOrder) continue;

    violations.push({
      productId,
      productName: productInfo.name,
      quantity,
      minimumOrder,
    });
  }

  return violations;
}

export function formatMinimumOrderViolation(
  violation: MinimumOrderViolation,
): string {
  return `Minimal order untuk "${violation.productName}" adalah ${violation.minimumOrder}, tetapi qty yang dimasukkan ${violation.quantity}.`;
}
