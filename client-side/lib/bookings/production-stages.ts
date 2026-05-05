export const PRODUCTION_STAGE_ORDER = [
  "lining",
  "filling",
  "finishing",
] as const;

export const PRODUCTION_STAGE_PERCENTAGES = {
  lining: 25,
  filling: 25,
  finishing: 50,
} as const;

export const PRODUCTION_STAGE_LABELS = {
  lining: "Lining",
  filling: "Filling",
  finishing: "Finishing",
} as const;

export type ProductionStage = (typeof PRODUCTION_STAGE_ORDER)[number];
export type ProductionStageInput = ProductionStage | "listing";

export interface ProductionStageTemplate {
  stage: ProductionStage;
  label: string;
  percentage: number;
}

export interface ProductionStageCategoryProfile {
  category: string;
  stages: ProductionStageTemplate[];
}

export interface ProductionStageAssignment {
  stage: ProductionStage;
  staffId: number | null;
  tokenAmount: number;
  percentage: number;
}

export function normalizeProductionStageKey(
  value: unknown,
): ProductionStage | null {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "listing") return "lining";
  if (
    normalized === "lining" ||
    normalized === "filling" ||
    normalized === "finishing"
  ) {
    return normalized;
  }
  return null;
}

function cloneStageTemplates(
  templates: readonly ProductionStageTemplate[],
): ProductionStageTemplate[] {
  return templates.map((entry) => ({ ...entry }));
}

export function getDefaultProductionStageTemplates(): ProductionStageTemplate[] {
  return PRODUCTION_STAGE_ORDER.map((stage) => ({
    stage,
    label: PRODUCTION_STAGE_LABELS[stage],
    percentage: PRODUCTION_STAGE_PERCENTAGES[stage],
  }));
}

export function normalizeProductionStageTemplates(
  value: unknown,
): ProductionStageTemplate[] {
  const defaults = getDefaultProductionStageTemplates();
  if (!Array.isArray(value)) return defaults;

  const map = new Map<ProductionStage, ProductionStageTemplate>();

  for (const stageKey of PRODUCTION_STAGE_ORDER) {
    const raw = value.find((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      return normalizeProductionStageKey(
        (entry as Record<string, unknown>).stage,
      ) === stageKey;
    });

    const fallback = defaults.find((entry) => entry.stage === stageKey)!;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      map.set(stageKey, fallback);
      continue;
    }

    const record = raw as Record<string, unknown>;
    const parsedPercentage = Number(record.percentage);
    map.set(stageKey, {
      stage: stageKey,
      label:
        typeof record.label === "string" && record.label.trim().length > 0
          ? record.label.trim()
          : fallback.label,
      percentage: Number.isFinite(parsedPercentage)
        ? Math.max(0, Math.round(parsedPercentage))
        : fallback.percentage,
    });
  }

  const normalized = PRODUCTION_STAGE_ORDER.map((stage) => map.get(stage)!);
  const total = normalized.reduce((sum, entry) => sum + entry.percentage, 0);
  if (total !== 100) {
    return defaults;
  }

  return normalized;
}

export function normalizeProductionStageProfiles(
  value: unknown,
): ProductionStageCategoryProfile[] {
  if (!Array.isArray(value)) return [];

  const deduped = new Map<string, ProductionStageCategoryProfile>();

  value.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const record = entry as Record<string, unknown>;
    const category =
      typeof record.category === "string" ? record.category.trim() : "";
    if (!category) return;

    deduped.set(category.toLowerCase(), {
      category,
      stages: normalizeProductionStageTemplates(record.stages),
    });
  });

  return Array.from(deduped.values()).sort((left, right) =>
    left.category.localeCompare(right.category, "id"),
  );
}

export function resolveProductionStageTemplatesForCategory(args?: {
  category?: string | null;
  profiles?: ProductionStageCategoryProfile[] | null;
}): ProductionStageTemplate[] {
  const category = `${args?.category || ""}`.trim().toLowerCase();
  const profiles = args?.profiles ?? [];
  if (category) {
    const matched = profiles.find(
      (entry) => entry.category.trim().toLowerCase() === category,
    );
    if (matched) {
      return cloneStageTemplates(matched.stages);
    }
  }
  return getDefaultProductionStageTemplates();
}

export function getProductionStagePercentages(
  override?: Partial<Record<ProductionStageInput, number>>,
): Record<ProductionStage, number> {
  const percentages: Record<ProductionStage, number> = {
    ...PRODUCTION_STAGE_PERCENTAGES,
  };
  for (const [stageKey, value] of Object.entries(override ?? {})) {
    const stage = normalizeProductionStageKey(stageKey);
    if (stage && value !== undefined) percentages[stage] = value;
  }
  const total = Object.values(percentages).reduce((sum, value) => sum + value, 0);
  if (Math.round(total * 100) / 100 !== 100) {
    throw new Error("Production stage percentages must total 100%.");
  }
  return percentages;
}

export function getProductionStageLabels(
  templates?: ProductionStageTemplate[] | null,
): Record<ProductionStage, string> {
  const normalized = normalizeProductionStageTemplates(templates);
  return PRODUCTION_STAGE_ORDER.reduce(
    (acc, stage) => {
      acc[stage] =
        normalized.find((entry) => entry.stage === stage)?.label ??
        PRODUCTION_STAGE_LABELS[stage];
      return acc;
    },
    {} as Record<ProductionStage, string>,
  );
}

export function getProductionStagePercentagesFromTemplates(
  templates?: ProductionStageTemplate[] | null,
): Record<ProductionStage, number> {
  const normalized = normalizeProductionStageTemplates(templates);
  return PRODUCTION_STAGE_ORDER.reduce(
    (acc, stage) => {
      acc[stage] =
        normalized.find((entry) => entry.stage === stage)?.percentage ??
        PRODUCTION_STAGE_PERCENTAGES[stage];
      return acc;
    },
    {} as Record<ProductionStage, number>,
  );
}

export function resolvePrimaryProductionCategory(
  items?: Array<{ category?: unknown }> | null,
): string {
  if (!Array.isArray(items) || items.length === 0) return "";

  const counts = new Map<string, { label: string; count: number }>();
  items.forEach((item) => {
    const label =
      typeof item?.category === "string" ? item.category.trim() : "";
    if (!label) return;
    const key = label.toLowerCase();
    const current = counts.get(key) ?? { label, count: 0 };
    current.count += 1;
    counts.set(key, current);
  });

  return Array.from(counts.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.label.localeCompare(right.label, "id");
  })[0]?.label ?? "";
}

export function distributeProductionTokens(args: {
  totalTokens: number;
  staffByStage?: Partial<Record<ProductionStageInput, number | null>>;
  percentages?: Partial<Record<ProductionStageInput, number>>;
}): ProductionStageAssignment[] {
  const totalTokens = Math.max(0, Math.round(Number(args.totalTokens) || 0));
  const percentages = getProductionStagePercentages(args.percentages);
  const stages = Object.keys(percentages) as ProductionStage[];
  const staffByStage = args.staffByStage ?? {};
  const getStageStaffId = (stage: ProductionStage) =>
    staffByStage[stage] ??
    (stage === "lining" ? staffByStage.listing : null) ??
    null;

  const hasDefaultSplit =
    percentages.lining === PRODUCTION_STAGE_PERCENTAGES.lining &&
    percentages.filling === PRODUCTION_STAGE_PERCENTAGES.filling &&
    percentages.finishing === PRODUCTION_STAGE_PERCENTAGES.finishing;

  if (hasDefaultSplit) {
    const lining = Math.round((totalTokens * percentages.lining) / 100);
    const filling = Math.round((totalTokens * percentages.filling) / 100);
    const finishing = Math.max(0, totalTokens - (lining + filling));
    const tokenByStage: Record<ProductionStage, number> = {
      lining,
      filling,
      finishing,
    };

    return stages.map((stage) => ({
      stage,
      staffId: getStageStaffId(stage),
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
      staffId: getStageStaffId(stage),
      tokenAmount,
      percentage: percentages[stage],
    };
  });
}

export function normalizeProductionStageAssignments(args: {
  totalTokens: number;
  stages?: ProductionStageAssignment[];
  staffByStage?: Partial<Record<ProductionStageInput, number | null>>;
  percentages?: Partial<Record<ProductionStageInput, number>>;
}): ProductionStageAssignment[] {
  const totalTokens = Math.max(0, Math.round(Number(args.totalTokens) || 0));
  const existingByStage = new Map<ProductionStage, ProductionStageAssignment>();
  for (const entry of args.stages ?? []) {
    const stage = normalizeProductionStageKey(entry.stage);
    if (!stage) continue;
    existingByStage.set(stage, { ...entry, stage });
  }

  const mergedStaffByStage: Partial<Record<ProductionStage, number | null>> = {
    lining:
      args.staffByStage?.lining ??
      args.staffByStage?.listing ??
      existingByStage.get("lining")?.staffId ??
      null,
    filling:
      args.staffByStage?.filling ??
      existingByStage.get("filling")?.staffId ??
      null,
    finishing:
      args.staffByStage?.finishing ??
      existingByStage.get("finishing")?.staffId ??
      null,
  };

  const canonical = distributeProductionTokens({
    totalTokens,
    staffByStage: mergedStaffByStage,
    percentages: args.percentages,
  });

  const existingSignature = canonical.map((entry) => {
    const existing = existingByStage.get(entry.stage);
    return existing
      ? {
          stage: entry.stage,
          staffId: existing.staffId ?? null,
          tokenAmount: Math.max(0, Math.round(Number(existing.tokenAmount) || 0)),
          percentage: Math.max(0, Math.round(Number(existing.percentage) || 0)),
        }
      : null;
  });

  const canonicalSignature = canonical.map((entry) => ({
    stage: entry.stage,
    staffId: entry.staffId ?? null,
    tokenAmount: entry.tokenAmount,
    percentage: entry.percentage,
  }));

  const isExactMatch =
    existingSignature.every((entry, index) => {
      const canonicalEntry = canonicalSignature[index];
      return (
        entry !== null &&
        canonicalEntry !== undefined &&
        entry.stage === canonicalEntry.stage &&
        entry.staffId === canonicalEntry.staffId &&
        entry.tokenAmount === canonicalEntry.tokenAmount &&
        entry.percentage === canonicalEntry.percentage
      );
    }) && existingSignature.every(Boolean);

  if (isExactMatch) {
    return canonicalSignature.map((entry) => {
      const existing = existingByStage.get(entry.stage);
      return {
        stage: entry.stage,
        staffId: existing?.staffId ?? entry.staffId,
        tokenAmount: entry.tokenAmount,
        percentage: entry.percentage,
      };
    });
  }

  return canonical;
}
