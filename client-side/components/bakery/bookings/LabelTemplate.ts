import type { BakeryOrder, OrderItem } from "@/components/bakery/store";
import {
  resolveDeliveryMethodLabel,
  resolveOrderDeliveryMethod,
} from "@/lib/bookings/delivery-method";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value?: string | null): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLines(value?: string | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniq(values: string[]): string[] {
  return values.filter((value, index) => {
    const normalized = value.toLowerCase();
    return values.findIndex((entry) => entry.toLowerCase() === normalized) === index;
  });
}

function formatShortDate(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatFooterTime(value?: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return "-";
  return normalized.length === 5 ? `${normalized} WIB` : normalized;
}

function resolveLabelBookingCode(name: string, phone: string): string {
  const initials = normalizeText(name)
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, "X");
  const lastTwoDigits = normalizeText(phone).replace(/\D/g, "").slice(-2).padStart(2, "0");
  return `${initials} - ${lastTwoDigits}`;
}

function resolveRecipientName(order: BakeryOrder): string {
  return (
    normalizeText(order.whatsAppParsedData?.common?.recipientName) ||
    normalizeText(order.customerName) ||
    "-"
  );
}

function resolveRecipientPhone(order: BakeryOrder): string {
  return (
    normalizeText(order.whatsAppParsedData?.common?.recipientPhone) ||
    normalizeText(order.customerPhone) ||
    "-"
  );
}

function resolveFullAddress(order: BakeryOrder): string {
  const pickupFallback =
    resolveOrderDeliveryMethod({
      parsedDeliveryMethod: order.whatsAppParsedData?.common?.deliveryMethod,
      notes: order.notes,
      shippingQuote: order.shippingQuote,
    }) === "PICKUP"
      ? "Pickup langsung di lokasi Crumbella"
      : "";

  return (
    normalizeText(order.whatsAppParsedData?.common?.fullAddress) ||
    normalizeText(order.deliveryAddresses?.[0]?.addressLine) ||
    normalizeText(order.customerAddress) ||
    pickupFallback ||
    "-"
  );
}

function resolveShippingMethod(order: BakeryOrder): string {
  const method = resolveOrderDeliveryMethod({
    parsedDeliveryMethod: order.whatsAppParsedData?.common?.deliveryMethod,
    notes: order.notes,
    shippingQuote: order.shippingQuote,
  });

  if (method === "ASSISTED_GOSEND" || method === "ASSISTED_GOCAR") {
    return "GOJEK";
  }
  if (method === "ASSISTED_GRAB") {
    return "GRAB";
  }
  if (method === "ASSISTED_PAXEL") {
    return "PAXEL";
  }
  if (method === "REGULAR_JNE_JNT") {
    return "JNE / J&T";
  }
  if (method === "CUSTOMER_APP_COURIER") {
    return "KURIR CUSTOMER";
  }
  if (method === "PICKUP") {
    return "PICKUP";
  }

  return resolveDeliveryMethodLabel(method, "PICKUP").toUpperCase();
}

function resolveShippingEmoji(method: string): string {
  if (method === "PICKUP") return "🏪";
  if (method === "GOJEK / GRAB") return "🛵";
  if (method === "PAXEL") return "📦";
  if (method === "JNE / J&T") return "🚚";
  if (method === "KURIR CUSTOMER") return "🧍";
  return "📍";
}

function getDetailsByType(order: BakeryOrder): Record<string, string> {
  const orderType = order.whatsAppParsedData?.orderType;
  if (!orderType) return order.whatsAppParsedData?.details ?? {};
  return (
    order.whatsAppParsedData?.detailsByOrderType?.[orderType] ??
    order.whatsAppParsedData?.details ??
    {}
  );
}

function resolveGreetingNote(order: BakeryOrder): string {
  const details = getDetailsByType(order);
  const directCandidates = [
    normalizeText(details.greetingCard),
    normalizeText(details.toFromNotes),
  ].filter(Boolean);
  if (directCandidates.length > 0) {
    return directCandidates[0];
  }

  const noteLines = splitLines(order.notes)
    .map((line) => {
      const match = line.match(
        /^(?:kartu\s*ucapan|ucapan|isi\s*kartu|to\s*from\s*notes?)\s*[:=-]\s*(.+)$/i,
      );
      return normalizeText(match?.[1]);
    })
    .filter(Boolean);

  return noteLines[0] || "";
}

function formatItemBadgeQuantity(quantity: number): string {
  return `${Math.max(1, Math.round(Number(quantity) || 1))}x`;
}

function formatItemDetailPart(value?: string): string {
  return normalizeText(value)
    .replace(/_/g, " ")
    .split(/(\s+|\/|\+)/)
    .map((part) =>
      /^[A-Z]+$/.test(part) ? `${part[0]}${part.slice(1).toLowerCase()}` : part,
    )
    .join("");
}

function stripPriceDetails(value?: string | null): string {
  return normalizeText(value)
    .replace(
      /\((?=[^)]*(?:rp\b|\b\d+(?:[.,]\d+)?\s*k\b|\/\s*(?:pcs?|pc|item|unit)))[^)]*\)/gi,
      "",
    )
    .replace(/@\s*\d+(?:[.,]\d+)?\s*k\b(?:\s*\/\s*(?:pcs?|pc|item|unit))?/gi, "")
    .replace(/rp\.?\s*[\d.,]+(?:\s*\/\s*(?:pcs?|pc|item|unit))?/gi, "")
    .replace(/\b\d+(?:[.,]\d+)?\s*k\b(?:\s*\/\s*(?:pcs?|pc|item|unit))?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,./)])/g, "$1")
    .replace(/([(/-])\s+/g, "$1")
    .replace(/\s+-\s*$/g, "")
    .trim();
}

function buildItemSubtitle(order: BakeryOrder, item: OrderItem): string {
  const details = getDetailsByType(order);
  const orderType = order.whatsAppParsedData?.orderType;

  const structuredParts =
    orderType === "cake"
      ? [details.cakeDesign, details.cakeFlavor]
      : orderType === "cookies"
        ? [details.cookieDesign, item.size, item.tokenDifficulty]
        : orderType === "cupcakes"
          ? [details.cupcakeFlavor, item.size]
          : orderType === "buket"
            ? [details.bouquetDesign, details.bouquetPaperColor, item.size]
            : orderType === "cookies_tower"
              ? [details.designTheme, details.colorTheme, item.size]
              : [item.size, item.subcategory];

  const normalizedParts = uniq(
    structuredParts
      .map((part) => formatItemDetailPart(stripPriceDetails(String(part ?? ""))))
      .filter(Boolean),
  );

  if (normalizedParts.length > 0) {
    return normalizedParts.join(" - ");
  }

  const noteSummary = splitLines(item.notes)
    .filter(
      (line) =>
        !/^delivery\s*method\s*:/i.test(line) &&
        !/^service\s*charge\s*:/i.test(line) &&
        !/^insurance\s*fee\s*:/i.test(line) &&
        !/^wholesale\s*discount\s*:/i.test(line) &&
        !/^harga\b/i.test(line) &&
        !/^subtotal\b/i.test(line) &&
        !/^total\b/i.test(line) &&
        !/^dp\b/i.test(line) &&
        !/^sisa\b/i.test(line) &&
        !/^ongkir\b/i.test(line) &&
        !/^adjustment\b/i.test(line),
    )
    .map((line) => stripPriceDetails(line))
    .filter(Boolean)
    .slice(0, 2)
    .join(" - ");

  return noteSummary;
}

function formatAddOnSummary(
  addOns?: string[],
  addOnQuantities?: Record<string, number>,
): string {
  if (!addOns || addOns.length === 0) return "";
  return addOns
    .map((addOn) => {
      const quantity = Number(addOnQuantities?.[addOn] || 0);
      if (!Number.isInteger(quantity) || quantity <= 1) return addOn;
      return `${quantity}x ${addOn}`;
    })
    .join(", ");
}

function buildItemRows(order: BakeryOrder): string {
  const rows = (order.items ?? []).map((item) => {
    const title = normalizeText(item.productName) || "Produk";
    const subtitle = buildItemSubtitle(order, item);
    
    const addOnText = formatAddOnSummary(item.addOns, item.addOnQuantities);
    const customAddOnText = (item.customAddOns || []).map(c => c.label).join(", ");
    const combinedAddOns = [addOnText, customAddOnText].filter(Boolean).join(", ");

    return `
      <div class="item-row">
        <div class="qty-chip">${escapeHtml(formatItemBadgeQuantity(item.quantity))}</div>
        <div class="item-copy">
          <div class="item-name">${escapeHtml(title)}</div>
          ${subtitle ? `<div class="item-subtitle">${escapeHtml(subtitle)}</div>` : ""}
          ${combinedAddOns ? `<div class="item-addon">Add-on: ${escapeHtml(combinedAddOns)}</div>` : ""}
        </div>
      </div>
    `;
  });

  return rows.join("");
}

function buildLabelHtml(order: BakeryOrder): string {
  const recipientName = resolveRecipientName(order);
  const recipientPhone = resolveRecipientPhone(order);
  const bookingCode = resolveLabelBookingCode(recipientName, recipientPhone);
  const shippingMethod = resolveShippingMethod(order);
  const shippingEmoji = resolveShippingEmoji(shippingMethod);
  const fullAddress = resolveFullAddress(order);
  const greetingNote = resolveGreetingNote(order);
  const footerDate = formatShortDate(order.deliveryDate);
  const footerTime = formatFooterTime(order.deliverySlot);
  const noteMarkup = greetingNote
    ? escapeHtml(greetingNote).replace(/\n/g, "<br />")
    : `<span class="note-empty">- Tidak ada note ucapan -</span>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Label ${escapeHtml(bookingCode)}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111111;
      font-family: "Arial Narrow", Arial, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      display: block;
      padding: 0;
    }

    .sheet {
      width: 80mm;
      border: 1px solid #a8a8a8;
      background: #ffffff;
      margin: 0;
    }

    .header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 12px 12px 10px;
      border-bottom: 1px solid #d8d8d8;
      align-items: start;
    }

    .header-time {
      font-size: 17px;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: 0.02em;
    }

    .header-time-subtitle {
      margin-top: 3px;
      font-size: 10px;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #111111;
    }

    .brand-title {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }

    .brand-subtitle {
      margin-top: 3px;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #8b8b8b;
    }

    .booking-meta {
      text-align: right;
    }

    .booking-label {
      font-size: 8px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #8b8b8b;
    }

    .booking-code {
      margin-top: 3px;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.06em;
    }

    .shipping-strip {
      background: #050505;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 7px 10px;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }

    .shipping-emoji {
      font-size: 13px;
      line-height: 1;
      letter-spacing: 0;
    }

    .section {
      padding: 10px 12px;
      border-bottom: 1px solid #d8d8d8;
    }

    .section-title {
      margin-bottom: 7px;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: #818181;
    }

    .recipient-name {
      font-size: 18px;
      line-height: 1.05;
      font-weight: 800;
    }

    .recipient-phone {
      margin-top: 5px;
      font-size: 12px;
      font-weight: 700;
    }

    .recipient-address {
      margin-top: 7px;
      font-size: 11px;
      line-height: 1.45;
      white-space: pre-line;
    }

    .item-row {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px;
      align-items: start;
    }

    .item-row + .item-row {
      margin-top: 10px;
    }

    .qty-chip {
      min-width: 28px;
      height: 18px;
      padding: 0 6px;
      border-radius: 5px;
      background: #000000;
      color: #ffffff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
    }

    .item-name {
      font-size: 13px;
      font-weight: 800;
      line-height: 1.25;
    }

    .item-subtitle {
      margin-top: 2px;
      font-size: 11px;
      line-height: 1.35;
      color: #595959;
    }

    .item-addon {
      margin-top: 2px;
      font-size: 10px;
      line-height: 1.35;
      color: #737373;
      font-style: italic;
    }

    .note-box {
      min-height: 50px;
      border: 1px dashed #9a9a9a;
      border-radius: 8px;
      padding: 10px;
      font-size: 11px;
      line-height: 1.45;
      white-space: pre-line;
      font-style: italic;
    }

    .note-empty {
      color: #9a9a9a;
    }

    .footer {
      display: flex;
      justify-content: flex-end;
      align-items: flex-end;
      gap: 10px;
      padding: 10px 12px 12px;
    }

    .footer-brand {
      text-align: right;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="header-time">${escapeHtml(footerDate)}</div>
        <div class="header-time-subtitle">${escapeHtml(footerTime)}</div>
      </div>
      <div class="booking-meta">
        <div class="booking-label">Kode Booking</div>
        <div class="booking-code">${escapeHtml(bookingCode)}</div>
      </div>
    </div>
    <div class="shipping-strip">
      <span class="shipping-emoji">${shippingEmoji}</span>
      <span>${escapeHtml(shippingMethod)}</span>
    </div>
    <div class="section">
      <div class="section-title">Penerima ✨</div>
      <div class="recipient-name">${escapeHtml(recipientName)}</div>
      <div class="recipient-phone">${escapeHtml(recipientPhone)}</div>
      <div class="recipient-address">${escapeHtml(fullAddress)}</div>
    </div>
    <div class="section">
      <div class="section-title">Isi Pesanan 🍪</div>
      ${buildItemRows(order)}
    </div>
    <div class="section">
      <div class="section-title">Note Ucapan 💌</div>
      <div class="note-box">${noteMarkup}</div>
    </div>
    <div class="footer">
      <div class="footer-brand">
        <div class="brand-title">CRUMBELLA</div>
      </div>
    </div>
  </div>
  <script>
    window.onload = () => {
      window.print();
      window.setTimeout(() => window.close(), 150);
    };
  </script>
</body>
</html>`;
}

export function openLabelPrintWindow(order: BakeryOrder): void {
  const printWindow = window.open("", "_blank", "width=420,height=860");
  if (!printWindow) {
    window.alert("Pop-up diblokir browser. Izinkan pop-up untuk mencetak label.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildLabelHtml(order));
  printWindow.document.close();
}
