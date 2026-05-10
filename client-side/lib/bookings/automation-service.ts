import { createSign } from "crypto";
import prisma from "@/lib/prisma";
import { sendOrderToWhatsApp } from "@/lib/whatsapp/sendOrderToWhatsApp";
import type {
  AutomationActionResult,
  BookingAutomationEvent,
  BookingAutomationOrderPayload,
  BookingAutomationResponse,
} from "@/lib/bookings/automation-types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const FONNTE_API_URL = "https://api.fonnte.com/send";

type GoogleCalendarOAuthMetadata = {
  refreshToken?: string;
  calendarId?: string;
};

function formatCurrency(value: number): string {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function normalizePhoneForFonnte(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function normalizeFonnteTarget(target: string): string {
  return target
    .split(/[,\n;]+/)
    .map((rawTarget) => {
      const parsedTarget = rawTarget.trim();
      if (!parsedTarget) return "";
      if (/@g\.us$/i.test(parsedTarget)) return parsedTarget;
      return normalizePhoneForFonnte(parsedTarget);
    })
    .filter(Boolean)
    .join(",");
}

function base64UrlEncode(value: Buffer | string): string {
  const base64 = (
    typeof value === "string" ? Buffer.from(value) : value
  ).toString("base64");
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function getDeliverySummary(order: BookingAutomationOrderPayload): string {
  return `${order.deliveryDate} ${order.deliverySlot}`;
}

function getPrimaryAddress(order: BookingAutomationOrderPayload): string {
  return order.deliveryAddresses[0]?.addressLine || "Alamat belum diisi";
}

function getItemsSummary(order: BookingAutomationOrderPayload): string {
  return order.items
    .map((item) => `${item.quantity}x ${item.productName} (${item.size})`)
    .join(", ");
}

function sanitizeProductionNotes(notes?: string): string {
  const text = (notes || "").trim();
  if (!text) return "-";

  const redundantPatterns = [
    /delivery\s*method/i,
    /metode\s*pengiriman/i,
    /alamat/i,
    /delivery\s*date/i,
    /delivery\s*slot/i,
    /jam\s*pengiriman/i,
    /nama\s*penerima/i,
    /recipient/i,
    /no\.?\s*telp/i,
    /phone/i,
  ];

  const uniqueLines = Array.from(
    new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter(
          (line) => !redundantPatterns.some((pattern) => pattern.test(line)),
        ),
    ),
  );

  if (!uniqueLines.length) return "-";
  return uniqueLines.join(" | ").slice(0, 300);
}

function buildCustomerMessage(order: BookingAutomationOrderPayload): string {
  const code = order.resi || order.bookingCode || order.id;
  return [
    `Halo ${order.customerName}, pesanan Anda sudah *Masuk Produksi* ✅`,
    `Kode Booking: *${code}*`,
    `Item: ${getItemsSummary(order)}`,
    `Total: ${formatCurrency(order.totalPrice)}`,
    `Pengiriman: ${getDeliverySummary(order)}`,
    `Alamat: ${getPrimaryAddress(order)}`,
    "Terima kasih sudah order di Crumbella Bakery.",
  ].join("\n");
}

function buildProductionMessage(order: BookingAutomationOrderPayload): string {
  const code = order.resi || order.bookingCode || order.id;
  const notesSummary = sanitizeProductionNotes(order.notes);
  return [
    "*ORDER BARU MASUK - PRODUKSI*",
    `Kode Booking: *${code}*`,
    `Customer: ${order.customerName}`,
    `Kontak: ${order.customerPhone || "-"}`,
    `Item: ${getItemsSummary(order)}`,
    `Jadwal Kirim: ${getDeliverySummary(order)}`,
    `Alamat: ${getPrimaryAddress(order)}`,
    `Catatan: ${notesSummary}`,
  ].join("\n");
}

function buildCalendarDescription(
  order: BookingAutomationOrderPayload,
): string {
  const code = order.resi || order.bookingCode || order.id;
  const addresses = order.deliveryAddresses
    .map(
      (address) => `${address.label} (${address.area}): ${address.addressLine}`,
    )
    .join("\n");

  return [
    `Booking Code: ${code}`,
    `Customer: ${order.customerName}`,
    `Phone: ${order.customerPhone || "-"}`,
    `Items: ${getItemsSummary(order)}`,
    `Total: ${formatCurrency(order.totalPrice)}`,
    `Delivery Fee: ${formatCurrency(order.deliveryFee || 0)}`,
    `Payment: ${order.paymentStatus}`,
    `Notes: ${order.notes || "-"}`,
    `Addresses:\n${addresses || "-"}`,
  ].join("\n");
}

function parseSlotToEndTime(slot: string, durationHours: number): string {
  const match = slot.match(/^(\d{2}):(\d{2})$/);
  if (!match) return slot;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const totalMinutes = hour * 60 + minute + durationHours * 60;
  const endHour = Math.floor((totalMinutes % (24 * 60)) / 60);
  const endMinute = totalMinutes % 60;

  return `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
}

async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  return getGoogleAccessTokenWithFallback(scopes);
}

async function getOAuthCalendarConfig(
  businessId?: number,
): Promise<GoogleCalendarOAuthMetadata | null> {
  if (!businessId) return null;

  const doc = await prisma.businessDocument.findFirst({
    where: {
      businessId,
      sourceType: "google_calendar_oauth",
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      metadata: true,
    },
  });

  if (!doc?.metadata || typeof doc.metadata !== "object") return null;
  const metadata = doc.metadata as GoogleCalendarOAuthMetadata;
  if (!metadata.refreshToken) return null;
  return metadata;
}

async function getOAuthAccessTokenFromRefreshToken(
  refreshToken: string,
  scopes: string[],
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  });

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const tokenData = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
  };

  if (!tokenResponse.ok || !tokenData.access_token) return null;
  return tokenData.access_token;
}

async function getGoogleAccessTokenWithFallback(
  scopes: string[],
  businessId?: number,
): Promise<string> {
  if (businessId && scopes.includes(GOOGLE_CALENDAR_SCOPE)) {
    const oauthConfig = await getOAuthCalendarConfig(businessId);
    if (oauthConfig?.refreshToken) {
      const oauthToken = await getOAuthAccessTokenFromRefreshToken(
        oauthConfig.refreshToken,
        scopes,
      );
      if (oauthToken) {
        return oauthToken;
      }
    }
  }

  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  if (!serviceEmail || !privateKey) {
    throw new Error("Missing Google service account env configuration.");
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceEmail,
    scope: scopes.join(" "),
    aud: GOOGLE_TOKEN_URL,
    exp,
    iat,
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const tokenData = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description ||
        tokenData.error ||
        "Failed to get Google access token.",
    );
  }

  return tokenData.access_token;
}

async function sendFonnteMessage(
  target: string,
  message: string,
  imageUrl?: string,
): Promise<AutomationActionResult> {
  const token = process.env.FONNTE_TOKEN || "";
  if (!token) {
    return {
      ok: false,
      skipped: true,
      message: "Skipped: FONNTE_TOKEN belum di-set.",
    };
  }

  if (!target) {
    return {
      ok: false,
      skipped: true,
      message: "Skipped: target WhatsApp kosong.",
    };
  }

  const payload: {
    target: string;
    message: string;
    url?: string;
  } = {
    target,
    message,
  };

  if (imageUrl) {
    payload.url = imageUrl;
  }

  const response = await fetch(FONNTE_API_URL, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as {
    status?: boolean;
    detail?: string;
    id?: string;
    reason?: string;
  };

  if (!response.ok || data.status === false) {
    console.error("[automation-service] Fonnte API Error:", {
      status: response.status,
      data,
      target,
    });
    return {
      ok: false,
      message: data.reason || data.detail || `Fonnte error ${response.status}`,
    };
  }

  console.info("[automation-service] Fonnte API Success:", {
    id: data.id,
    target,
  });
  return {
    ok: true,
    message: "WhatsApp terkirim.",
    externalId: data.id,
  };
}

export async function sendWhatsAppImage(
  target: string,
  imageUrl: string,
  caption: string = "",
): Promise<AutomationActionResult> {
  return sendFonnteMessage(target, caption, imageUrl);
}

async function findExistingCalendarEvent(
  calendarId: string,
  accessToken: string,
  order: BookingAutomationOrderPayload,
): Promise<{ id: string; htmlLink?: string } | null> {
  const bookingCode = order.resi || order.bookingCode || order.id;
  const queryParams = new URLSearchParams({
    maxResults: "1",
    singleEvents: "true",
    privateExtendedProperty: `bookingId=${order.id}`,
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${queryParams.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const data = (await response.json().catch(() => ({}))) as {
    items?: Array<{ id?: string; htmlLink?: string }>;
  };

  if (response.ok && data.items?.[0]?.id) {
    return {
      id: data.items[0].id,
      htmlLink: data.items[0].htmlLink,
    };
  }

  // Fallback by text query for older events that were created before extendedProperties existed.
  const fallbackParams = new URLSearchParams({
    maxResults: "1",
    singleEvents: "true",
    q: bookingCode,
  });
  const fallbackResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${fallbackParams.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const fallbackData = (await fallbackResponse.json().catch(() => ({}))) as {
    items?: Array<{ id?: string; htmlLink?: string }>;
  };

  if (fallbackResponse.ok && fallbackData.items?.[0]?.id) {
    return {
      id: fallbackData.items[0].id,
      htmlLink: fallbackData.items[0].htmlLink,
    };
  }

  return null;
}

async function upsertGoogleCalendarEvent(
  order: BookingAutomationOrderPayload,
  businessId?: number,
): Promise<AutomationActionResult> {
  const oauthConfig = await getOAuthCalendarConfig(businessId);
  const calendarId =
    oauthConfig?.calendarId || process.env.GOOGLE_CALENDAR_ID || "";

  if (!calendarId) {
    return {
      ok: false,
      skipped: true,
      message: "Skipped: GOOGLE_CALENDAR_ID belum di-set.",
    };
  }

  if (!order.deliveryDate || !order.deliverySlot) {
    return {
      ok: false,
      skipped: true,
      message: "Skipped: jadwal delivery belum lengkap.",
    };
  }

  const accessToken = await getGoogleAccessTokenWithFallback(
    [GOOGLE_CALENDAR_SCOPE],
    businessId,
  );
  const bookingCode = order.resi || order.bookingCode || order.id;
  const existingEvent = await findExistingCalendarEvent(
    calendarId,
    accessToken,
    order,
  );

  const startTime = order.deliverySlot;
  const endTime = parseSlotToEndTime(order.deliverySlot, 2);

  const body = {
    summary: `${bookingCode} - ${order.customerName}`,
    description: buildCalendarDescription(order),
    start: {
      dateTime: `${order.deliveryDate}T${startTime}:00`,
      timeZone: "Asia/Jakarta",
    },
    end: {
      dateTime: `${order.deliveryDate}T${endTime}:00`,
      timeZone: "Asia/Jakarta",
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 24 * 60 }, // H-1
        { method: "popup", minutes: 2 * 60 }, // Hari-H (2 jam sebelum)
      ],
    },
    extendedProperties: {
      private: {
        bookingId: order.id,
        bookingCode,
      },
    },
  };

  const endpoint = existingEvent
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEvent.id)}`
    : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  const response = await fetch(endpoint, {
    method: existingEvent ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    htmlLink?: string;
    error?: { message?: string };
  };

  if (!response.ok || !data.id) {
    return {
      ok: false,
      message:
        data.error?.message || `Google Calendar error ${response.status}`,
    };
  }

  return {
    ok: true,
    message: existingEvent
      ? "Event Google Calendar berhasil diperbarui."
      : "Event Google Calendar berhasil dibuat.",
    externalId: data.id,
    externalLink: data.htmlLink,
  };
}

async function appendGoogleSheet(
  order: BookingAutomationOrderPayload,
): Promise<AutomationActionResult> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID || "";
  const sheetRange = process.env.GOOGLE_SHEETS_RANGE || "Orders!A:Z";

  if (!spreadsheetId) {
    return {
      ok: false,
      skipped: true,
      message: "Skipped: GOOGLE_SHEETS_ID belum di-set.",
    };
  }

  const accessToken = await getGoogleAccessToken([GOOGLE_SHEETS_SCOPE]);
  const bookingCode = order.resi || order.bookingCode || order.id;
  const addresses = order.deliveryAddresses
    .map(
      (address) => `${address.label} (${address.area}) ${address.addressLine}`,
    )
    .join(" | ");

  const row = [
    new Date().toISOString(),
    bookingCode,
    order.customerName,
    order.customerPhone,
    order.paymentStatus,
    order.orderStatus,
    order.deliveryDate,
    order.deliverySlot,
    getItemsSummary(order),
    formatCurrency(order.totalPrice),
    formatCurrency(order.deliveryFee || 0),
    addresses,
    order.notes || "",
  ];

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${encodeURIComponent(sheetRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    },
  );

  const data = (await response.json().catch(() => ({}))) as {
    updates?: { updatedRange?: string };
    error?: { message?: string };
  };

  if (!response.ok) {
    return {
      ok: false,
      message: data.error?.message || `Google Sheets error ${response.status}`,
    };
  }

  return {
    ok: true,
    message: "Data order berhasil dikirim ke Google Sheets.",
    externalId: data.updates?.updatedRange,
  };
}

export async function runBookingAutomations(
  eventType: BookingAutomationEvent,
  order: BookingAutomationOrderPayload,
  businessId?: number,
): Promise<BookingAutomationResponse> {
  const customerPhone = normalizePhoneForFonnte(order.customerPhone || "");
  const productionTarget = normalizeFonnteTarget(
    process.env.FONNTE_PRODUCTION_TARGET || "",
  );
  const shouldSyncSheetsOnProgressEvents =
    String(process.env.GOOGLE_SHEETS_SYNC_ON_PROGRESS_EVENTS || "false") ===
    "true";
  const shouldSendProductionTextOnConfirm =
    String(process.env.FONNTE_SEND_PRODUCTION_TEXT_ON_CONFIRM || "false") ===
    "true";

  let fonnteCustomer: AutomationActionResult = {
    ok: false,
    skipped: true,
    message: "Skipped: event ini tidak mengirim WA customer.",
  };
  let fonnteProduction: AutomationActionResult = {
    ok: false,
    skipped: true,
    message: "Skipped: event ini tidak mengirim WA produksi.",
  };
  let calendar: AutomationActionResult = {
    ok: false,
    skipped: true,
    message: "Skipped: event ini tidak membuat event Calendar.",
  };
  let sheets: AutomationActionResult = {
    ok: false,
    skipped: true,
    message: "Skipped: event ini tidak sinkron ke Sheets.",
  };

  if (
    eventType === "order_created" ||
    eventType === "order_confirmed" ||
    eventType === "order_rescheduled" ||
    eventType === "order_calendar_sync"
  ) {
    calendar = await upsertGoogleCalendarEvent(order, businessId).catch(
      (error: unknown) => ({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to create Google Calendar event.",
      }),
    );
  }

  if (eventType === "order_confirmed") {
    if (shouldSendProductionTextOnConfirm) {
      fonnteProduction = await sendFonnteMessage(
        productionTarget,
        buildProductionMessage(order),
      ).catch((error: unknown) => ({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to send WhatsApp produksi.",
      }));
    } else {
      // Gunakan jalur WA terstandar agar urutan kirim konsisten: teks rekap dulu, lalu gambar.
      const result = await sendOrderToWhatsApp({
        ...order,
        item: getItemsSummary(order),
        phone: order.customerPhone,
        address: getPrimaryAddress(order),
      });

      fonnteProduction = {
        ok: result.ok,
        skipped: false,
        message: result.message,
      };
    }
  } else if (eventType === "order_created") {
    const shouldSendOnCreate =
      String(process.env.FONNTE_SEND_PRODUCTION_ON_CREATE || "true") === "true";

    if (shouldSendOnCreate) {
      const result = await sendOrderToWhatsApp({
        ...order,
        item: getItemsSummary(order),
        phone: order.customerPhone,
        address: getPrimaryAddress(order),
      });

      fonnteProduction = {
        ok: result.ok,
        skipped: false,
        message: result.message,
      };
    } else {
      fonnteProduction = {
        ok: false,
        skipped: true,
        message: "Skipped: FONNTE_SEND_PRODUCTION_ON_CREATE bukan true.",
      };
    }
  }

  if (eventType === "order_confirmed") {
    const shouldSendCustomer =
      String(process.env.FONNTE_SEND_CUSTOMER_ON_CONFIRM || "false") === "true";
    if (shouldSendCustomer) {
      fonnteCustomer = await sendFonnteMessage(
        customerPhone,
        buildCustomerMessage(order),
      ).catch((error: unknown) => ({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to send WhatsApp customer.",
      }));
    } else {
      fonnteCustomer = {
        ok: false,
        skipped: true,
        message: "Skipped: FONNTE_SEND_CUSTOMER_ON_CONFIRM bukan true.",
      };
    }
  }

  if (eventType === "order_rescheduled") {
    const shouldNotifyReschedule =
      String(process.env.FONNTE_NOTIFY_RESCHEDULE_PRODUCTION || "true") ===
      "true";
    if (shouldNotifyReschedule) {
      const rescheduleMessage = `${buildProductionMessage(order)}\n\n*Info:* Jadwal order telah di-reschedule.`;
      fonnteProduction = await sendFonnteMessage(
        productionTarget,
        rescheduleMessage,
      ).catch((error: unknown) => ({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to send reschedule WhatsApp produksi.",
      }));
    } else {
      fonnteProduction = {
        ok: false,
        skipped: true,
        message: "Skipped: FONNTE_NOTIFY_RESCHEDULE_PRODUCTION bukan true.",
      };
    }
  }

  const shouldSyncSheets =
    eventType === "order_completed" ||
    (shouldSyncSheetsOnProgressEvents &&
      (eventType === "order_confirmed" || eventType === "order_rescheduled"));

  if (shouldSyncSheets) {
    sheets = await appendGoogleSheet(order).catch((error: unknown) => ({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to append Google Sheets.",
    }));
  }

  return {
    success: true,
    eventType,
    fonnteCustomer,
    fonnteProduction,
    calendar,
    sheets,
  };
}
