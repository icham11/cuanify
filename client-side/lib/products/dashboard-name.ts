export function buildDashboardProductName(args: {
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

