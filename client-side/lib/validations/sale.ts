import { z } from "zod";
import { PaymentMethod, PaymentStatus } from "@prisma/client";

// ===================== SALE ITEM =====================

export const saleItemSchema = z.object({
  productId: z.number().int().positive("Product ID must be positive"),
  quantity: z.number().int().positive("Quantity must be at least 1"),
});

export type SaleItemInput = z.infer<typeof saleItemSchema>;

// ===================== CREATE SALE =====================

export const createSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1, "At least one item is required"),
  paymentMethod: z.nativeEnum(PaymentMethod, {
    error: "Invalid payment method",
  }),
  paymentStatus: z.nativeEnum(PaymentStatus).optional().default(PaymentStatus.Paid),
  customerName: z.string().optional(),
  customerEmail: z.string().email("Invalid email").optional(),
  customerPhone: z.string().optional(),
  kasbonNotes: z.string().optional(),
  kasbonDueDate: z.string().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

// ===================== API RESPONSE TYPES =====================

export interface SaleWithItems {
  id: number;
  businessId: number;
  transactionNumber: string;
  totalRevenue: number;
  totalCost: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  invoiceId?: string | null;
  invoiceUrl?: string | null;
  invoiceStatus?: string | null;
  createdAt: string;
  saleItems: {
    id: number;
    productId: number;
    quantity: number;
    priceAtSale: number;
    costAtSale: number;
    product: {
      id: number;
      name: string;
      categoryId: number | null;
    };
  }[];
}

export interface SalesAnalytics {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  avgMargin: number;
  transactionCount: number;
  byPaymentMethod: {
    method: PaymentMethod;
    count: number;
    revenue: number;
  }[];
}