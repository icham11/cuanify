import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

type A11yPage = {
  name: string;
  path: string;
  requiresAuth: boolean;
};

const pages: A11yPage[] = [
  { name: "login", path: "/login", requiresAuth: false },
  { name: "dashboard", path: "/dashboard", requiresAuth: true },
  { name: "calendar", path: "/bakery/calendar", requiresAuth: true },
  { name: "production", path: "/bakery/production", requiresAuth: true },
];

const visualEmail = process.env.VISUAL_TEST_EMAIL;
const visualPassword = process.env.VISUAL_TEST_PASSWORD;

async function loginViaUi(page: Page) {
  test.skip(
    !visualEmail || !visualPassword,
    "Set VISUAL_TEST_EMAIL and VISUAL_TEST_PASSWORD to run protected-page a11y smoke.",
  );

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("nama@email.com").fill(visualEmail!);
  await page.getByPlaceholder("Masukkan password").fill(visualPassword!);

  await Promise.all([
    page.waitForURL(/\/(dashboard|pos|onboarding)/, { timeout: 30_000 }),
    page.getByRole("button", { name: "Masuk" }).click(),
  ]);

  if (page.url().includes("/pos")) {
    test.skip(true, "A11y smoke dashboard pages requires owner/staff account, not cashier.");
  }

  if (page.url().includes("/onboarding")) {
    test.skip(true, "A11y smoke requires account with existing business setup.");
  }
}

for (const pageCase of pages) {
  test(`a11y smoke - ${pageCase.name}`, async ({ page }) => {
    if (pageCase.requiresAuth) {
      await loginViaUi(page);
    }

    await page.goto(pageCase.path, { waitUntil: "domcontentloaded" });
    if (pageCase.requiresAuth && page.url().includes("/login")) {
      test.skip(true, "Protected page redirected to login. Check test credentials.");
    }

    const analysis = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(analysis.violations, JSON.stringify(analysis.violations, null, 2)).toEqual(
      [],
    );
  });
}
