import puppeteer from "puppeteer";

export interface WhatsAppOrderImagePayload {
  customerName: string;
  phone?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  item?: string;
  notes?: string;
  address?: string;
  imageUrl?: string;
}

const FALLBACK_IMAGE_URL = "https://via.placeholder.com/300";

function normalizeProductImageUrl(imageUrl?: string): string {
  const candidate = (imageUrl || "").trim();
  if (!candidate) return FALLBACK_IMAGE_URL;

  try {
    const parsed = new URL(candidate);
    const isPublicCloudinary =
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com";
    const isGeneratedOrderImage = parsed.pathname.includes("/orders/generated/");

    if (!isPublicCloudinary || isGeneratedOrderImage) {
      return FALLBACK_IMAGE_URL;
    }

    return parsed.toString();
  } catch {
    return FALLBACK_IMAGE_URL;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function field(label: string, value?: string): string {
  const safeValue = escapeHtml((value || "-").trim() || "-");
  return `<div class="row"><span class="label">${label}</span><span class="value">${safeValue}</span></div>`;
}

export async function generateOrderImage(
  order: WhatsAppOrderImagePayload,
): Promise<Buffer> {
  const productImageUrl = normalizeProductImageUrl(order.imageUrl);
  console.log("[generateOrderImage] Using image:", productImageUrl);

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });

    const html = `
      <html>
        <head>
          <style>
            * { box-sizing: border-box; font-family: Arial, sans-serif; }
            body { margin: 0; padding: 32px; background: #f4f4f5; }
            .card {
              width: 100%;
              max-width: 760px;
              margin: 0 auto;
              border-radius: 16px;
              background: #ffffff;
              border: 1px solid #e4e4e7;
              overflow: hidden;
            }
            .header {
              padding: 20px 24px;
              background: #111827;
              color: #ffffff;
            }
            .title { margin: 0; font-size: 22px; font-weight: 700; }
            .subtitle { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
            .content { padding: 20px 24px; }
            .hero {
              margin-bottom: 16px;
              border: 1px solid #e4e4e7;
              border-radius: 12px;
              padding: 8px;
              background: #fafafa;
            }
            .hero img {
              width: 100%;
              max-height: 300px;
              object-fit: contain;
              border-radius: 8px;
              display: block;
              background: #ffffff;
            }
            .row {
              display: grid;
              grid-template-columns: 160px 1fr;
              gap: 12px;
              padding: 10px 0;
              border-bottom: 1px dashed #d4d4d8;
            }
            .row:last-child { border-bottom: none; }
            .label { color: #6b7280; font-size: 13px; font-weight: 600; }
            .value { color: #111827; font-size: 14px; white-space: pre-wrap; }
            .footer {
              padding: 14px 24px;
              background: #f9fafb;
              color: #6b7280;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1 class="title">ORDER BARU MASUK - PRODUKSI</h1>
              <p class="subtitle">Generated otomatis dari sistem booking</p>
            </div>
            <div class="content">
              <div class="hero">
                <img src="${escapeHtml(productImageUrl)}" alt="Product image" />
              </div>
              ${field("Customer", order.customerName)}
              ${field("Phone", order.phone)}
              ${field("Delivery Date", order.deliveryDate)}
              ${field("Delivery Time", order.deliveryTime)}
              ${field("Item", order.item)}
              ${field("Address", order.address)}
              ${field("Notes", order.notes)}
            </div>
            <div class="footer">Cuanify Bakery Notification</div>
          </div>
        </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const imageBytes = await page.screenshot({ type: "png", fullPage: true });

    return Buffer.isBuffer(imageBytes)
      ? imageBytes
      : Buffer.from(imageBytes);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
