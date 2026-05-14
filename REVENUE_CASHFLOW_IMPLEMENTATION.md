# Revenue vs Cashflow Calculation - Implementation Guide

## Overview

Fixed the revenue and cashflow calculation to align with accounting principles:

- **Revenue**: Recognized on product delivery date (`delivery_date`)
- **Cashflow**: Recognized on booking creation date (`created_at`)

## Problem Solved

Previously, both revenue and cashflow were calculated based on payment transaction dates, which didn't distinguish between:

- When a booking was placed (creates a liability/obligation)
- When a product was delivered (actual revenue recognition)
- When payment was received (actual cash inflow)

## Solution Implemented

### New Functions in `financial-summary.ts`

#### 1. `getRevenueAmountInRange()`

```typescript
function getRevenueAmountInRange(
  order: BakeryFinancialOrder,
  fromDate: string,
  toDate: string,
): number;
```

- Returns the paid amount IF the order's `delivery_date` falls within the date range
- Capped at the total order price to prevent overstatement
- Returns 0 if no delivery date or delivery date is outside range

**Business Logic**: Revenue is earned when the product is delivered, regardless of when payment is received.

#### 2. `getCashFlowInAmountInRange()`

```typescript
function getCashFlowInAmountInRange(
  order: BakeryFinancialOrder,
  fromDate: string,
  toDate: string,
): number;
```

- Returns the paid amount IF the order's `created_at` falls within the date range
- Represents cash actually received (capped at total price)
- Returns 0 if booking was created outside the date range

**Business Logic**: Cashflow is recognized when booking is placed, indicating a customer commitment and liability.

### Updated `filterBakeryOrdersByDateRange()`

Now includes orders that have EITHER:

- Revenue in the date range (delivery happened), OR
- Cashflow in the date range (booking was created)

This ensures that pending orders (booked but not yet delivered) are still included in financial reports.

### Updated `calculateBakeryFinancialSummary()`

The main calculation function now:

1. Separately calculates `revenueAmountInRange` (based on delivery_date)
2. Separately calculates `cashFlowInAmountInRange` (based on created_at)
3. Uses `recognitionRatio` based on revenue amount to accurately allocate COGS
4. Populates both `totalRevenue` and `totalCashFlowIn` fields independently

## Example Scenario

**Order**: Created May 1, Paid May 5, Delivered May 10

- Value: Rp 100,000

### Report for May 1-5 (Beginning of Month)

- **Revenue**: Rp 0 (not yet delivered)
- **Cashflow**: Rp 100,000 (booking created on May 1)
- **COGS**: Rp 0 (revenue not recognized)

### Report for May 10-31 (Delivery Period)

- **Revenue**: Rp 100,000 (delivered on May 10)
- **Cashflow**: Rp 0 (booking was before this period)
- **COGS**: Allocated based on revenue recognition

## Testing

Comprehensive test suite in `__tests__/financial-summary.test.ts` covers:

1. Revenue recognition on delivery date
2. Cashflow recognition on booking creation date
3. Different revenue and cashflow in same period
4. Order filtering with revenue/cashflow date ranges
5. Handling pending orders (no delivery date)
6. Revenue capping at total price

## Backward Compatibility

The change maintains the following:

- `getPaymentAmountInRange()` function is retained for potential future use
- All existing fields in `BakeryFinancialSummary` remain unchanged
- The `bookedRevenue` field (total of all orders regardless of date) is preserved
- `operationalCost` calculations remain unchanged

## Key Metrics

| Metric            | Basis                                | Purpose                                     |
| ----------------- | ------------------------------------ | ------------------------------------------- |
| `totalRevenue`    | Delivery date                        | Actual business revenue earned              |
| `totalCashFlowIn` | Booking creation date                | Cash customer committed/liability incurred  |
| `bookedRevenue`   | Order total price                    | All orders in period (regardless of status) |
| `cogsCost`        | Delivery date (via recognitionRatio) | Cost of goods matching revenue              |
| `grossProfit`     | totalRevenue - cogsCost              | Profit before operating costs               |
| `netProfit`       | totalRevenue - totalCost             | Final profitability                         |

## Files Modified

- `client-side/lib/bakery/financial-summary.ts` - Main calculation logic
- `client-side/lib/bakery/__tests__/financial-summary.test.ts` - Test suite (new)
