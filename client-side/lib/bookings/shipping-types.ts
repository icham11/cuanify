export type ShippingProvider = "JNE" | "PAXEL" | "JNT" | "GOJEK" | "GRAB";
export type ShippingDataSource = "biteship" | "fallback";
export type ShippingDistanceSource =
  | "input_coordinate"
  | "nominatim"
  | "nominatim_with_area"
  | "biteship_area"
  | "ai_fallback";

export interface ShippingQuoteItemInput {
  name: string;
  quantity: number;
  weightGram: number;
  value: number;
}

export interface ShippingQuoteRequest {
  destinationAddress: string;
  destinationPostalCode?: string;
  destinationArea?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  items: ShippingQuoteItemInput[];
  totalValue: number;
}

export interface ShippingQuote {
  id: string;
  provider: ShippingProvider;
  courierCode: string;
  courierServiceCode: string;
  courierServiceName: string;
  price: number;
  eta: string;
  distanceKm: number;
  source: ShippingDataSource;
  destinationPostalCode?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  distanceSource?: ShippingDistanceSource;
  warning?: string;
}

export interface ShippingQuoteResponse {
  success: boolean;
  quotes: ShippingQuote[];
  distanceKm: number;
  distanceSource?: ShippingDistanceSource;
  destinationPostalCode?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  warning?: string;
  error?: string;
}

export interface ShippingResiRequest {
  orderId: string;
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  destinationAddress: string;
  destinationPostalCode?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  deliveryDate?: string;
  deliveryTime?: string;
  selectedQuote: ShippingQuote;
  items: ShippingQuoteItemInput[];
  totalValue: number;
}

export interface ShippingShipment {
  provider: ShippingProvider;
  courierCode: string;
  courierServiceCode: string;
  courierServiceName: string;
  trackingNumber: string;
  status: "created" | "pending_waybill";
  source: ShippingDataSource;
  externalOrderId?: string;
  trackingUrl?: string;
  createdAt: string;
}

export interface ShippingResiResponse {
  success: boolean;
  shipment?: ShippingShipment;
  warning?: string;
  error?: string;
}
