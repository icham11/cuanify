export type BookingAutomationEvent =
  | "order_created"
  | "order_confirmed"
  | "order_completed"
  | "order_rescheduled"
  | "order_calendar_sync";

export interface BookingAutomationItem {
  id: string;
  category: string;
  subcategory: string;
  productName: string;
  size: string;
  quantity: number;
  notes?: string;
  productType?: "COOKIE" | "BOUQUET" | "CAKE" | "CUPCAKE" | "TOWER";
  selectedPrice?: number;
  basePrice?: number;
  cookiePrice?: number;
  designCount?: number;
  additionalDesignCount?: number;
  additionalCost?: number;
  bouquetType?: "HAND" | "STANDING";
  bouquetCost?: number;
  cakeDiameterCm?: number;
  cakeHeightCm?: number;
  cakeType?: "DUMMY" | "REAL";
  cupcakePackType?: "DOZEN" | "INDIVIDUAL";
  hasCookieTopper?: boolean;
  lineTotal?: number;
}

export interface BookingAutomationAddress {
  id: string;
  label: string;
  area: string;
  addressLine: string;
}

export interface BookingAutomationOrderPayload {
  id: string;
  bookingCode: string;
  resi: string;
  customerName: string;
  customerPhone: string;
  deliveryDate: string;
  deliverySlot: string;
  paymentStatus: string;
  orderStatus: string;
  totalPrice: number;
  manualAdjustment?: number;
  deliveryFee?: number;
  notes?: string;
  items: BookingAutomationItem[];
  deliveryAddresses: BookingAutomationAddress[];
}

export interface BookingAutomationRequest {
  eventType: BookingAutomationEvent;
  order: BookingAutomationOrderPayload;
}

export interface AutomationActionResult {
  ok: boolean;
  skipped?: boolean;
  message: string;
  externalId?: string;
  externalLink?: string;
}

export interface BookingAutomationResponse {
  success: boolean;
  eventType: BookingAutomationEvent;
  fonnteCustomer: AutomationActionResult;
  fonnteProduction: AutomationActionResult;
  calendar: AutomationActionResult;
  sheets: AutomationActionResult;
}
