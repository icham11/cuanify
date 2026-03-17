-- Migration: 20260224000000_forecast_enhancements
-- Description: Add forecast-related tables and columns for enhanced analytics
-- This migration brings the database in sync with the Prisma schema for:
-- - ProductForecast (add lowerBound, upperBound, metadata, index)
-- - BusinessForecast (new table)
-- - ForecastAccuracy (new table)
-- - AnalyticsInsight (new table)
-- - BusinessHealthScores (add index)

-- =====================================================
-- ProductForecast enhancements
-- =====================================================

-- Add lowerBound column
ALTER TABLE "ProductForecast" ADD COLUMN IF NOT EXISTS "lowerBound" INTEGER NOT NULL DEFAULT 0;

-- Add upperBound column
ALTER TABLE "ProductForecast" ADD COLUMN IF NOT EXISTS "upperBound" INTEGER NOT NULL DEFAULT 0;

-- Add metadata column (JSON for volatility, buffer %, seasonality multiplier)
ALTER TABLE "ProductForecast" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Add descending index on productId, date for efficient forecast queries
CREATE INDEX IF NOT EXISTS "ProductForecast_productId_date_idx" ON "ProductForecast"("productId", "date" DESC);

-- =====================================================
-- BusinessForecast (new table)
-- =====================================================

CREATE TABLE IF NOT EXISTS "BusinessForecast" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "predictedRevenue" DECIMAL(14,2) NOT NULL,
    "predictedProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lowerBound" DECIMAL(14,2) NOT NULL,
    "upperBound" DECIMAL(14,2) NOT NULL,
    "confidenceScore" DECIMAL(5,2) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessForecast_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on businessId + date
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessForecast_businessId_date_key" ON "BusinessForecast"("businessId", "date");

-- Descending index for efficient queries
CREATE INDEX IF NOT EXISTS "BusinessForecast_businessId_date_idx" ON "BusinessForecast"("businessId", "date" DESC);

-- Foreign key to Business
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'BusinessForecast_businessId_fkey'
    ) THEN
        ALTER TABLE "BusinessForecast" ADD CONSTRAINT "BusinessForecast_businessId_fkey" 
            FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- =====================================================
-- ForecastAccuracy (new table - tracks MAPE per business)
-- =====================================================

CREATE TABLE IF NOT EXISTS "ForecastAccuracy" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "accuracy7d" DECIMAL(5,2),
    "accuracy30d" DECIMAL(5,2),
    "mape7d" DECIMAL(5,2),
    "mape30d" DECIMAL(5,2),
    "sampleSize7d" INTEGER NOT NULL DEFAULT 0,
    "sampleSize30d" INTEGER NOT NULL DEFAULT 0,
    "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastAccuracy_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on businessId (one record per business)
CREATE UNIQUE INDEX IF NOT EXISTS "ForecastAccuracy_businessId_key" ON "ForecastAccuracy"("businessId");

-- Index on businessId
CREATE INDEX IF NOT EXISTS "ForecastAccuracy_businessId_idx" ON "ForecastAccuracy"("businessId");

-- Foreign key to Business
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ForecastAccuracy_businessId_fkey'
    ) THEN
        ALTER TABLE "ForecastAccuracy" ADD CONSTRAINT "ForecastAccuracy_businessId_fkey" 
            FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- =====================================================
-- AnalyticsInsight (new table - AI-generated insights per section)
-- =====================================================

CREATE TABLE IF NOT EXISTS "AnalyticsInsight" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "insight" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsInsight_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on businessId + section
CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsInsight_businessId_section_key" ON "AnalyticsInsight"("businessId", "section");

-- Index on businessId
CREATE INDEX IF NOT EXISTS "AnalyticsInsight_businessId_idx" ON "AnalyticsInsight"("businessId");

-- Foreign key to Business
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'AnalyticsInsight_businessId_fkey'
    ) THEN
        ALTER TABLE "AnalyticsInsight" ADD CONSTRAINT "AnalyticsInsight_businessId_fkey" 
            FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- =====================================================
-- BusinessHealthScores enhancements
-- =====================================================

-- Add descending index for efficient health score trend queries
CREATE INDEX IF NOT EXISTS "BusinessHealthScores_businessId_date_idx" ON "BusinessHealthScores"("businessId", "date" DESC);
