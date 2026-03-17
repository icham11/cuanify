/**
 * Forecasting Utilities Module
 *
 * Provides helper functions for the improved forecasting system:
 * - Adaptive lookback window calculation
 * - Weekly seasonality adjustment
 * - Non-linear confidence decay
 * - Dynamic production buffer calculation
 * - Forecast accuracy (MAPE) calculation
 * - Price change detection
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DailySalesEntry {
  date: string; // YYYY-MM-DD
  qty: number;
}

export interface ForecastResult {
  predictions: number[];
  errors: number[];
  method: "ARIMA" | "WMA";
}

export interface SeasonalityMultipliers {
  // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  [dayOfWeek: number]: number;
}

export interface VolatilityInfo {
  stdDev: number;
  coefficientOfVariation: number;
  level: "low" | "medium" | "high";
  bufferPercentage: number;
}

export interface PriceChangeInfo {
  detected: boolean;
  note: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ADAPTIVE LOOKBACK WINDOW
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates the adaptive lookback window based on available historical data.
 *
 * Rules:
 * - If total historical data >= 60 days → use last 60 days
 * - If total historical data < 60 days → use all available data
 * - Minimum 5 data points required for meaningful analysis
 *
 * @param totalAvailableDays - Total number of days with any sales data
 * @returns Number of days to use for lookback
 */
export function calculateAdaptiveLookback(totalAvailableDays: number): number {
  const MAX_LOOKBACK = 60;
  const MIN_LOOKBACK = 5;

  if (totalAvailableDays >= MAX_LOOKBACK) {
    return MAX_LOOKBACK;
  }

  return Math.max(MIN_LOOKBACK, totalAvailableDays);
}

/**
 * Generates an array of date strings for the lookback window.
 *
 * @param lookbackDays - Number of days to look back
 * @param fromDate - Reference date (default: now)
 * @returns Array of date strings in YYYY-MM-DD format
 */
export function generateLookbackDates(lookbackDays: number, fromDate: Date = new Date()): string[] {
  const dates: string[] = [];
  for (let i = lookbackDays - 1; i >= 0; i--) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. WEEKLY SEASONALITY ADJUSTMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates weekday multipliers based on historical sales patterns.
 *
 * For each day of week (Mon-Sun):
 *   weekdayMultiplier = weekdayAvg / overallAvg
 *
 * Multipliers are capped between 0.7 and 1.3 to prevent extreme distortion.
 *
 * @param entries - Historical daily sales entries
 * @returns Multipliers indexed by day of week (0=Sun, 1=Mon, ..., 6=Sat)
 */
export function calculateWeekdayMultipliers(entries: DailySalesEntry[]): SeasonalityMultipliers {
  const weekdaySums: number[] = Array(7).fill(0);
  const weekdayCounts: number[] = Array(7).fill(0);

  // Aggregate sales by day of week
  for (const entry of entries) {
    if (entry.qty <= 0) continue;
    const dayOfWeek = new Date(entry.date).getDay(); // 0=Sun
    weekdaySums[dayOfWeek] += entry.qty;
    weekdayCounts[dayOfWeek]++;
  }

  // Calculate averages per weekday
  const weekdayAvgs = weekdaySums.map((sum, i) => (weekdayCounts[i] > 0 ? sum / weekdayCounts[i] : 0));

  // Calculate overall average (only from days with data)
  const totalQty = entries.reduce((sum, e) => sum + Math.max(0, e.qty), 0);
  const daysWithData = entries.filter((e) => e.qty > 0).length;
  const overallAvg = daysWithData > 0 ? totalQty / daysWithData : 1;

  // Generate multipliers with caps
  const MIN_MULTIPLIER = 0.7;
  const MAX_MULTIPLIER = 1.3;

  const multipliers: SeasonalityMultipliers = {};
  for (let i = 0; i < 7; i++) {
    if (weekdayAvgs[i] > 0 && overallAvg > 0) {
      const raw = weekdayAvgs[i] / overallAvg;
      multipliers[i] = Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, raw));
    } else {
      // Not enough data for this weekday - use neutral
      multipliers[i] = 1.0;
    }
  }

  return multipliers;
}

/**
 * Applies weekday seasonality adjustments to forecast predictions.
 *
 * @param predictions - Base forecasted quantities
 * @param startDate - First forecast date
 * @param multipliers - Weekday multipliers from calculateWeekdayMultipliers
 * @returns Seasonally adjusted predictions
 */
export function applySeasonalityAdjustment(
  predictions: number[],
  startDate: Date,
  multipliers: SeasonalityMultipliers,
): number[] {
  return predictions.map((pred, i) => {
    const forecastDate = new Date(startDate);
    forecastDate.setDate(forecastDate.getDate() + i + 1);
    const dayOfWeek = forecastDate.getDay();
    const multiplier = multipliers[dayOfWeek] ?? 1.0;
    return Math.round(pred * multiplier);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PRICE CHANGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detects if product price changed within the lookback window.
 *
 * Compares historical sale prices with current selling price.
 *
 * @param historicalPrices - Array of prices from past sales
 * @param currentPrice - Current selling price
 * @returns Price change detection info
 */
export function detectPriceChange(historicalPrices: number[], currentPrice: number): PriceChangeInfo {
  if (historicalPrices.length === 0) {
    return { detected: false, note: null };
  }

  // Check if any historical price differs from current by more than 5%
  const threshold = 0.05;
  const priceDifferences = historicalPrices.filter((p) => Math.abs(p - currentPrice) / currentPrice > threshold);

  if (priceDifferences.length > 0) {
    const avgHistorical = historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length;
    const changePercent = (((currentPrice - avgHistorical) / avgHistorical) * 100).toFixed(1);
    return {
      detected: true,
      note: `Harga berubah ${changePercent}% dari rata-rata historis. Prediksi menggunakan harga saat ini.`,
    };
  }

  return { detected: false, note: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. NON-LINEAR CONFIDENCE DECAY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates confidence score with non-linear decay.
 *
 * Formula: confidence = max(70, 95 - dayIndex^1.3)
 *
 * This provides:
 * - Day 1: 95%
 * - Day 2: ~92.5%
 * - Day 3: ~89.4%
 * - Day 7: ~80.6%
 * - Never below 70%
 *
 * @param dayIndex - 0-based index of forecast day (0 = tomorrow)
 * @returns Confidence score (70-95)
 */
export function calculateNonLinearConfidence(dayIndex: number): number {
  const BASE_CONFIDENCE = 95;
  const MIN_CONFIDENCE = 70;
  const DECAY_EXPONENT = 1.3;

  const decay = Math.pow(dayIndex, DECAY_EXPONENT);
  return Math.max(MIN_CONFIDENCE, Math.round((BASE_CONFIDENCE - decay) * 10) / 10);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FORECAST ACCURACY (MAPE)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AccuracyMetrics {
  mape7d: number | null; // Mean Absolute Percentage Error for last 7 days
  mape30d: number | null; // Mean Absolute Percentage Error for last 30 days
  accuracy7d: number | null; // 100 - MAPE (percentage accuracy)
  accuracy30d: number | null; // 100 - MAPE (percentage accuracy)
}

/**
 * Calculates Mean Absolute Percentage Error (MAPE) for forecast vs actual.
 *
 * MAPE = avg(|actual - forecast| / actual) * 100
 *
 * @param forecasts - Array of {date, predicted, actual}
 * @returns MAPE percentage (0-100+, lower is better)
 */
export function calculateMAPE(forecasts: { predicted: number; actual: number }[]): number | null {
  // Filter out zero actuals to avoid division by zero
  const validForecasts = forecasts.filter((f) => f.actual > 0);

  if (validForecasts.length === 0) {
    return null;
  }

  const apeSum = validForecasts.reduce((sum, f) => {
    const ape = Math.abs(f.actual - f.predicted) / f.actual;
    return sum + ape;
  }, 0);

  return Math.round((apeSum / validForecasts.length) * 1000) / 10; // One decimal place
}

/**
 * Calculates forecast accuracy as percentage (100 - MAPE).
 * Capped at 0-100%.
 *
 * @param mape - Mean Absolute Percentage Error
 * @returns Accuracy percentage (0-100)
 */
export function mapeToAccuracy(mape: number | null): number | null {
  if (mape === null) return null;
  return Math.max(0, Math.min(100, Math.round((100 - mape) * 10) / 10));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. DYNAMIC PRODUCTION BUFFER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates volatility and determines appropriate production buffer.
 *
 * Buffer logic:
 * - Low volatility (CoV < 0.3): +5% buffer
 * - Medium volatility (0.3 <= CoV < 0.6): +10% buffer
 * - High volatility (CoV >= 0.6): +15% buffer
 *
 * @param dailyQuantities - Array of historical daily quantities
 * @returns Volatility info with buffer percentage
 */
export function calculateVolatilityAndBuffer(dailyQuantities: number[]): VolatilityInfo {
  // Filter to only days with sales
  const nonZero = dailyQuantities.filter((q) => q > 0);

  if (nonZero.length < 2) {
    // Not enough data - use medium buffer as safe default
    return {
      stdDev: 0,
      coefficientOfVariation: 0.5,
      level: "medium",
      bufferPercentage: 10,
    };
  }

  // Calculate mean
  const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;

  // Calculate standard deviation
  const squaredDiffs = nonZero.map((q) => Math.pow(q - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / nonZero.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of Variation
  const cov = mean > 0 ? stdDev / mean : 0;

  // Determine buffer level
  let level: "low" | "medium" | "high";
  let bufferPercentage: number;

  if (cov < 0.3) {
    level = "low";
    bufferPercentage = 5;
  } else if (cov < 0.6) {
    level = "medium";
    bufferPercentage = 10;
  } else {
    level = "high";
    bufferPercentage = 15;
  }

  return {
    stdDev: Math.round(stdDev * 100) / 100,
    coefficientOfVariation: Math.round(cov * 1000) / 1000,
    level,
    bufferPercentage,
  };
}

/**
 * Generates production recommendation with dynamic buffer.
 *
 * @param predictedQty - Forecasted quantity
 * @param volatility - Volatility info from calculateVolatilityAndBuffer
 * @returns Human-readable production recommendation
 */
export function generateProductionRecommendation(predictedQty: number, volatility: VolatilityInfo): string {
  if (predictedQty === 0) {
    return "Tidak perlu produksi";
  }

  const bufferedQty = Math.ceil(predictedQty * (1 + volatility.bufferPercentage / 100));
  const volatilityLabel =
    volatility.level === "low" ? "stabil" : volatility.level === "medium" ? "sedang" : "fluktuatif";

  return `Produksi ~${bufferedQty} unit (buffer ${volatility.bufferPercentage}%, demand ${volatilityLabel})`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Converts a Date or string to YYYY-MM-DD format.
 */
export function toDateString(date: Date | string): string {
  if (typeof date === "string") {
    return date.split("T")[0];
  }
  return date.toISOString().split("T")[0];
}

/**
 * Gets the day of week index (0=Sun, 1=Mon, ..., 6=Sat) for a date.
 */
export function getDayOfWeek(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getDay();
}
