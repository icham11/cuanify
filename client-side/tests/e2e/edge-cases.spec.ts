import { test, expect } from '@playwright/test';

const TEST_EMAIL =
  process.env.BOOKING_E2E_EMAIL || "qa-booking-preview@crumbella.local";
const TEST_PASSWORD =
  process.env.BOOKING_E2E_PASSWORD || "QaBooking123!";

test.describe('Edge Cases E2E Tests', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    const response = await page.context().request.post("/api/auth/login", {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
      failOnStatusCode: false,
    });

    if (!response.ok()) {
      throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
    }

    await page.goto("/api/auth/post-login", { waitUntil: "domcontentloaded" });
    await page.waitForURL(
      (url) => !url.pathname.startsWith("/api/auth/post-login"),
      { timeout: 30_000 },
    );
  });

  test('Edge Case 1: Form Validation Bypass (Double Submit)', async ({ page }) => {
    // Go to product creation page
    await page.goto('/dashboard/products/create', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const productNameInput = page.locator(
      'input[placeholder="cth. Es Kopi Susu"], input[name="name"], input[name="productName"]',
    ).first();
    if (await productNameInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await productNameInput.fill('Roti Testing Double Submit');
    }

    const categoryInput = page.locator(
      'input[placeholder="cth. Minuman"], input[name="category"]',
    ).first();
    if (await categoryInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await categoryInput.fill('Testing Category');
    }
    
    // Fill prices
    const priceInputs = await page.locator('input[type="number"]').all();
    if (priceInputs.length > 0) {
      await priceInputs[0].fill('15000'); // Selling Price
      if (priceInputs.length > 1) {
         await priceInputs[1].fill('10000'); // COGS
      }
    }

    // Capture the submit button
    const submitButton = page.locator('button[type="submit"]').first();

    // To simulate double click before disabled state kicks in
    // we bypass Playwright's default "wait for element to be actionable" by using force: true
    if (await submitButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await submitButton.click({ force: true, timeout: 1_000 }).catch(() => {});
      await submitButton.click({ force: true, timeout: 1_000 }).catch(() => {});
      console.log('Double click sent to the form submit button');
    } else {
      console.log('Could not double click, button was likely disabled immediately.');
    }

    // Wait and check if the user is redirected to products page or remains with error
    await page.waitForTimeout(500);
    const currentUrl = page.url();
    console.log(`URL after double submit: ${currentUrl}`);
    
    // Assert that we did not crash (no "500 Internal Server Error")
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Application error');
    expect(bodyText).not.toContain('500 Internal Server Error');
  });

  test('Edge Case 2: Koneksi Jaringan Putus Saat Mengakses Data (Offline Network)', async ({ page, context }) => {
    // Go to sales history
    await page.goto('/dashboard/sales-history', { waitUntil: 'domcontentloaded' });

    // Simulate going offline
    await context.setOffline(true);
    console.log('Browser is now offline');

    // Try navigating to another page that fetches data (e.g., business settings)
    try {
      await page.goto('/dashboard/business', { timeout: 10000 });
    } catch (e) {
      console.log('Navigation correctly failed or timed out due to offline mode.');
    }

    // Check if the application crashed completely
    const bodyText = await page.textContent('body');
    if (bodyText) {
      expect(bodyText).not.toContain('Application error');
    }
  });

  test('Edge Case 3: Token Expiration / Session Timeout', async ({ page, context }) => {
    // Go to staff management
    await page.goto('/dashboard/staff', { waitUntil: 'domcontentloaded' });

    // Clear all cookies to simulate session expiry
    await context.clearCookies();
    console.log('Cookies cleared (Session expired)');

    // Attempt to interact with the page or reload
    await page.reload();

    // Since session is expired, it should redirect to login page
    await page.waitForTimeout(2000);
    const url = page.url();
    console.log(`URL after reload with cleared session: ${url}`);
    
    // Assertion: URL should contain /login
    expect(url).toContain('/login');
  });

});
