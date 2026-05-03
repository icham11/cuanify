import type { BakeryBusinessSettings } from "@/lib/bakery/settings";

export function getStaffTokenLimitForUser(args: {
  settings: BakeryBusinessSettings;
  userId: number | null | undefined;
}): number {
  if (!args.userId) return args.settings.staffDailyTokenLimit;
  return (
    args.settings.staffSettings.find((entry) => entry.userId === args.userId)
      ?.dailyTokenLimit ?? args.settings.staffDailyTokenLimit
  );
}
