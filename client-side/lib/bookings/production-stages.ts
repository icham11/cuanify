export const PRODUCTION_STAGE_PERCENTAGES = {
  listing: 25,
  filling: 25,
  finishing: 50,
} as const;

export type ProductionStage = keyof typeof PRODUCTION_STAGE_PERCENTAGES;

export interface ProductionStageAssignment {
  stage: ProductionStage;
  staffId: number | null;
  tokenAmount: number;
  percentage: number;
}

export function getProductionStagePercentages(
  override?: Partial<Record<ProductionStage, number>>,
): Record<ProductionStage, number> {
  const percentages = {
    ...PRODUCTION_STAGE_PERCENTAGES,
    ...(override ?? {}),
  };
  const total = Object.values(percentages).reduce((sum, value) => sum + value, 0);
  if (Math.round(total * 100) / 100 !== 100) {
    throw new Error("Production stage percentages must total 100%.");
  }
  return percentages;
}

export function distributeProductionTokens(args: {
  totalTokens: number;
  staffByStage?: Partial<Record<ProductionStage, number | null>>;
  percentages?: Partial<Record<ProductionStage, number>>;
}): ProductionStageAssignment[] {
  const totalTokens = Math.max(0, Math.round(Number(args.totalTokens) || 0));
  const percentages = getProductionStagePercentages(args.percentages);
  const stages = Object.keys(percentages) as ProductionStage[];

  const hasDefaultSplit =
    percentages.listing === PRODUCTION_STAGE_PERCENTAGES.listing &&
    percentages.filling === PRODUCTION_STAGE_PERCENTAGES.filling &&
    percentages.finishing === PRODUCTION_STAGE_PERCENTAGES.finishing;

  if (hasDefaultSplit) {
    const listing = Math.round((totalTokens * percentages.listing) / 100);
    const filling = Math.round((totalTokens * percentages.filling) / 100);
    const finishing = Math.max(0, totalTokens - (listing + filling));
    const tokenByStage: Record<ProductionStage, number> = {
      listing,
      filling,
      finishing,
    };

    return stages.map((stage) => ({
      stage,
      staffId: args.staffByStage?.[stage] ?? null,
      tokenAmount: tokenByStage[stage],
      percentage: percentages[stage],
    }));
  }

  let allocated = 0;
  return stages.map((stage, index) => {
    const isLast = index === stages.length - 1;
    const raw = (totalTokens * percentages[stage]) / 100;
    const tokenAmount = isLast ? Math.max(0, totalTokens - allocated) : Math.round(raw);
    allocated += tokenAmount;

    return {
      stage,
      staffId: args.staffByStage?.[stage] ?? null,
      tokenAmount,
      percentage: percentages[stage],
    };
  });
}
