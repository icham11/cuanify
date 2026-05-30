import path from "path";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const TEST_EMAIL = process.env.BOOKING_E2E_EMAIL || "qa-booking-preview@crumbella.local";
const TEST_PASSWORD = process.env.BOOKING_E2E_PASSWORD || "QaBooking123!";



async function loginToDashboard(page: Page) {
  let response;
  for (let i = 0; i < 3; i++) {
    response = await page.context().request.post("/api/auth/login", {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    if (response.ok()) break;
    console.warn(`Login attempt ${i + 1} failed, retrying in 2s...`);
    await page.waitForTimeout(2000);
  }

  if (response && !response.ok()) {
    const text = await response.text();
    console.error("Login failed:", response.status(), text);
    throw new Error(`Login failed: ${response.status()} ${text}`);
  }
}

const mockCatalogResponse = {
  success: true,
  data: {
    productVariantPriceOverrides: {},
    addOnPriceOverrides: {},
    addOnCogsOverrides: {},
    inactiveProducts: [],
    inactiveAddOns: [],
    customProducts: [
      {
        category: "Buket",
        subcategory: "Hand Bouquet",
        productName: "Hand Bouquet (7-10 pcs)",
        variantLabel: "Start From",
        price: 200000
      }
    ],
    customAddOns: [
      {
        category: "Buket",
        id: "mock-bubblewrap-uuid",
        label: "Extra Bubblewrap Bouquet",
        price: 20000,
        cogs: 0
      }
    ]
  }
};

const mockOrderResponse = {
  success: true,
  data: {
    id: "mock-order-id-123",
    bookingCode: "TEST-BW-BUG",
    customerName: "QA Edit Customer",
    customerPhone: "08123456789",
    deliveryDate: "2099-12-31T00:00:00.000Z",
    salesChannel: "direct",
    deliveryMethod: "PICKUP",
    items: [
      {
        category: "Buket",
        subcategory: "Hand Bouquet",
        productName: "Hand Bouquet (7-10 pcs)",
        size: "Start From",
        quantity: 7,
        addOns: ["mock-bubblewrap-uuid"]
      }
    ],
    deliveryAddresses: []
  }
};

test.describe("Edit Booking Form - Order Level Add-ons", () => {
  test.setTimeout(90_000);



  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
    });

    // Intercept catalog API
    await page.route("**/api/bookings/catalog-config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockCatalogResponse),
      });
    });

    // Intercept single order API
    await page.route("**/api/bookings/orders/mock-order-id-123", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockOrderResponse),
      });
    });
  });

  test("calculates order-level add-on (bubblewrap) correctly on load and ignores quantity multiplier", async ({ page }) => {
    await loginToDashboard(page);

    // Go to the edit page for our mock order
    await page.goto("/bakery/bookings/mock-order-id-123/edit", { waitUntil: "domcontentloaded" });

    // Wait for the form to load by checking for a known field
    await expect(page.locator('input[name="customerName"]')).toHaveValue("QA Edit Customer", { timeout: 15_000 });

    // Check the "Price Summary" section
    const priceSummaryCard = page.locator('.space-y-3.px-6.pb-6.pt-0'); // CardContent inside Price Summary

    // The base price should be 200.000 because for Bouquet with qty=7, it is 1 bouquet unit.
    await expect(priceSummaryCard.getByText("Base Price").locator("..").locator("span").last()).toHaveText("Rp 200.000");

    // The add-on price should be exactly 20.000 (not multiplied by 7).
    await expect(priceSummaryCard.getByText("Add-ons").locator("..").locator("span").last()).toHaveText("Rp 20.000");

    // Total price should be Base(200.000) + Add-on(20.000) = 220.000
    await expect(priceSummaryCard.getByText("Total Price").locator("..").locator("span").last()).toHaveText("Rp 220.000");

    // Let's modify the quantity and ensure Add-on stays 20.000
    const qtyInput = page.locator('input[name="items.0.quantity"]');
    await qtyInput.fill("8");
    
    // Changing the quantity to 8 shouldn't change the base price (it's still 1 bouquet) or the add-on price.
    // Wait for a short moment for re-render
    await page.waitForTimeout(500);

    // Assert it remains unchanged
    await expect(priceSummaryCard.getByText("Base Price").locator("..").locator("span").last()).toHaveText("Rp 200.000");
    await expect(priceSummaryCard.getByText("Add-ons").locator("..").locator("span").last()).toHaveText("Rp 20.000");
    await expect(priceSummaryCard.getByText("Total Price").locator("..").locator("span").last()).toHaveText("Rp 220.000");
    
    // Now try removing the add-on to see it update properly
    const bubblewrapCheckbox = page.locator('div.bg-gray-50').filter({ hasText: 'Extra Bubblewrap Bouquet' }).locator('input[type="checkbox"]').first();
    await bubblewrapCheckbox.click({ force: true }); // Uncheck
    
    await page.waitForTimeout(500);
    await expect(priceSummaryCard.getByText("Add-ons").locator("..").locator("span").last()).toHaveText("Rp 0");
    await expect(priceSummaryCard.getByText("Total Price").locator("..").locator("span").last()).toHaveText("Rp 200.000");

    // Re-check
    await bubblewrapCheckbox.click(); // Check again
    await page.waitForTimeout(500);
    await expect(priceSummaryCard.getByText("Add-ons").locator("..").locator("span").last()).toHaveText("Rp 20.000");
  });
});
