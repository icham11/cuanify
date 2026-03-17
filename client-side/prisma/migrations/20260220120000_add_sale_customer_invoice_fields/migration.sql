-- Add customer and invoice fields to Sale
ALTER TABLE "Sale"
  ADD COLUMN "customerName" TEXT,
  ADD COLUMN "customerEmail" TEXT,
  ADD COLUMN "customerPhone" TEXT,
  ADD COLUMN "invoiceId" TEXT,
  ADD COLUMN "invoiceUrl" TEXT,
  ADD COLUMN "invoiceStatus" TEXT;
