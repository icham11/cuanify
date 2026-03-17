import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: number;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "midtrans-client" {
  interface SnapConfig {
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  }

  interface CoreApiConfig {
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  }

  interface TransactionDetails {
    order_id: string;
    gross_amount: number;
  }

  interface CustomerDetails {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    billing_address?: {
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      postal_code?: string;
      country_code?: string;
    };
    shipping_address?: {
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      postal_code?: string;
      country_code?: string;
    };
  }

  interface ItemDetails {
    id?: string;
    price: number;
    quantity: number;
    name: string;
    brand?: string;
    category?: string;
    merchant_name?: string;
  }

  interface SnapTransactionRequest {
    transaction_details: TransactionDetails;
    customer_details?: CustomerDetails;
    item_details?: ItemDetails[];
    credit_card?: {
      secure: boolean;
    };
    usage_limit?: number;
    expiry?: {
      start_time: string;
      unit: string;
      duration: number;
    };
  }

  interface SnapTransactionResponse {
    token: string;
    redirect_url: string;
  }

  class Snap {
    constructor(config: SnapConfig);
    createTransaction(
      transactionRequest: SnapTransactionRequest
    ): Promise<SnapTransactionResponse>;
    createTransactionToken(
      transactionRequest: SnapTransactionRequest
    ): Promise<string>;
    transaction: {
      notification(notificationBody: Record<string, unknown>): Promise<any>;
      status(transactionId: string): Promise<any>;
      statusb2b(transactionId: string): Promise<any>;
      approve(transactionId: string): Promise<any>;
      deny(transactionId: string): Promise<any>;
      cancel(transactionId: string): Promise<any>;
      expire(transactionId: string): Promise<any>;
      refund(transactionId: string, refundRequest?: Record<string, unknown>): Promise<any>;
      refundDirect(
        transactionId: string,
        refundRequest: Record<string, unknown>
      ): Promise<any>;
    };
  }

  class CoreApi {
    constructor(config: CoreApiConfig);
    charge(chargeRequest: Record<string, unknown>): Promise<any>;
    cardToken(
      cardRequest: Record<string, unknown>
    ): Promise<{ token_id: string }>;
  }

  export { Snap, CoreApi };
  export default {
    Snap,
    CoreApi,
  };
}

