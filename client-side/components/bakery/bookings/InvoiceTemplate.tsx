import type { BakeryOrder } from "@/components/bakery/store";
import {
  buildInvoiceData,
  formatInvoiceCurrency,
  type InvoiceData,
} from "@/lib/bookings/generateInvoice";

// ==================== KONSTANTA ASET ====================

// Path ke aset branding Crumbella (relatif terhadap public/)
const LOGO_PATH = "/branding/Copy of logofont transparant-cropped.png";
const MASCOT_TOP_PATH = "/branding/Copy of naik payung.png";
const MASCOT_BOTTOM_PATH = "/branding/Copy of main air.png";

// ==================== HTML BUILDER ====================

/**
 * Build HTML string lengkap untuk invoice Crumbella.
 * HTML ini digunakan untuk membuka window baru dan langsung print.
 */
function buildInvoiceHtml(data: InvoiceData): string {
  // Render baris-baris tabel item
  const itemRows = data.lineItems
    .map(
      (item) => `
        <tr>
          <td class="item-desc">${escapeHtml(item.description)}</td>
          <td class="item-price">${formatInvoiceCurrency(item.price)}</td>
          <td class="item-qty">${item.quantity}</td>
          <td class="item-total">${formatInvoiceCurrency(item.total)}</td>
        </tr>`,
    )
    .join("");

  // Baris kosong untuk padding tabel (max 5 baris total supaya rapi)
  const emptyRowCount = Math.max(0, 3 - data.lineItems.length);
  const emptyRows = Array(emptyRowCount)
    .fill(
      `<tr>
        <td class="item-desc">&nbsp;</td>
        <td class="item-price">-</td>
        <td class="item-qty">-</td>
        <td class="item-total">-</td>
      </tr>`,
    )
    .join("");

  // Baris diskon (render jika ada potongan)
  const discountLabel =
    data.discountPercent > 0
      ? `Diskon (${data.discountPercent}%)`
      : "Diskon";
  const discountRow =
    data.discountAmount > 0
      ? `<tr class="summary-row">
          <td class="summary-label">${discountLabel}</td>
          <td class="summary-value">(${formatInvoiceCurrency(data.discountAmount)})</td>
        </tr>`
      : "";

  const deliveryFeeRow =
    data.deliveryFee > 0
      ? `<tr class="summary-row">
          <td class="summary-label">Ongkir</td>
          <td class="summary-value">${formatInvoiceCurrency(data.deliveryFee)}</td>
        </tr>`
      : "";

  const adjustmentRow =
    data.manualAdjustment !== 0
      ? `<tr class="summary-row">
          <td class="summary-label">Adjustment</td>
          <td class="summary-value">${formatInvoiceCurrency(data.manualAdjustment)}</td>
        </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
  <style>
    /* ==================== RESET & BASE ==================== */
    * { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      size: A4 portrait;
      margin: 0;
    }

    body {
      font-family: 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      background: #ffffff;
      color: #1a1a2e;
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      position: relative;
      overflow: hidden;
    }

    /* ==================== HEADER (WAVE + LOGO) ==================== */
    .header {
      position: relative;
      width: 100%;
      height: 180px;
      background: linear-gradient(135deg, #0e4d8f 0%, #1565c0 40%, #1b88d4 70%, #2ba0db 100%);
      overflow: hidden;
    }

    /* Dekorasi wave di bawah header */
    .header::after {
      content: "";
      position: absolute;
      bottom: -2px;
      left: 0;
      width: 100%;
      height: 60px;
      background: #ffffff;
      border-radius: 50% 50% 0 0 / 100% 100% 0 0;
    }

    /* Splash dekoratif kiri */
    .header-splash-left {
      position: absolute;
      top: 0;
      left: 0;
      width: 200px;
      height: 180px;
      background: radial-gradient(ellipse at top left, rgba(255,165,0,0.4) 0%, transparent 70%);
    }

    /* Splash dekoratif kanan */
    .header-splash-right {
      position: absolute;
      top: 0;
      right: 0;
      width: 200px;
      height: 180px;
      background: radial-gradient(ellipse at top right, rgba(0,180,220,0.3) 0%, transparent 70%);
    }

    .header-logo {
      position: absolute;
      top: 24px;
      left: 36px;
      width: 140px;
      z-index: 2;
    }

    .header-mascot {
      position: absolute;
      top: 10px;
      right: 30px;
      width: 130px;
      z-index: 2;
    }

    /* ==================== INVOICE BANNER ==================== */
    .invoice-banner {
      background: linear-gradient(90deg, #e8740c 0%, #f59e0b 100%);
      text-align: center;
      padding: 10px 0;
      margin: -10px 40px 0 40px;
      border-radius: 6px;
      position: relative;
      z-index: 3;
    }

    .invoice-banner h1 {
      color: #ffffff;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 12px;
      text-transform: uppercase;
    }

    /* ==================== BODY CONTENT ==================== */
    .invoice-body {
      padding: 24px 40px 0 40px;
    }

    /* Info header: customer + invoice meta */
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }

    .info-left {
      max-width: 55%;
    }

    .info-right {
      text-align: right;
    }

    .info-label {
      font-size: 13px;
      color: #555;
      font-style: italic;
      margin-bottom: 2px;
    }

    .info-value {
      font-size: 15px;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .info-value-normal {
      font-size: 14px;
      font-weight: 600;
      color: #1a1a2e;
      margin-bottom: 8px;
    }

    /* ==================== TABLE ==================== */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }

    .items-table thead th {
      background: #f0f0f0;
      border-top: 2px solid #1a1a2e;
      border-bottom: 2px solid #1a1a2e;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 700;
      text-align: left;
      color: #1a1a2e;
    }

    .items-table thead th:nth-child(2),
    .items-table thead th:nth-child(3),
    .items-table thead th:nth-child(4) {
      text-align: center;
    }

    .items-table tbody td {
      padding: 10px 12px;
      font-size: 13px;
      border-bottom: 1px solid #e0e0e0;
      vertical-align: middle;
    }

    .item-desc { text-align: left; }
    .item-price { text-align: center; }
    .item-qty { text-align: center; }
    .item-total { text-align: right; font-weight: 600; }

    /* ==================== SUMMARY / FOOTER ==================== */
    .summary-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 8px;
      padding-top: 4px;
      border-top: 2px solid #1a1a2e;
    }

    .bank-info {
      font-size: 14px;
      line-height: 1.6;
    }

    .bank-info .bank-name {
      color: #e8740c;
      font-weight: 700;
      font-size: 15px;
    }

    .bank-info .account-number {
      font-weight: 600;
      font-size: 14px;
    }

    .summary-table {
      border-collapse: collapse;
    }

    .summary-table .summary-row td {
      padding: 4px 0;
      font-size: 14px;
    }

    .summary-label {
      text-align: right;
      padding-right: 16px !important;
      font-weight: 600;
    }

    .summary-value {
      text-align: right;
      font-weight: 700;
      min-width: 120px;
    }

    .summary-grand-total .summary-value {
      font-size: 16px;
      color: #e8740c;
    }

    /* ==================== CLOSING / TANDA TANGAN ==================== */
    .closing-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 30px;
      padding: 0 40px 20px 40px;
      position: relative;
    }

    .closing-mascot {
      width: 120px;
    }

    .closing-tagline {
      font-size: 22px;
      font-weight: 800;
      color: #e8740c;
      font-style: italic;
      margin-left: 8px;
    }

    .closing-signature {
      text-align: right;
      font-size: 13px;
      line-height: 1.5;
    }

    .closing-signature .hormat {
      font-style: italic;
      color: #555;
      margin-bottom: 30px;
    }

    .closing-signature .name {
      font-weight: 700;
      text-decoration: underline;
      font-size: 14px;
    }

    .closing-signature .title {
      font-size: 12px;
      color: #555;
    }

    /* ==================== DEKORASI BAWAH ==================== */
    .footer-wave {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 80px;
      background: linear-gradient(135deg, #0e4d8f 0%, #1565c0 40%, #1b88d4 70%, #2ba0db 100%);
      border-radius: 0 0 0 0;
      overflow: hidden;
    }

    .footer-wave::before {
      content: "";
      position: absolute;
      top: -2px;
      left: 0;
      width: 100%;
      height: 40px;
      background: #ffffff;
      border-radius: 0 0 50% 50% / 0 0 100% 100%;
    }

    /* ==================== PRINT MEDIA ==================== */
    @media print {
      body {
        width: 100%;
        min-height: auto;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .footer-wave {
        position: fixed;
        bottom: 0;
      }
    }
  </style>
</head>
<body>

  <!-- ===== HEADER ===== -->
  <div class="header">
    <div class="header-splash-left"></div>
    <div class="header-splash-right"></div>
    <img class="header-logo" src="${LOGO_PATH}" alt="Crumbella Logo" />
    <img class="header-mascot" src="${MASCOT_TOP_PATH}" alt="Mascot" />
  </div>

  <!-- ===== INVOICE BANNER ===== -->
  <div class="invoice-banner">
    <h1>Invoice</h1>
  </div>

  <!-- ===== BODY ===== -->
  <div class="invoice-body">
    <!-- Info Section -->
    <div class="info-section">
      <div class="info-left">
        <div class="info-label">Invoice To :</div>
        <div class="info-value">${escapeHtml(data.customerName)}</div>

        <div class="info-label">Whatsapp :</div>
        <div class="info-value-normal">${escapeHtml(data.customerPhone)}</div>
      </div>
      <div class="info-right">
        <div class="info-label">INVOICE NO: <strong>${escapeHtml(data.invoiceNumber)}</strong></div>
        <div class="info-value-normal" style="margin-top: 8px;">${escapeHtml(data.invoiceDate)}</div>
      </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Price</th>
          <th>Qty</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${emptyRows}
      </tbody>
    </table>

    <!-- Summary -->
    <div class="summary-section">
      <div class="bank-info">
        <span class="bank-name">${data.bank.bankName}</span> an.<strong>${data.bank.accountName}</strong><br />
        <span class="account-number">${data.bank.accountNumber}</span>
      </div>
      <table class="summary-table">
        <tr class="summary-row">
          <td class="summary-label">Subtotal Item</td>
          <td class="summary-value">${formatInvoiceCurrency(data.itemsSubtotal)}</td>
        </tr>
        ${deliveryFeeRow}
        ${adjustmentRow}
        <tr class="summary-row">
          <td class="summary-label">Subtotal</td>
          <td class="summary-value">${formatInvoiceCurrency(data.subtotal)}</td>
        </tr>
        ${discountRow}
        <tr class="summary-row summary-grand-total">
          <td class="summary-label">Total</td>
          <td class="summary-value">${formatInvoiceCurrency(data.grandTotal)}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- ===== CLOSING ===== -->
  <div class="closing-section">
    <div style="display: flex; align-items: flex-end;">
      <img class="closing-mascot" src="${MASCOT_BOTTOM_PATH}" alt="Mascot" />
      <span class="closing-tagline">Art you can taste</span>
    </div>
    <div class="closing-signature">
      <div class="hormat">Hormat kami,</div>
      <div class="name">${escapeHtml(data.bank.accountName)}</div>
      <div class="title">Owner Crumbella</div>
    </div>
  </div>

  <!-- ===== FOOTER WAVE ===== -->
  <div class="footer-wave"></div>

</body>
</html>`;
}

// ==================== HELPERS ====================

/** Escape HTML entities untuk keamanan XSS */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ==================== PUBLIC API ====================

/**
 * Buka invoice di tab baru dan langsung trigger print dialog.
 * Hanya bisa dipanggil dari client-side (browser).
 *
 * @param order - Data order dari bakery store
 */
export function openInvoicePrintWindow(order: BakeryOrder): void {
  // Build data invoice dari order
  const invoiceData = buildInvoiceData(order);

  // Build HTML
  const html = buildInvoiceHtml(invoiceData);

  // Buka window baru dan tulis HTML invoice
  const printWindow = window.open("", "_blank", "width=800,height=1100");
  if (!printWindow) {
    alert("Pop-up diblokir browser. Izinkan pop-up untuk mencetak invoice.");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Tunggu gambar dimuat sebelum print
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}
