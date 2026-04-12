import { expect, test, type Page } from "@playwright/test";

type VisualPage = {
  id: string;
  path: string;
  requiresAuth: boolean;
};

const visualPages: VisualPage[] = [
  { id: "01-login", path: "/login", requiresAuth: false },
  { id: "02-dashboard", path: "/dashboard", requiresAuth: true },
  { id: "03-calendar", path: "/bakery/calendar", requiresAuth: true },
  { id: "04-production", path: "/bakery/production", requiresAuth: true },
];

const visualEmail = process.env.VISUAL_TEST_EMAIL;
const visualPassword = process.env.VISUAL_TEST_PASSWORD;

async function loginViaUi(page: Page) {
  test.skip(
    !visualEmail || !visualPassword,
    "Set VISUAL_TEST_EMAIL and VISUAL_TEST_PASSWORD to capture protected pages.",
  );

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("nama@email.com").fill(visualEmail!);
  await page.getByPlaceholder("Masukkan password").fill(visualPassword!);

  await Promise.all([
    page.waitForURL(/\/(dashboard|pos|onboarding)/, { timeout: 30_000 }),
    page.getByRole("button", { name: "Masuk" }).click(),
  ]);

  if (page.url().includes("/pos")) {
    test.skip(true, "Visual baseline dashboard pages requires owner/staff account, not cashier.");
  }

  if (page.url().includes("/onboarding")) {
    test.skip(true, "Visual baseline requires account with existing business setup.");
  }
}

async function stabilizeAndCapture(page: Page, snapshotName: string) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition-duration: 0s !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });

  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot(snapshotName, {
    fullPage: true,
    animations: "disabled",
    maxDiffPixelRatio: 0.03,
  });
}

test.describe("Admin visual baseline", () => {
  test.describe.configure({ mode: "serial" });

  for (const pageCase of visualPages) {
    test(`capture ${pageCase.id}`, async ({ page }) => {
      if (pageCase.requiresAuth) {
        await loginViaUi(page);
      }

      await page.goto(pageCase.path, { waitUntil: "domcontentloaded" });

      if (pageCase.requiresAuth && page.url().includes("/login")) {
        test.skip(true, "Protected page redirected to login. Check test credentials.");
      }

      await stabilizeAndCapture(page, `${pageCase.id}.png`);
    });
  }
});
