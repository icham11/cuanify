export interface MidtransItem {
  id: string;
  price: number;
  quantity: number;
  name: string;
}

export interface MidtransCustomerDetails {
  first_name: string;
  email: string;
  phone?: string;
}

export interface MidtransTransactionDetails {
  order_id: string;
  gross_amount: number;
}

export interface MidtransParameter {
  transaction_details: MidtransTransactionDetails;
  item_details: MidtransItem[];
  customer_details: MidtransCustomerDetails;
  enabled_payments?: string[];
  callbacks?: {
    finish?: string;
    error?: string;
    pending?: string;
  };
}

export interface MidtransSnapResponse {
  token: string;
  redirect_url: string;
}

export interface MidtransNotification {
  transaction_id: string;
  order_id: string;
  gross_amount: string;
  payment_type: string;
  transaction_status: string;
  fraud_status?: string;
  transaction_time: string;
  signature_key: string;
}
