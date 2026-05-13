import {
  DELIVERY_METHOD_OPTIONS,
  type DeliveryMethod,
} from "@/lib/bookings/delivery-rules";

type DeliveryMethodQuoteLike = {
  provider?: string | null;
  courierCode?: string | null;
  courierServiceCode?: string | null;
  courierServiceName?: string | null;
};

type ResolveOrderDeliveryMethodArgs = {
  deliveryMethod?: string | null;
  parsedDeliveryMethod?: string | null;
  notes?: string | null;
  shippingQuote?: DeliveryMethodQuoteLike | null;
};

function normalizeDeliveryMethodText(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeDeliveryMethodCode(
  value?: string | null,
): DeliveryMethod | null {
  const normalized = normalizeDeliveryMethodText(value);
  if (!normalized) return null;

  if (
    normalized === "pickup" ||
    normalized.includes("pickup")
  ) {
    return "PICKUP";
  }
  if (
    normalized === "customer_app_courier" ||
    normalized.includes("pesan customer") ||
    normalized.includes("customer")
  ) {
    return "CUSTOMER_APP_COURIER";
  }
  if (
    normalized === "assisted_gosend" ||
    normalized.includes("gosend") ||
    normalized.includes("go send")
  ) {
    return "ASSISTED_GOSEND";
  }
  if (
    normalized === "assisted_gocar" ||
    normalized.includes("gocar") ||
    normalized.includes("go car")
  ) {
    return "ASSISTED_GOCAR";
  }
  if (
    normalized === "assisted_grab" ||
    normalized.includes("grab")
  ) {
    return "ASSISTED_GRAB";
  }
  if (
    normalized === "assisted_paxel" ||
    normalized.includes("paxel")
  ) {
    return "ASSISTED_PAXEL";
  }
  if (
    normalized === "assisted_same_day" ||
    normalized.includes("same day") ||
    normalized.includes("same-day") ||
    normalized.includes("sameday")
  ) {
    return "ASSISTED_SAME_DAY";
  }
  if (
    normalized === "regular_jne_jnt" ||
    normalized.includes("jne") ||
    normalized.includes("j&t") ||
    normalized.includes("jnt")
  ) {
    return "REGULAR_JNE_JNT";
  }

  return null;
}

export function inferDeliveryMethodFromNotes(
  notes?: string | null,
): DeliveryMethod | null {
  const noteLines = String(notes ?? "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = noteLines.length - 1; index >= 0; index -= 1) {
    const match = noteLines[index]?.match(
      /^(?:delivery\s*method|metode\s*pengiriman|metode)\s*[:=-]\s*(.+)$/i,
    );
    const method = normalizeDeliveryMethodCode(match?.[1]);
    if (method) {
      return method;
    }
  }

  return null;
}

export function inferDeliveryMethodFromQuote(
  quote?: DeliveryMethodQuoteLike | null,
): DeliveryMethod | null {
  const raw = normalizeDeliveryMethodText(
    [
      quote?.provider,
      quote?.courierCode,
      quote?.courierServiceCode,
      quote?.courierServiceName,
    ]
      .filter(Boolean)
      .join(" "),
  );
  if (!raw) return null;

  if (raw.includes("paxel")) return "ASSISTED_PAXEL";
  if (raw.includes("grab")) return "ASSISTED_GRAB";
  if (raw.includes("jne") || raw.includes("j&t") || raw.includes("jnt")) {
    return "REGULAR_JNE_JNT";
  }
  if (
    raw.includes("gocar") ||
    raw.includes("go car") ||
    raw.includes("car") ||
    raw.includes("4w") ||
    raw.includes("suv") ||
    raw.includes("van")
  ) {
    return "ASSISTED_GOCAR";
  }
  if (
    raw.includes("gojek") ||
    raw.includes("gosend") ||
    raw.includes("go send") ||
    raw.includes("bike") ||
    raw.includes("motor") ||
    raw.includes("instant") ||
    raw.includes("same day") ||
    raw.includes("sameday") ||
    raw.includes("2w")
  ) {
    return "ASSISTED_GOSEND";
  }

  return null;
}

export function resolveOrderDeliveryMethod(
  args: ResolveOrderDeliveryMethodArgs,
): DeliveryMethod | null {
  return (
    normalizeDeliveryMethodCode(args.deliveryMethod) ||
    inferDeliveryMethodFromNotes(args.notes) ||
    normalizeDeliveryMethodCode(args.parsedDeliveryMethod) ||
    inferDeliveryMethodFromQuote(args.shippingQuote)
  );
}

export function resolveDeliveryMethodLabel(
  value?: string | null,
  fallbackText = "-",
): string {
  const method = normalizeDeliveryMethodCode(value);
  if (method) {
    return (
      DELIVERY_METHOD_OPTIONS.find((option) => option.value === method)?.label ||
      method
    );
  }

  const raw = String(value ?? "").trim();
  return raw || fallbackText;
}
