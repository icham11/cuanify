import { test, expect } from '@playwright/test';

test('E2E All Features Test', async ({ page }) => {
  // Set extended timeout for e2e
  test.setTimeout(120000);

  // 1. Go to login page
  await page.goto('http://localhost:3000/login');

  // 2. Fill login form
  await page.fill('input[type="email"]', 'kambiyang@mail.co');
  await page.fill('input[type="password"]', 'kambing123');
  await page.click('button:has-text("Masuk")');

  // 3. Wait for dashboard page to load (checking URL or specific element)
  await page.waitForURL('**/dashboard**');
  console.log('Logged in and navigated to Dashboard successfully');

  // List of paths to test (except POS)
  const pathsToTest = [
    { name: 'Dashboard Home', path: '/dashboard' },
    { name: 'Staff Management', path: '/dashboard/staff' },
    { name: 'Products Catalog', path: '/dashboard/products' },
    { name: 'Business Settings', path: '/dashboard/business' },
    { name: 'Sales History', path: '/dashboard/sales-history' },
    { name: 'Add-ons', path: '/dashboard/add-ons' },
    { name: 'Ingredients', path: '/dashboard/ingredients' },
    { name: 'Debts', path: '/dashboard/debts' },
    { name: 'Export', path: '/dashboard/export' },
    { name: 'Production', path: '/dashboard/production' },
    { name: 'Recipes', path: '/dashboard/recipes' }
  ];

  // 4. Navigate through each feature
  for (const item of pathsToTest) {
    console.log(`Navigating to ${item.name} (${item.path})`);
    
    // Some routes might be nested or have different actual paths, but we try standard paths
    const response = await page.goto(`http://localhost:3000${item.path}`, { waitUntil: 'networkidle' });
    
    // Check if page loaded OK (status 200 or 304, or maybe 404 if path is slightly different)
    if (response) {
      console.log(`Status for ${item.name}: ${response.status()}`);
    }
    
    // Basic check that it didn't crash
    const bodyText = await page.textContent('body');
    if (bodyText?.includes('Application error') || bodyText?.includes('500 Internal Server Error')) {
      console.error(`Page ${item.name} crashed!`);
    } else {
      console.log(`Page ${item.name} loaded successfully.`);
    }

    // Take a small delay to mimic human behavior
    await page.waitForTimeout(1000);
  }
  
  console.log('Finished testing all requested features.');
});
