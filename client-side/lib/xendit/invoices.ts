import { logPayment } from "@/lib/logger";

const XENDIT_INVOICE_URL = "https://api.xendit.co/v2/invoices";

// Check if Xendit is properly configured
const XENDIT_ENABLED = (() => {
  const key = process.env.XENDIT_SECRET_KEY || "";
  // Only enable if key exists and is not a placeholder
  return key && !key.startsWith("your-") && key.length > 10;
})();

export interface XenditInvoiceInput {
  externalId: string;
  amount: number;
  payerEmail: string;
  description: string;
  customer?: {
    givenNames?: string;
    email?: string;
    mobileNumber?: string;
  };
}

export interface XenditInvoiceResponse {
  id: string;
  status: string;
  invoiceUrl: string;
}

function getAuthHeader() {
  const serverKey = process.env.XENDIT_SECRET_KEY || "";
  if (!serverKey || !XENDIT_ENABLED) {
    throw new Error(
      "XENDIT_SECRET_KEY is not configured. Please provide a valid Xendit API key.",
    );
  }
  const encoded = Buffer.from(`${serverKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

export async function createXenditInvoice(
  input: XenditInvoiceInput,
): Promise<XenditInvoiceResponse | null> {
  // If Xendit is not enabled, return null instead of throwing error
  if (!XENDIT_ENABLED) {
    logPayment.warn("Xendit not configured — invoice creation skipped");
    return null;
  }

  const payload = {
    external_id: input.externalId,
    amount: input.amount,
    payer_email: input.payerEmail,
    description: input.description,
    customer: input.customer,
  };

  try {
    const response = await fetch(XENDIT_INVOICE_URL, {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logPayment.error("Xendit API error", { status: response.status, body: errorBody });

      // If it's an auth error, return null instead of throwing
      if (response.status === 401) {
        logPayment.error("Xendit authentication failed — invalid API key");
        return null;
      }

      // For other errors, log and return null
      logPayment.error("Xendit API request failed");
      return null;
    }

    const data = (await response.json()) as {
      id: string;
      status: string;
      invoice_url: string;
    };

    return {
      id: data.id,
      status: data.status,
      invoiceUrl: data.invoice_url,
    };
  } catch (error) {
    logPayment.error("Xendit invoice creation failed", { error });
    // Return null to allow app to continue without Xendit
    return null;
  }
}
