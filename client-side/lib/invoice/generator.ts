/**
 * Invoice/Receipt generation helper for Midtrans transactions
 * Generates HTML receipt that can be printed or downloaded as PDF
 */

import type { Sale, SaleItem } from "@prisma/client";

export interface ReceiptData {
  sale: Sale & { saleItems: SaleItem[] };
  businessName: string;
  businessLocation?: string;
}

export function generateInvoiceHTML(data: ReceiptData): string {
  const { sale, businessName, businessLocation } = data;
  const date = new Date(sale.createdAt);
  const dateStr = date.toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subtotal = Number(sale.totalRevenue);
  const tax = Math.round(subtotal * 0.1); // Assume 10% tax
  const total = subtotal + tax;

  let itemsHTML = "";
  for (const item of sale.saleItems) {
    const price = Number(item.priceAtSale);
    const itemTotal = price * item.quantity;
    itemsHTML += `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.productId}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">Product Item</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">Rp ${price.toLocaleString("id-ID")}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">Rp ${itemTotal.toLocaleString("id-ID")}</td>
      </tr>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice - ${sale.transactionNumber}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          padding: 20px;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 40px;
          border-bottom: 3px solid #007bff;
          padding-bottom: 20px;
        }
        .logo-section h1 {
          font-size: 28px;
          font-weight: bold;
          color: #007bff;
          margin-bottom: 5px;
        }
        .logo-section p {
          color: #666;
          font-size: 14px;
        }
        .invoice-info {
          text-align: right;
        }
        .invoice-info h2 {
          font-size: 24px;
          color: #007bff;
          margin-bottom: 10px;
        }
        .invoice-info p {
          font-size: 14px;
          color: #666;
          margin: 5px 0;
        }
        .details-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-bottom: 40px;
        }
        .detail-block {
          display: flex;
          flex-direction: column;
        }
        .detail-block h3 {
          font-size: 12px;
          text-transform: uppercase;
          color: #999;
          margin-bottom: 10px;
          font-weight: 600;
        }
        .detail-block p {
          font-size: 14px;
          margin: 5px 0;
          color: #333;
        }
        table {
          width: 100%;
          margin: 30px 0;
          border-collapse: collapse;
        }
        th {
          background: #007bff;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: 600;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #ddd;
        }
        .summary {
          display: flex;
          justify-content: flex-end;
          margin-top: 30px;
        }
        .summary-box {
          width: 300px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #ddd;
        }
        .summary-row.total {
          font-weight: bold;
          font-size: 16px;
          border-bottom: 2px solid #007bff;
          border-top: 2px solid #007bff;
          padding: 15px 0;
          margin-top: 10px;
        }
        .payment-method {
          margin-top: 30px;
          padding: 15px;
          background: #f5f5f5;
          border-radius: 5px;
        }
        .payment-method p {
          font-size: 14px;
          margin: 5px 0;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 12px;
          color: #999;
        }
        .print-button {
          text-align: center;
          margin-top: 30px;
        }
        button {
          background: #007bff;
          color: white;
          padding: 12px 30px;
          border: none;
          border-radius: 5px;
          font-size: 14px;
          cursor: pointer;
          margin: 5px;
        }
        button:hover {
          background: #0056b3;
        }
        @media print {
          body {
            padding: 0;
          }
          .container {
            box-shadow: none;
            max-width: 100%;
          }
          .print-button {
            display: none;
          }
          button {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo-section">
            <h1>${businessName}</h1>
            ${businessLocation ? `<p>${businessLocation}</p>` : ""}
          </div>
          <div class="invoice-info">
            <h2>INVOICE</h2>
            <p><strong>No:</strong> ${sale.transactionNumber}</p>
            <p><strong>Tanggal:</strong> ${dateStr}</p>
          </div>
        </div>

        <div class="details-section">
          <div class="detail-block">
            <h3>Ditagihkan Kepada</h3>
            <p><strong>${sale.customerName || "Customer"}</strong></p>
            <p>${sale.customerEmail || "-"}</p>
            <p>${sale.customerPhone || "-"}</p>
          </div>
          <div class="detail-block">
            <h3>Detail Transaksi</h3>
            <p><strong>Status:</strong> ${sale.paymentStatus}</p>
            <p><strong>Metode Pembayaran:</strong> ${sale.paymentMethod}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Deskripsi</th>
              <th>Qty</th>
              <th style="text-align: right;">Harga Satuan</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="summary">
          <div class="summary-box">
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>Rp ${subtotal.toLocaleString("id-ID")}</span>
            </div>
            <div class="summary-row">
              <span>Pajak (10%):</span>
              <span>Rp ${tax.toLocaleString("id-ID")}</span>
            </div>
            <div class="summary-row total">
              <span>TOTAL:</span>
              <span>Rp ${total.toLocaleString("id-ID")}</span>
            </div>
          </div>
        </div>

        <div class="payment-method">
          <p><strong>Metode Pembayaran:</strong> ${sale.paymentMethod}</p>
          <p><strong>Status Pembayaran:</strong> <span style="color: ${sale.paymentStatus === "Paid" ? "green" : "orange"}">${sale.paymentStatus === "Paid" ? "✓ Lunas" : "Pending"}</span></p>
        </div>

        <div class="footer">
          <p>Terima kasih atas pembelian Anda!</p>
          <p>Invoice ini digenerate otomatis dan berlaku sebagai bukti transaksi</p>
        </div>

        <div class="print-button">
          <button onclick="window.print()">🖨️ Print Invoice</button>
          <button onclick="downloadPDF()">📥 Download PDF</button>
        </div>
      </div>

      <script>
        function downloadPDF() {
          const element = document.querySelector('.container');
          const opt = {
            margin: 10,
            filename: '${sale.transactionNumber}.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
          };
          
          // Note: Requires html2pdf library to be loaded
          if (typeof html2pdf !== 'undefined') {
            html2pdf().set(opt).from(element).save();
          } else {
            alert('PDF library not loaded. Please use Print to PDF instead.');
            window.print();
          }
        }
      </script>
    </body>
    </html>
  `;
}

/**
 * Generate invoice receipt text for plain text output
 */
export function generateInvoiceText(data: ReceiptData): string {
  const { sale, businessName, businessLocation } = data;
  const date = new Date(sale.createdAt).toLocaleDateString("id-ID");

  let itemsText = "";
  for (const item of sale.saleItems) {
    const price = Number(item.priceAtSale);
    const total = price * item.quantity;
    itemsText += `
${item.productId.toString().padEnd(5)} | Qty: ${item.quantity.toString().padEnd(3)} | Rp ${price.toLocaleString("id-ID").padEnd(12)} | Rp ${total.toLocaleString("id-ID")}
    `;
  }

  const subtotal = Number(sale.totalRevenue);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;

  return `
╔════════════════════════════════════════════╗
║           INVOICE / KUITANSI                ║
╚════════════════════════════════════════════╝

${businessName}
${businessLocation ? businessLocation : ""}

─────────────────────────────────────────────
No Invoice: ${sale.transactionNumber}
Tanggal   : ${date}
─────────────────────────────────────────────

DITAGIHKAN KEPADA:
${sale.customerName || "Customer"}
Email    : ${sale.customerEmail || "-"}
Phone    : ${sale.customerPhone || "-"}

─────────────────────────────────────────────
DAFTAR BARANG:
─────────────────────────────────────────────
${itemsText}
─────────────────────────────────────────────

Subtotal          : Rp ${subtotal.toLocaleString("id-ID")}
Pajak (10%)       : Rp ${tax.toLocaleString("id-ID")}
─────────────────────────────────────────────
TOTAL             : Rp ${total.toLocaleString("id-ID")}
═════════════════════════════════════════════

Metode Pembayaran : ${sale.paymentMethod}
Status Pembayaran : ${sale.paymentStatus === "Paid" ? "✓ Lunas" : "Pending"}

Terima kasih atas pembelian Anda!
Invoice ini berlaku sebagai bukti transaksi sah.

═════════════════════════════════════════════
  `;
}


