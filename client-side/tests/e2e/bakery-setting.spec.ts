import path from "path";
import dotenv from "dotenv";
import { expect, test, type Page } from "@playwright/test";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const TEST_EMAIL =
  process.env.BOOKING_E2E_EMAIL || "qa-booking-preview@crumbella.local";
const TEST_PASSWORD =
  process.env.BOOKING_E2E_PASSWORD || "QaBooking123!";
const OWNER_TEST_EMAIL = process.env.BAKERY_OWNER_E2E_EMAIL || "";
const OWNER_TEST_PASSWORD = process.env.BAKERY_OWNER_E2E_PASSWORD || "";

type MockViewer = {
  userId: number;
  businessId: number;
  role: "Owner" | "Admin" | "Cashier" | "Staff";
  name: string;
  email: string;
  businessName: string;
};

type MockSettings = {
  dailyProductionTokenLimit: number;
  staffDailyTokenLimit: number;
  cutoffHour: number;
  cutoffEnabled: boolean;
  attendanceWindowEnabled: boolean;
  attendanceWindowStart: string;
  attendanceWindowEnd: string;
  defaultDpPercentage: number;
  notifyProductionWhatsapp: boolean;
  blockedDates: string[];
  holidayEntries: Array<{ date: string; label: string; tag: string }>;
  staffSettings: Array<{
    userId: number;
    name: string;
    role: string;
    dailyTokenLimit: number;
    monthlySalary: number;
    mealAllowance: number;
    takeHomePay: number;
    isActive: boolean;
  }>;
  monthlyExpenses: Array<{
    id: string;
    monthKey: string;
    name: string;
    amount: number;
    category: "ads" | "custom";
    note: string;
  }>;
  attendanceReconciliation: Array<{
    id: string;
    monthKey: string;
    staffUserId: number;
    staffName: string;
    manualLateCount: number;
    note: string;
  }>;
  productionStageProfiles: Array<{
    category: string;
    stages: Array<{
      stage: "lining" | "filling" | "finishing";
      label: string;
      percentage: number;
    }>;
  }>;
};

type MockOrder = {
  id: string;
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  deliveryDate: string;
  deliverySlot: string;
  orderStatus: string;
  paymentStatus: string;
  totalPrice: number;
  totalPaidAmount: number;
  createdAt: string;
  updatedAt: string;
  product: string;
  items: Array<{
    category: string;
    productName: string;
    quantity: number;
    tokenDifficulty: string;
    lineTotal: number;
    basePrice: number;
  }>;
};

type MockState = {
  viewer: MockViewer;
  settings: MockSettings;
  orders: MockOrder[];
};

const OWNER_VIEWER: MockViewer = {
  userId: 7,
  businessId: 12,
  role: "Owner",
  name: "Owner QA",
  email: TEST_EMAIL,
  businessName: "Crumbella QA",
};

const STAFF_VIEWER: MockViewer = {
  userId: 44,
  businessId: 12,
  role: "Staff",
  name: "Dina Staff",
  email: "staff-qa@crumbella.local",
  businessName: "Crumbella QA",
};

function createDefaultState(viewer: MockViewer): MockState {
  return {
    viewer,
    settings: {
      dailyProductionTokenLimit: 500,
      staffDailyTokenLimit: 500,
      cutoffHour: 10,
      cutoffEnabled: true,
      attendanceWindowEnabled: true,
      attendanceWindowStart: "06:00",
      attendanceWindowEnd: "07:00",
      defaultDpPercentage: 50,
      notifyProductionWhatsapp: true,
      blockedDates: [],
      holidayEntries: [],
      staffSettings: [
        {
          userId: 44,
          name: "Dina Staff",
          role: "Staff",
          dailyTokenLimit: 500,
          monthlySalary: 2_000_000,
          mealAllowance: 250_000,
          takeHomePay: 2_250_000,
          isActive: true,
        },
      ],
      monthlyExpenses: [
        {
          id: "2026-07-ads",
          monthKey: "2026-07",
          name: "Biaya Iklan",
          amount: 0,
          category: "ads",
          note: "Meta Ads / konten / campaign",
        },
        {
          id: "2026-07-packaging",
          monthKey: "2026-07",
          name: "Packaging Tambahan",
          amount: 0,
          category: "custom",
          note: "Tambahan pita, box, custom insert",
        },
      ],
      attendanceReconciliation: [],
      productionStageProfiles: [
        {
          category: "Cookies",
          stages: [
            { stage: "lining", label: "Lining", percentage: 25 },
            { stage: "filling", label: "Filling", percentage: 25 },
            { stage: "finishing", label: "Finishing", percentage: 50 },
          ],
        },
      ],
    },
    orders: [
      {
        id: "ORD-QA-1",
        bookingCode: "BK-2026-07-001",
        customerName: "Nadia QA",
        customerPhone: "081234567890",
        deliveryDate: "2026-07-20",
        deliverySlot: "10:00",
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        totalPrice: 100000,
        totalPaidAmount: 100000,
        createdAt: "2026-07-10T08:00:00.000Z",
        updatedAt: "2026-07-10T08:00:00.000Z",
        product: "Cookies Premium",
        items: [
          {
            category: "Cookies",
            productName: "Cookies Premium",
            quantity: 1,
            tokenDifficulty: "simple",
            lineTotal: 100000,
            basePrice: 100000,
          },
        ],
      },
    ],
  };
}

async function freezeBrowserClock(page: Page, isoTimestamp: string) {
  await page.addInitScript(({ now }) => {
    const fixedTime = new Date(now).valueOf();
    const RealDate = Date;

    class MockDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(fixedTime);
          return;
        }
        super(...args);
      }

      static now() {
        return fixedTime;
      }
    }

    MockDate.parse = RealDate.parse;
    MockDate.UTC = RealDate.UTC;

    Object.defineProperty(window, "Date", {
      configurable: true,
      writable: true,
      value: MockDate,
    });
  }, { now: isoTimestamp });
}

async function loginToDashboard(
  page: Page,
  credentials = {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  },
) {
  const response = await page.context().request.post("/api/auth/login", {
    data: {
      email: credentials.email,
      password: credentials.password,
    },
    failOnStatusCode: false,
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }

  await page.goto("/api/auth/post-login", { waitUntil: "networkidle" });
  await page.waitForURL(
    (url) => !url.pathname.startsWith("/api/auth/post-login"),
  );
}

function buildAttendanceWindow(settings: MockSettings, todayKey: string) {
  const startLabel = settings.attendanceWindowStart.replace(":", ".");
  const endLabel = settings.attendanceWindowEnd.replace(":", ".");
  const isHolidayToday = settings.blockedDates.includes(todayKey);

  return {
    enabled: settings.attendanceWindowEnabled,
    startTime: settings.attendanceWindowStart,
    endTime: settings.attendanceWindowEnd,
    label: `${startLabel} WIB - ${endLabel} WIB`,
    todayKey,
    isHolidayToday,
    hasWindowStarted: true,
    hasWindowEnded: false,
    canCheckInNow: settings.attendanceWindowEnabled && !isHolidayToday,
    message: isHolidayToday
      ? "Hari ini ditandai sebagai libur, absensi tidak diperlukan."
      : `Absensi dibuka sampai jam ${endLabel} WIB.`,
  };
}

async function installMockRoutes(page: Page, state: MockState) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: state.viewer,
      }),
    });
  });

  await page.route("**/api/businesses*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: String(state.viewer.businessId),
            name: state.viewer.businessName,
            location: "Jakarta",
          },
        ],
      }),
    });
  });

  await page.route("**/api/staff", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          owner: {
            id: OWNER_VIEWER.userId,
            name: OWNER_VIEWER.name,
          },
          members: [
            {
              userId: STAFF_VIEWER.userId,
              name: STAFF_VIEWER.name,
              role: "Staff",
              businessId: STAFF_VIEWER.businessId,
            },
          ],
        },
      }),
    });
  });

  await page.route("**/api/categories", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: 1,
            name: "Cookies",
            _count: { products: 3 },
          },
        ],
      }),
    });
  });

  await page.route("**/api/bakery/settings", async (route) => {
    const request = route.request();

    if (request.method() === "PATCH") {
      const body = request.postDataJSON() as Partial<MockSettings>;
      const nextSettings: MockSettings = {
        ...state.settings,
        ...body,
      };

      if (body.staffSettings) {
        nextSettings.staffSettings = body.staffSettings as MockSettings["staffSettings"];
      }
      if (body.monthlyExpenses) {
        nextSettings.monthlyExpenses =
          body.monthlyExpenses as MockSettings["monthlyExpenses"];
      }
      if (body.productionStageProfiles) {
        nextSettings.productionStageProfiles =
          body.productionStageProfiles as MockSettings["productionStageProfiles"];
      }
      if (body.attendanceReconciliation) {
        nextSettings.attendanceReconciliation =
          body.attendanceReconciliation as MockSettings["attendanceReconciliation"];
      }
      if (body.holidayEntries) {
        nextSettings.holidayEntries =
          body.holidayEntries as MockSettings["holidayEntries"];
        nextSettings.blockedDates = nextSettings.holidayEntries.map(
          (entry) => entry.date,
        );
      }

      state.settings = nextSettings;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: state.settings,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: state.settings,
      }),
    });
  });

  await page.route("**/api/products?mode=financial&limit=999", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: 1,
            name: "Cookies Premium",
            cogs: 20000,
          },
        ],
      }),
    });
  });

  await page.route("**/api/bookings/capacity**", async (route) => {
    const url = new URL(route.request().url());
    const startDate = url.searchParams.get("startDate") || "2026-07-01";
    const endDate = url.searchParams.get("endDate") || "2026-07-31";
    const capacities: Array<{ date: string; usedToken: number; maxToken: number }> = [];

    for (let day = Number(startDate.slice(8, 10)); day <= Number(endDate.slice(8, 10)); day += 1) {
      capacities.push({
        date: `2026-07-${String(day).padStart(2, "0")}`,
        usedToken: 0,
        maxToken: state.settings.dailyProductionTokenLimit,
      });
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          defaultMaxToken: state.settings.dailyProductionTokenLimit,
          capacities,
        },
      }),
    });
  });

  await page.route("**/api/bookings/orders**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          orders: state.orders,
          source: "mock",
        },
      }),
    });
  });

  await page.route("**/api/bakery/attendance**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    const todayKey = "2026-07-16";
    const attendanceWindow = buildAttendanceWindow(state.settings, todayKey);

    if (state.viewer.role === "Owner" || state.viewer.role === "Admin") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            mode: "owner",
            attendanceWindow,
            team: [],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          attendanceCount: 0,
          expectedAttendanceDays: 1,
          lateCount: 0,
          systemLateCount: 0,
          manualLateCount: 0,
          isManualOverride: false,
          missingDates: [],
          attendanceWindow,
          records: [],
          todayRecord: null,
        },
      }),
    });
  });
}

test.describe("Bakery settings smoke regression", () => {
  test.setTimeout(120_000);

  test("owner can save settings and downstream pages consume the updated values", async ({
    page,
  }) => {
    test.skip(
      !OWNER_TEST_EMAIL || !OWNER_TEST_PASSWORD,
      "Set BAKERY_OWNER_E2E_EMAIL and BAKERY_OWNER_E2E_PASSWORD to run owner-only bakery settings smoke.",
    );

    const state = createDefaultState(OWNER_VIEWER);

    await freezeBrowserClock(page, "2026-07-16T16:30:00+07:00");
    await installMockRoutes(page, state);
    await loginToDashboard(page, {
      email: OWNER_TEST_EMAIL,
      password: OWNER_TEST_PASSWORD,
    });

    await page.goto("/dashboard/business/bakery-settings", {
      waitUntil: "networkidle",
    });
    await page.waitForURL("**/dashboard/business/bakery-settings");
    await expect(page.getByText("Bakery Settings")).toBeVisible();

    await page.getByTestId("staff-token-input-44").fill("111");
    await page.getByTestId("attendance-window-start-input").fill("08:00");
    await page.getByTestId("attendance-window-end-input").fill("09:30");
    await page.getByTestId("cutoff-hour-select").selectOption("15");
    await page.getByTestId("default-dp-input").fill("35");
    await page.getByTestId("daily-production-token-input").fill("700");
    await page.getByTestId("staff-default-token-input").fill("111");

    const notifyWaCheckbox = page.getByTestId(
      "notify-production-whatsapp-checkbox",
    );
    await notifyWaCheckbox.uncheck();

    await page
      .getByTestId("production-stage-category-select")
      .selectOption("Cookies");
    await page.getByTestId("production-stage-label-lining").fill("Prep Adonan");
    await page.getByTestId("production-stage-label-filling").fill("Isi Detail");
    await page
      .getByTestId("production-stage-label-finishing")
      .fill("Finishing Premium");

    await page.getByTestId("monthly-expense-amount-2026-07-ads").fill("500000");
    await page
      .getByTestId("monthly-expense-amount-2026-07-packaging")
      .fill("300000");

    await page.getByTestId("holiday-date-input").fill("2026-07-18");
    await page.getByTestId("holiday-label-input").fill("Libur Nasional");
    await page.getByTestId("add-holiday-button").click();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/bakery/settings") &&
          response.request().method() === "PATCH" &&
          response.ok(),
      ),
      page.getByTestId("save-bakery-settings-button").click(),
    ]);

    expect(state.settings.dailyProductionTokenLimit).toBe(700);
    expect(state.settings.staffDailyTokenLimit).toBe(111);
    expect(state.settings.staffSettings[0]?.dailyTokenLimit).toBe(111);
    expect(state.settings.notifyProductionWhatsapp).toBe(false);
    expect(state.settings.holidayEntries).toEqual([
      { date: "2026-07-18", label: "Libur Nasional", tag: "Hari Raya" },
    ]);
    expect(state.settings.productionStageProfiles[0]?.stages[0]?.label).toBe(
      "Prep Adonan",
    );

    await page.goto("/dashboard/business", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Biaya Iklan")).toBeVisible();
    await expect(page.getByText("-Rp500.000")).toBeVisible();
    await expect(page.getByText("Packaging Tambahan")).toBeVisible();
    await expect(page.getByText("-Rp300.000")).toBeVisible();

    await page.goto("/bakery/reports", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Total biaya sudah termasuk payroll dan biaya operasional bulanan."),
    ).toBeVisible();

    await page.goto("/bakery/production", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Prep Adonan")).toBeVisible();
    await expect(page.getByText("Isi Detail")).toBeVisible();
    await expect(page.getByText("Finishing Premium")).toBeVisible();

    await page.goto("/bakery/calendar", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Kapasitas 700 tok/hari")).toBeVisible();
    await page.locator(".rbc-month-view").getByRole("button", { name: "17" }).click();
    await expect(
      page.getByText("Closed (H-1), cutoff jam 15:00 sudah lewat"),
    ).toBeVisible();
    await page.locator(".rbc-month-view").getByRole("button", { name: "18" }).click();
    await expect(page.getByText("Tanggal libur admin")).toBeVisible();
  });

  test("staff-facing pages reflect attendance window and token limit from bakery settings", async ({
    page,
  }) => {
    const state = createDefaultState(STAFF_VIEWER);
    state.settings.staffDailyTokenLimit = 111;
    state.settings.staffSettings[0].dailyTokenLimit = 111;
    state.settings.attendanceWindowStart = "08:00";
    state.settings.attendanceWindowEnd = "09:30";

    await freezeBrowserClock(page, "2026-07-16T08:30:00+07:00");
    await installMockRoutes(page, state);
    await loginToDashboard(page);

    await page.goto("/bakery/attendance", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Window: 08.00 WIB - 09.30 WIB"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Absen Masuk" })).toBeVisible();

    await page.goto("/bakery/production", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("0 / 111 token")).toBeVisible();
  });
});
