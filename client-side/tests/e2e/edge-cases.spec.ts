import { test, expect } from '@playwright/test';

test.describe('Edge Cases E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Setup: Login for every test
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'kambiyang@mail.co');
    await page.fill('input[type="password"]', 'kambing123');
    await page.click('button:has-text("Masuk")');
    await page.waitForURL('**/dashboard**');
  });

  test('Edge Case 1: Form Validation Bypass (Double Submit)', async ({ page }) => {
    // Go to product creation page
    await page.goto('http://localhost:3000/dashboard/products/create');
    await page.waitForLoadState('networkidle');

    // Fill the required form fields
    await page.fill('input[placeholder="cth. Es Kopi Susu"]', 'Roti Testing Double Submit');
    // Fill category if needed
    await page.fill('input[placeholder="cth. Minuman"]', 'Testing Category');
    
    // Fill prices
    const priceInputs = await page.locator('input[type="number"]').all();
    if (priceInputs.length > 0) {
      await priceInputs[0].fill('15000'); // Selling Price
      if (priceInputs.length > 1) {
         await priceInputs[1].fill('10000'); // COGS
      }
    }

    // Capture the submit button
    const submitButton = page.locator('button[type="submit"]');

    // To simulate double click before disabled state kicks in
    // we bypass Playwright's default "wait for element to be actionable" by using force: true
    try {
      await submitButton.click({ force: true });
      await submitButton.click({ force: true });
      console.log('Double click sent to the form submit button');
    } catch (e) {
      console.log('Could not double click, button was likely disabled immediately.');
    }

    // Wait and check if the user is redirected to products page or remains with error
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    console.log(`URL after double submit: ${currentUrl}`);
    
    // Assert that we did not crash (no "500 Internal Server Error")
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Application error');
    expect(bodyText).not.toContain('500 Internal Server Error');
  });

  test('Edge Case 2: Koneksi Jaringan Putus Saat Mengakses Data (Offline Network)', async ({ page, context }) => {
    // Go to sales history
    await page.goto('http://localhost:3000/dashboard/sales-history');
    await page.waitForLoadState('networkidle');

    // Simulate going offline
    await context.setOffline(true);
    console.log('Browser is now offline');

    // Try navigating to another page that fetches data (e.g., business settings)
    try {
      await page.goto('http://localhost:3000/dashboard/business', { timeout: 10000 });
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
    await page.goto('http://localhost:3000/dashboard/staff');
    await page.waitForLoadState('networkidle');

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
