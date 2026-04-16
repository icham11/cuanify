import type { BakeryOrder } from "@/components/bakery/store";
import {
  buildInvoiceData,
  formatInvoiceCurrency,
  type InvoiceData,
} from "@/lib/bookings/generateInvoice";

// ==================== KONSTANTA ASET ====================

// Path ke aset branding Crumbella (relatif terhadap public/)
const HEADER_IMAGE_PATH = "/branding/header.png";
const FOOTER_IMAGE_PATH = "/branding/footer.png";

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

  const serviceChargeRow =
    data.serviceCharge > 0
      ? `<tr class="summary-row">
          <td class="summary-label">Service Charge</td>
          <td class="summary-value">${formatInvoiceCurrency(data.serviceCharge)}</td>
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
    :root {
      --page-width: 210mm;
      --page-height: 297mm;
      --header-height: 168px;
      --banner-height: 46px;
      --footer-height: 120px;
      --content-padding-x: 28px;
    }

    /* ==================== RESET & BASE ==================== */
    * { box-sizing: border-box; margin: 0; padding: 0; }

    html,
    body {
      width: var(--page-width);
      height: var(--page-height);
      margin: 0;
      padding: 0;
    }

    @page {
      size: A4;
      margin: 0;
    }

    body {
      font-family: 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      background: #ffffff;
      color: #1a1a2e;
      width: var(--page-width);
      height: var(--page-height);
      position: relative;
      display: flex;
      flex-direction: column;
    }

    .top-section {
      flex-shrink: 0;
      margin-top: 0;
      padding-top: 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ==================== HEADER IMAGE ==================== */
    .header {
      width: 100%;
      position: relative;
      z-index: 3;
      line-height: 0;
      overflow: visible;
      margin-top: 0;
      padding-top: 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .header-image {
      display: block;
      width: 100%;
      height: auto;
      object-fit: contain;
      object-position: center top;
      margin-top: 0;
    }

    /* ==================== INVOICE BANNER ==================== */
    .invoice-banner {
      background: #F37021;
      height: var(--banner-height);
      position: relative;
      z-index: 1;
      margin-top: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .invoice-banner h1 {
      color: #ffffff;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 9px;
      text-transform: uppercase;
    }

    .content-wrap {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      padding: 14px var(--content-padding-x) 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ==================== BODY CONTENT ==================== */
    .invoice-body {
      padding: 0;
    }

    /* Info header: customer + invoice meta */
    .info-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .info-left {
      max-width: 55%;
    }

    .info-right {
      text-align: right;
    }

    .info-label {
      font-size: 11px;
      color: #555;
      margin-bottom: 3px;
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }

    .info-value {
      font-size: 14px;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .info-value-normal {
      font-size: 13px;
      font-weight: 600;
      color: #1a1a2e;
      margin-bottom: 8px;
    }

    /* ==================== TABLE ==================== */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .items-table thead th {
      background: #f0f0f0;
      border-top: 2px solid #1a1a2e;
      border-bottom: 2px solid #1a1a2e;
      padding: 8px 10px;
      font-size: 12px;
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
      padding: 7px 10px;
      font-size: 12px;
      border-bottom: 1px solid #e0e0e0;
      vertical-align: middle;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .item-desc { text-align: left; }
    .item-price { text-align: center; }
    .item-qty { text-align: center; }
    .item-total { text-align: right; font-weight: 600; }

    .item-desc {
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    /* ==================== SUMMARY / FOOTER ==================== */
    .summary-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 2px solid #1a1a2e;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .bank-info {
      font-size: 12px;
      line-height: 1.45;
    }

    .bank-info .bank-name {
      color: #e8740c;
      font-weight: 700;
      font-size: 13px;
    }

    .bank-info .account-number {
      font-weight: 600;
      font-size: 12px;
    }

    .summary-table {
      border-collapse: collapse;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .summary-table .summary-row td {
      padding: 3px 0;
      font-size: 12px;
    }

    .summary-label {
      text-align: right;
      padding-right: 16px !important;
      font-weight: 600;
    }

    .summary-value {
      text-align: right;
      font-weight: 700;
      min-width: 110px;
    }

    .summary-grand-total .summary-value {
      font-size: 14px;
      color: #e8740c;
    }

    /* ==================== CLOSING / TANDA TANGAN ==================== */
    .bottom-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: -6px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .closing-section {
      margin-top: 0;
      padding: 0;
      display: flex;
      justify-content: flex-end;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .closing-signature {
      text-align: right;
      font-size: 12px;
      line-height: 1.4;
      min-width: 170px;
    }

    .closing-signature .hormat {
      font-style: italic;
      color: #555;
      margin-bottom: 18px;
    }

    .closing-signature .name {
      font-weight: 700;
      text-decoration: underline;
      font-size: 13px;
    }

    .closing-signature .title {
      font-size: 11px;
      color: #555;
    }

    /* ==================== FOOTER IMAGE ==================== */
    .footer-image-wrap {
      width: 400px;
      height: var(--footer-height);
      margin-top: 0;
      margin-left: calc(-1 * var(--content-padding-x));
      align-self: flex-end;
      flex-shrink: 0;
      line-height: 0;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .footer-image {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: left top;
    }

    .items-table tr,
    .summary-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ==================== PRINT MEDIA ==================== */
    @media print {
      html,
      body {
        width: var(--page-width);
        height: var(--page-height);
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>

  <div class="top-section">

  <!-- ===== HEADER ===== -->
  <div class="header">
    <img class="header-image" src="${HEADER_IMAGE_PATH}" alt="Crumbella Header" />
  </div>

  <!-- ===== INVOICE BANNER ===== -->
  <div class="invoice-banner">
    <h1>Invoice</h1>
  </div>
  </div>

  <div class="content-wrap">
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
        ${serviceChargeRow}
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

  <div class="bottom-meta-row">
    <!-- ===== FOOTER IMAGE ===== -->
    <div class="footer-image-wrap">
      <img class="footer-image" src="${FOOTER_IMAGE_PATH}" alt="Crumbella Footer" />
    </div>

    <!-- ===== CLOSING ===== -->
    <div class="closing-section">
      <div class="closing-signature">
        <div class="hormat">Hormat kami,</div>
        <div class="name">${escapeHtml(data.bank.accountName)}</div>
        <div class="title">Owner Crumbella</div>
      </div>
    </div>
  </div>
  </div>

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
