import type { ShippingProvider } from "@/lib/bookings/shipping-types";

export type CourierFilter =
  | ""
  | "grab-gojek"
  | "gojek"
  | "grab"
  | "paxel"
  | "jne"
  | "jnt";

type VisibleCourierFilter = Exclude<CourierFilter, "" | "grab-gojek">;

export const BOOKING_COURIER_FILTER_OPTIONS: ReadonlyArray<{
  value: VisibleCourierFilter;
  label: string;
}> = [
  { value: "gojek", label: "Gojek" },
  { value: "grab", label: "Grab" },
  { value: "paxel", label: "Paxel" },
  { value: "jne", label: "JNE" },
  { value: "jnt", label: "J&T" },
];

const COURIER_FILTER_VALUES: readonly CourierFilter[] = [
  "",
  "grab-gojek",
  "gojek",
  "grab",
  "paxel",
  "jne",
  "jnt",
];

export function parseCourierFilter(value: string | null): CourierFilter | null {
  if (value === null || value === "") return "";
  return COURIER_FILTER_VALUES.includes(value as CourierFilter)
    ? (value as CourierFilter)
    : null;
}

export function matchesCourierFilter(
  provider: ShippingProvider | null,
  courierFilter: CourierFilter,
): boolean {
  if (!courierFilter) return true;
  if (!provider) return false;

  if (courierFilter === "grab-gojek") {
    return provider === "GRAB" || provider === "GOJEK";
  }

  return provider === courierFilter.toUpperCase();
}
