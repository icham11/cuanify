-- Migration: Add Marketplace to PaymentMethod enum and marketplaceSalesTotal to CashierShift
-- Jalankan script ini di Supabase SQL Editor sebelum deploy ke production.

-- 1. Tambah nilai Marketplace ke enum PaymentMethod
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'Marketplace';

-- 2. Tambah kolom marketplaceSalesTotal ke tabel CashierShift
ALTER TABLE "CashierShift"
  ADD COLUMN IF NOT EXISTS "marketplaceSalesTotal" DECIMAL(14, 2);
