import type {
  ShippingProvider,
  ShippingQuote,
  ShippingQuoteRequest,
  ShippingQuoteResponse,
  ShippingResiRequest,
  ShippingResiResponse,
  ShippingShipment,
} from "@/lib/bookings/shipping-types";

interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface OriginConfig extends GeoPoint {
  address: string;
  postalCode: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

interface BiteshipRateLike {
  courier_name?: string;
  courier_code?: string;
  courier_service_name?: string;
  courier_service_code?: string;
  company?: string;
  type?: string;
  description?: string;
  price?: number;
  final_price?: number;
  amount?: number;
  duration?: string | number;
  shipment_duration_range?: string;
  shipment_duration_unit?: string;
  estimation?: string;
}

interface BiteshipAreaLike {
  id?: string;
  name?: string;
}

type RateDestination =
  | {
      mode: "coordinate";
      latitude: number;
      longitude: number;
    }
  | {
      mode: "postal";
      postalCode: string;
    };

interface DestinationResolution {
  point: GeoPoint | null;
  postalCode?: string;
}

const BITESHIP_BASE_URL = "https://api.biteship.com/v1";
const DEFAULT_ORIGIN: OriginConfig = {
  address: "Jakarta Selatan",
  postalCode: "12190",
  latitude: -6.261493,
  longitude: 106.8106,
  contactName: "Crumbella Admin",
  contactPhone: "628111111111",
  contactEmail: "admin@crumbella.local",
};

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getOriginConfig(): OriginConfig {
  return {
    address: process.env.SHIPPING_ORIGIN_ADDRESS || DEFAULT_ORIGIN.address,
    postalCode: process.env.SHIPPING_ORIGIN_POSTAL_CODE || DEFAULT_ORIGIN.postalCode,
    latitude: parseNumber(process.env.SHIPPING_ORIGIN_LATITUDE, DEFAULT_ORIGIN.latitude),
    longitude: parseNumber(process.env.SHIPPING_ORIGIN_LONGITUDE, DEFAULT_ORIGIN.longitude),
    contactName: process.env.SHIPPING_ORIGIN_CONTACT_NAME || DEFAULT_ORIGIN.contactName,
    contactPhone: process.env.SHIPPING_ORIGIN_CONTACT_PHONE || DEFAULT_ORIGIN.contactPhone,
    contactEmail: process.env.SHIPPING_ORIGIN_CONTACT_EMAIL || DEFAULT_ORIGIN.contactEmail,
  };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineKm(origin: GeoPoint, destination: GeoPoint): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(destination.latitude - origin.latitude);
  const dLon = toRadians(destination.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(destination.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function parseProviderFromCourierCode(rawCode: string): ShippingProvider | null {
  const code = rawCode.toLowerCase();
  if (code.includes("jne")) return "JNE";
  if (code.includes("paxel")) return "PAXEL";
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAddressForLookup(address: string): string {
  return cleanSpaces(
    address
      .replace(/\bjl\.?\b/gi, "jalan")
      .replace(/\bjaksel\b/gi, "jakarta selatan")
      .replace(/\bjakbar\b/gi, "jakarta barat")
      .replace(/\bjakut\b/gi, "jakarta utara")
      .replace(/\bjakpus\b/gi, "jakarta pusat")
      .replace(/\bjaktim\b/gi, "jakarta timur")
  );
}

function extractPostalCode(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const matched = text.match(/\b\d{5}\b/);
  return matched?.[0];
}

function sanitizePostalCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length === 5 ? digits : undefined;
}

function buildAreaLookupQueries(address: string, destinationArea?: string): string[] {
  const normalizedAddress = normalizeAddressForLookup(address);
  const queries = [
    address,
    normalizedAddress,
    destinationArea || "",
    `${normalizedAddress} ${destinationArea || ""}`.trim(),
  ].map(cleanSpaces);

  const uniqueQueries = uniqueByKey(
    queries.filter(Boolean),
    (entry) => entry.toLowerCase()
  );
  return uniqueQueries;
}

async function resolvePostalCodeFromBiteshipArea(
  address: string,
  destinationArea?: string
): Promise<string | undefined> {
  const apiKey = process.env.BITESHIP_API_KEY || "";
  if (!apiKey) return undefined;

  const queries = buildAreaLookupQueries(address, destinationArea);
  for (const queryText of queries) {
    const query = new URLSearchParams({
      countries: "ID",
      input: queryText,
    });

    let response: Response;
    try {
      response = await fetch(`${BITESHIP_BASE_URL}/maps/areas?${query.toString()}`, {
        headers: {
          Authorization: apiKey,
        },
        cache: "no-store",
      });
    } catch {
      continue;
    }

    if (!response.ok) {
      continue;
    }

    const data = (await response.json().catch(() => ({}))) as {
      areas?: BiteshipAreaLike[];
    };

    const areas = Array.isArray(data.areas) ? data.areas : [];
    for (const area of areas) {
      const code = extractPostalCode(asString(area.name));
      if (code) return code;
    }
  }

  return undefined;
}

async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const normalizedAddress = normalizeAddressForLookup(address);
  if (!normalizedAddress) return null;

  const query = new URLSearchParams({
    format: "json",
    limit: "1",
    q: `${normalizedAddress}, Indonesia`,
  });

  let response: Response;
  try {
    response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
      headers: {
        "User-Agent": "cuanify-bakery-oms/1.0",
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const payload = (await response.json().catch(() => [])) as Array<{
    lat?: string;
    lon?: string;
  }>;
  const first = payload[0];
  if (!first?.lat || !first?.lon) return null;

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}

async function resolveDestination(
  payload: Pick<
    ShippingQuoteRequest,
    "destinationAddress" | "destinationArea" | "destinationPostalCode" | "destinationLatitude" | "destinationLongitude"
  >
): Promise<DestinationResolution> {
  if (
    Number.isFinite(payload.destinationLatitude) &&
    Number.isFinite(payload.destinationLongitude)
  ) {
    return {
      point: {
        latitude: Number(payload.destinationLatitude),
        longitude: Number(payload.destinationLongitude),
      },
      postalCode:
        sanitizePostalCode(payload.destinationPostalCode) ||
        extractPostalCode(payload.destinationAddress),
    };
  }

  const postalCodeFromPayload = sanitizePostalCode(payload.destinationPostalCode);
  const postalCodeFromAddress = extractPostalCode(payload.destinationAddress);
  const postalCodeFromAreaLookup =
    postalCodeFromPayload ||
    postalCodeFromAddress ||
    (await resolvePostalCodeFromBiteshipArea(payload.destinationAddress, payload.destinationArea));

  const point = await geocodeAddress(payload.destinationAddress);

  return {
    point,
    postalCode: postalCodeFromAreaLookup,
  };
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function getBiteshipRates(args: {
  destination: RateDestination;
  items: ShippingQuoteRequest["items"];
}): Promise<ShippingQuote[]> {
  const apiKey = process.env.BITESHIP_API_KEY || "";
  if (!apiKey) return [];

  const origin = getOriginConfig();
  const payload = {
    ...(args.destination.mode === "coordinate"
      ? {
          origin_latitude: origin.latitude,
          origin_longitude: origin.longitude,
          destination_latitude: args.destination.latitude,
          destination_longitude: args.destination.longitude,
        }
      : {
          origin_postal_code: sanitizePostalCode(origin.postalCode) || undefined,
          destination_postal_code: args.destination.postalCode,
        }),
    couriers: "jne,paxel",
    items: args.items.map((item) => ({
      name: item.name || "Order Item",
      description: "Bakery item",
      value: Math.max(1000, Number(item.value) || 1000),
      quantity: Math.max(1, Number(item.quantity) || 1),
      weight: Math.max(100, Number(item.weightGram) || 100),
      length: 20,
      width: 20,
      height: 10,
    })),
  };

  const response = await fetch(`${BITESHIP_BASE_URL}/rates/couriers`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as {
    pricing?: BiteshipRateLike[];
    rates?: BiteshipRateLike[];
    couriers?: BiteshipRateLike[];
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || data.message || `Biteship rates error ${response.status}`);
  }

  const rawRates = [
    ...(Array.isArray(data.pricing) ? data.pricing : []),
    ...(Array.isArray(data.rates) ? data.rates : []),
    ...(Array.isArray(data.couriers) ? data.couriers : []),
  ];

  const mapped = rawRates
    .map((entry) => {
      const courierCode = asString(entry.courier_code || entry.company).toLowerCase();
      const provider = parseProviderFromCourierCode(courierCode);
      if (!provider) return null;

      const serviceCode = asString(entry.courier_service_code || entry.type).toLowerCase() || "regular";
      const serviceName =
        asString(entry.courier_service_name) ||
        asString(entry.description) ||
        asString(entry.type) ||
        "Regular";
      const price = Math.round(
        asNumber(entry.price) || asNumber(entry.final_price) || asNumber(entry.amount)
      );
      if (price <= 0) return null;

      const eta =
        asString(entry.estimation) ||
        asString(entry.duration) ||
        [
          asString(entry.shipment_duration_range),
          asString(entry.shipment_duration_unit),
        ]
          .join(" ")
          .trim() ||
        "-";

      return {
        provider,
        courierCode,
        courierServiceCode: serviceCode,
        courierServiceName: serviceName,
        price,
        eta,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return uniqueByKey(
    mapped,
    (entry) => `${entry.provider}:${entry.courierCode}:${entry.courierServiceCode}:${entry.price}`
  ).map((entry) => ({
    id: `biteship-${entry.courierCode}-${entry.courierServiceCode}-${entry.price}`,
    provider: entry.provider,
    courierCode: entry.courierCode,
    courierServiceCode: entry.courierServiceCode,
    courierServiceName: entry.courierServiceName,
    price: entry.price,
    eta: entry.eta,
    distanceKm: 0,
    source: "biteship" as const,
  }));
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "628111111111";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function toJakartaDateOnly(input: Date): string {
  return input.toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
}

function parseJakartaToday(): string {
  return toJakartaDateOnly(new Date());
}

function normalizeDeliveryTime(value: string | undefined): string {
  if (!value) return "09:00";
  const matched = value.match(/^(\d{2}):(\d{2})$/);
  if (!matched) return "09:00";
  return `${matched[1]}:${matched[2]}`;
}

export async function getShippingQuote(
  payload: ShippingQuoteRequest
): Promise<ShippingQuoteResponse> {
  const origin = getOriginConfig();
  const destination = await resolveDestination(payload);

  if (!destination.point && !destination.postalCode) {
    return {
      success: false,
      quotes: [],
      distanceKm: 0,
      error:
        "Alamat belum bisa dipetakan. Mohon lengkapi alamat atau tambahkan kode pos 5 digit.",
    };
  }

  const distanceKm = destination.point
    ? Number(haversineKm(origin, destination.point).toFixed(2))
    : 0;
  let biteshipQuotes: ShippingQuote[] = [];

  try {
    biteshipQuotes = await getBiteshipRates({
      destination: destination.postalCode
        ? {
            mode: "postal",
            postalCode: destination.postalCode,
          }
        : {
            mode: "coordinate",
            latitude: destination.point!.latitude,
            longitude: destination.point!.longitude,
          },
      items: payload.items,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? `Gagal mengambil ongkir live dari Biteship: ${error.message}`
        : "Gagal mengambil ongkir live dari Biteship.";
    return {
      success: false,
      quotes: [],
      distanceKm,
      destinationLatitude: destination.point?.latitude,
      destinationLongitude: destination.point?.longitude,
      error: message,
    };
  }

  if (biteshipQuotes.length === 0) {
    return {
      success: false,
      quotes: [],
      distanceKm,
      destinationLatitude: destination.point?.latitude,
      destinationLongitude: destination.point?.longitude,
      error: "Tidak ada layanan kurir yang tersedia untuk alamat ini saat ini.",
    };
  }

  const quotes = biteshipQuotes.map((quote) => ({ ...quote, distanceKm }));

  return {
    success: true,
    quotes,
    distanceKm,
    destinationLatitude: destination.point?.latitude,
    destinationLongitude: destination.point?.longitude,
  };
}

export async function createShippingResi(
  payload: ShippingResiRequest
): Promise<ShippingResiResponse> {
  const apiKey = process.env.BITESHIP_API_KEY || "";
  const origin = getOriginConfig();

  if (!apiKey) {
    return {
      success: false,
      error: "BITESHIP_API_KEY belum di-set. Resi live tidak bisa dibuat.",
    };
  }

  const destination = await resolveDestination({
    destinationAddress: payload.destinationAddress,
    destinationArea: undefined,
    destinationPostalCode: payload.destinationPostalCode,
    destinationLatitude: payload.destinationLatitude,
    destinationLongitude: payload.destinationLongitude,
  });

  const requestedDate = payload.deliveryDate || "";
  const todayJakarta = parseJakartaToday();
  const isFutureDelivery = Boolean(
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate > todayJakarta
  );
  const deliveryType = isFutureDelivery ? "later" : "now";
  const deliveryDate = isFutureDelivery ? requestedDate : undefined;
  const deliveryTime = isFutureDelivery ? normalizeDeliveryTime(payload.deliveryTime) : undefined;

  const response = await fetch(`${BITESHIP_BASE_URL}/orders`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reference_id: payload.bookingCode || payload.orderId,
      shipper_contact_name: origin.contactName,
      shipper_contact_phone: normalizePhone(origin.contactPhone),
      shipper_contact_email: origin.contactEmail,
      shipper_organization: "Crumbella",
      origin_contact_name: origin.contactName,
      origin_contact_phone: normalizePhone(origin.contactPhone),
      origin_address: origin.address,
      origin_postal_code: Number(origin.postalCode) || undefined,
      origin_coordinate: {
        latitude: origin.latitude,
        longitude: origin.longitude,
      },
      destination_contact_name: payload.customerName,
      destination_contact_phone: normalizePhone(payload.customerPhone),
      destination_contact_email: origin.contactEmail,
      destination_address: payload.destinationAddress,
      destination_postal_code:
        Number(destination.postalCode || extractPostalCode(payload.destinationAddress)) ||
        undefined,
      destination_coordinate:
        destination.point?.latitude && destination.point?.longitude
          ? {
              latitude: destination.point.latitude,
              longitude: destination.point.longitude,
            }
          : undefined,
      delivery_type: deliveryType,
      delivery_date: deliveryDate,
      delivery_time: deliveryTime,
      order_note: `Booking ${payload.bookingCode || payload.orderId}`,
      courier_company: payload.selectedQuote.courierCode,
      courier_type: payload.selectedQuote.courierServiceCode,
      items: payload.items.map((item) => ({
        name: item.name || "Order Item",
        description: `Booking ${payload.bookingCode || payload.orderId}`,
        category: "food_and_drink",
        value: Math.max(1000, Number(item.value) || 1000),
        quantity: Math.max(1, Number(item.quantity) || 1),
        weight: Math.max(100, Number(item.weightGram) || 100),
        length: 20,
        width: 20,
        height: 10,
      })),
    }),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      asString(data.error) || asString(data.message) || `Biteship create order error ${response.status}`;
    return {
      success: false,
      error: message,
    };
  }

  const waybill =
    asString(data.waybill_id) ||
    asString(data.waybill) ||
    asString(data.tracking_number) ||
    asString((data.courier as Record<string, unknown> | undefined)?.waybill_id) ||
    asString((data.courier as Record<string, unknown> | undefined)?.tracking_number) ||
    "";

  const externalOrderId =
    asString(data.id) ||
    asString(data.order_id) ||
    asString((data.order as Record<string, unknown> | undefined)?.id) ||
    "";

  const shipment: ShippingShipment = {
    provider: payload.selectedQuote.provider,
    courierCode: payload.selectedQuote.courierCode,
    courierServiceCode: payload.selectedQuote.courierServiceCode,
    courierServiceName: payload.selectedQuote.courierServiceName,
    trackingNumber: waybill || externalOrderId || "PENDING",
    status: waybill ? "created" : "pending_waybill",
    source: "biteship",
    externalOrderId: externalOrderId || undefined,
    trackingUrl: waybill
      ? `https://biteship.com/id/tracking/${encodeURIComponent(waybill)}`
      : undefined,
    createdAt: new Date().toISOString(),
  };

  return {
    success: true,
    shipment,
    warning: waybill
      ? undefined
      : "Order kurir berhasil dibuat, waybill belum tersedia (pending dari kurir).",
  };
}
