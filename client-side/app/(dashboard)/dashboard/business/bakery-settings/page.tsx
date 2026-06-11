"use client";

import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Search, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { useRole } from "@/context/RoleContext";
import {
  BAKERY_SETTINGS_UPDATED_EVENT,
  invalidateBakerySettingsCache,
  useBakerySettings,
} from "@/hooks/useBakerySettings";
import type {
  BakeryHolidaySetting,
  BakeryOperationalExpenseSetting,
  BakeryStaffSetting,
  BakeryAttendanceReconciliation,
} from "@/lib/bakery/settings";
import type { ProductionStageCategoryProfile } from "@/lib/bookings/production-stages";
import {
  getDefaultProductionStageTemplates,
  PRODUCTION_STAGE_ORDER,
} from "@/lib/bookings/production-stages";
import {
  buildMainProductCategoryOptions,
  normalizeMainCategoryKey,
  resolveMainProductCategory,
} from "@/lib/products/main-category";
import AttendanceReconciliation from "./AttendanceReconciliation";

type StaffApiResponse = {
  data?: {
    owner?: {
      id: number;
      name: string;
    } | null;
    members?: Array<{
      userId: number;
      name: string;
      role: string;
      businessId: number;
    }>;
  };
};

type ProductCategoriesApiResponse = {
  data?: Array<{
    id: number;
    name: string;
    _count?: {
      products?: number;
    };
  }>;
};

type EditableExpense = BakeryOperationalExpenseSetting;
type EditableHoliday = BakeryHolidaySetting;
type EditableStaff = BakeryStaffSetting;
type EditableProductionStageProfile = ProductionStageCategoryProfile;
type StaffRoleFilter = "Semua" | "Admin" | "Cashier" | "Staff";
type ProductionCategoryOption = {
  value: string;
  label: string;
  productCount: number;
  source: "product" | "legacy";
};

function formatMoneyInput(value: number) {
  return String(Math.max(0, Math.round(Number(value || 0))));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Math.round(Number(value || 0)));
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function toTakeHome(monthlySalary: number, mealAllowance: number) {
  return Math.max(
    0,
    Math.round(Number(monthlySalary || 0) + Number(mealAllowance || 0)),
  );
}

function timeStringToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function defaultMonthlyExpenses(monthKey: string): EditableExpense[] {
  return [
    {
      id: `${monthKey}-ads`,
      monthKey,
      name: "Biaya Iklan",
      amount: 0,
      category: "ads",
      note: "Meta Ads / konten / campaign",
    },
    {
      id: `${monthKey}-packaging`,
      monthKey,
      name: "Packaging Tambahan",
      amount: 0,
      category: "custom",
      note: "Tambahan pita, box, custom insert",
    },
  ];
}

function mergeMonthlyExpensesForMonth(args: {
  allExpenses: EditableExpense[];
  monthKey: string;
  monthExpenses: EditableExpense[];
}) {
  const nextMonthExpenses = args.monthExpenses.map((entry) => ({
    ...entry,
    monthKey: args.monthKey,
  }));

  return [
    ...args.allExpenses.filter((entry) => entry.monthKey !== args.monthKey),
    ...nextMonthExpenses,
  ];
}

function mergeStaffSettings(
  members: Array<{ userId: number; name: string; role: string }>,
  saved: BakeryStaffSetting[],
  defaultDailyTokenLimit: number,
): EditableStaff[] {
  const map = new Map<number, EditableStaff>();

  saved.forEach((entry) => {
    map.set(entry.userId, { ...entry });
  });

  members.forEach((member) => {
    const current = map.get(member.userId);
    map.set(member.userId, {
      userId: member.userId,
      name: member.name,
      role: member.role,
      dailyTokenLimit: current?.dailyTokenLimit ?? defaultDailyTokenLimit,
      monthlySalary: current?.monthlySalary ?? 0,
      mealAllowance: current?.mealAllowance ?? 0,
      takeHomePay: current?.takeHomePay ?? 0,
      isActive: current?.isActive ?? true,
    });
  });

  return Array.from(map.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "id"),
  );
}

function getRoleTone(role: string) {
  if (role === "Admin") return "bg-[#ffe4cf] text-[#ae5d2d]";
  if (role === "Cashier") return "bg-[#e7eefc] text-[#405c9c]";
  return "bg-[#e3f3e8] text-[#2d7850]";
}

function getRoleEmoji(role: string) {
  if (role === "Admin") return "🧾";
  if (role === "Cashier") return "💵";
  return "🧑‍🍳";
}

function getHolidayBadge(entry: EditableHoliday) {
  if ((entry.label || "").trim().length > 0) return "Hari Raya";
  return entry.tag || "Libur";
}

function createDefaultStageProfile(
  category = "",
): EditableProductionStageProfile {
  return {
    category,
    stages: getDefaultProductionStageTemplates(),
  };
}

function syncProductionStageProfilesWithCategories(args: {
  categoryNames: string[];
  currentProfiles: EditableProductionStageProfile[];
}): EditableProductionStageProfile[] {
  const canonicalNamesByKey = new Map<string, string>();
  args.categoryNames.forEach((name) => {
    const trimmed = resolveMainProductCategory(name.trim()) || name.trim();
    const key = normalizeMainCategoryKey(trimmed);
    if (!key || canonicalNamesByKey.has(key)) return;
    canonicalNamesByKey.set(key, trimmed);
  });

  const currentProfilesByKey = new Map<
    string,
    EditableProductionStageProfile
  >();
  args.currentProfiles.forEach((profile) => {
    const normalizedCategory =
      resolveMainProductCategory(profile.category.trim()) ||
      profile.category.trim();
    const key = normalizeMainCategoryKey(normalizedCategory);
    if (!key) return;
    if (!currentProfilesByKey.has(key)) {
      currentProfilesByKey.set(key, {
        category: normalizedCategory,
        stages: profile.stages.map((stage) => ({ ...stage })),
      });
    }
  });

  const mergedProfiles: EditableProductionStageProfile[] = [];

  canonicalNamesByKey.forEach((canonicalName, key) => {
    const currentProfile = currentProfilesByKey.get(key);
    mergedProfiles.push(
      currentProfile
        ? {
            category: canonicalName,
            stages: currentProfile.stages.map((stage) => ({ ...stage })),
          }
        : createDefaultStageProfile(canonicalName),
    );
    currentProfilesByKey.delete(key);
  });

  const legacyProfiles = Array.from(currentProfilesByKey.values()).sort(
    (left, right) => left.category.localeCompare(right.category, "id"),
  );

  return [...mergedProfiles, ...legacyProfiles];
}

function serializeProductionStageProfiles(
  profiles: EditableProductionStageProfile[],
) {
  return JSON.stringify(
    profiles.map((profile) => ({
      category: profile.category.trim(),
      stages: profile.stages.map((stage) => ({
        stage: stage.stage,
        label: stage.label.trim(),
        percentage: Number(stage.percentage || 0),
      })),
    })),
  );
}

export default function BakerySettingsPage() {
  const { settings, isLoading } = useBakerySettings();
  const { isOwner, loading: roleLoading } = useRole();
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingProductionStages, setIsSavingProductionStages] =
    useState(false);
  const [
    productionStageProfilesSavedSnapshot,
    setProductionStageProfilesSavedSnapshot,
  ] = useState("[]");
  const [productionStageSaveMessage, setProductionStageSaveMessage] =
    useState("");
  const [staffOptions, setStaffOptions] = useState<
    Array<{ userId: number; name: string; role: string }>
  >([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffRoleFilter, setStaffRoleFilter] =
    useState<StaffRoleFilter>("Semua");

  const currentMonthKey = useMemo(() => getMonthKey(new Date()), []);

  const [dailyProductionTokenLimit, setDailyProductionTokenLimit] =
    useState(500);
  const [staffDailyTokenLimit, setStaffDailyTokenLimit] = useState(500);
  const [cutoffHour, setCutoffHour] = useState(10);
  const [cutoffEnabled, setCutoffEnabled] = useState(true);
  const [attendanceWindowEnabled, setAttendanceWindowEnabled] = useState(true);
  const [attendanceWindowStart, setAttendanceWindowStart] = useState("06:00");
  const [attendanceWindowEnd, setAttendanceWindowEnd] = useState("07:00");
  const [defaultDpPercentage, setDefaultDpPercentage] = useState(50);
  const [notifyProductionWhatsapp, setNotifyProductionWhatsapp] =
    useState(true);
  const [staffSettings, setStaffSettings] = useState<EditableStaff[]>([]);
  const [monthlyExpenses, setMonthlyExpenses] = useState<EditableExpense[]>(
    defaultMonthlyExpenses(currentMonthKey),
  );
  const [holidayEntries, setHolidayEntries] = useState<EditableHoliday[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayLabel, setNewHolidayLabel] = useState("");
  const [productCategoryOptions, setProductCategoryOptions] = useState<
    ProductionCategoryOption[]
  >([]);
  const [
    hasInitializedProductionStageProfiles,
    setHasInitializedProductionStageProfiles,
  ] = useState(false);
  const [productionStageProfiles, setProductionStageProfiles] = useState<
    EditableProductionStageProfile[]
  >([]);
  const [selectedProductionStageCategory, setSelectedProductionStageCategory] =
    useState("");
  const [attendanceReconciliation, setAttendanceReconciliation] = useState<
    BakeryAttendanceReconciliation[]
  >([]);

  useEffect(() => {
    let active = true;

    const loadStaff = async () => {
      try {
        const response = await fetch("/api/staff", { cache: "no-store" });
        const payload = (await response
          .json()
          .catch(() => ({}))) as StaffApiResponse;
        if (!response.ok || !active) return;

        const members = (payload.data?.members ?? [])
          .filter((member) =>
            ["Admin", "Cashier", "Staff"].includes(member.role),
          )
          .map((member) => ({
            userId: member.userId,
            name: member.name,
            role: member.role,
          }));

        setStaffOptions(members);
      } catch {
        // Staff page remains optional here.
      }
    };

    void loadStaff();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadProductCategories = async () => {
      try {
        const response = await fetch("/api/categories", { cache: "no-store" });
        const payload = (await response
          .json()
          .catch(() => ({}))) as ProductCategoriesApiResponse;
        if (!response.ok || !active) return;

        const nextOptions = buildMainProductCategoryOptions(
          (payload.data ?? []).map((entry) => ({
            name: entry.name,
            productCount: Number(entry._count?.products ?? 0),
          })),
        ).map((entry) => ({
          ...entry,
          source: "product" as const,
        }));

        setProductCategoryOptions(nextOptions);
      } catch {
        // Category options remain optional; legacy saved profiles still render.
      }
    };

    const handleWindowFocus = () => {
      void loadProductCategories();
    };

    void loadProductCategories();
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      active = false;
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    if (!settings) return;

    setDailyProductionTokenLimit(settings.dailyProductionTokenLimit);
    setStaffDailyTokenLimit(settings.staffDailyTokenLimit);
    setCutoffHour(settings.cutoffHour);
    setCutoffEnabled(settings.cutoffEnabled);
    setAttendanceWindowEnabled(settings.attendanceWindowEnabled);
    setAttendanceWindowStart(settings.attendanceWindowStart);
    setAttendanceWindowEnd(settings.attendanceWindowEnd);
    setDefaultDpPercentage(settings.defaultDpPercentage);
    setNotifyProductionWhatsapp(settings.notifyProductionWhatsapp);
    setHolidayEntries(settings.holidayEntries);
    setProductionStageProfiles(settings.productionStageProfiles);
    setProductionStageProfilesSavedSnapshot(
      serializeProductionStageProfiles(settings.productionStageProfiles),
    );
    setProductionStageSaveMessage("");
    setHasInitializedProductionStageProfiles(true);

    const monthExpenses = settings.monthlyExpenses.filter(
      (entry) =>
        entry.monthKey === currentMonthKey &&
        String(entry.category) !== "refund",
    );
    setMonthlyExpenses(
      monthExpenses.length > 0
        ? monthExpenses
        : defaultMonthlyExpenses(currentMonthKey),
    );
  }, [settings, currentMonthKey]);

  useEffect(() => {
    if (!settings) return;
    setStaffSettings(
      mergeStaffSettings(
        staffOptions,
        settings.staffSettings,
        settings.staffDailyTokenLimit,
      ),
    );
    setAttendanceReconciliation(settings.attendanceReconciliation || []);
  }, [settings, staffOptions]);

  useEffect(() => {
    if (
      !hasInitializedProductionStageProfiles ||
      productCategoryOptions.length === 0
    ) {
      return;
    }
    setProductionStageProfiles((current) =>
      syncProductionStageProfilesWithCategories({
        categoryNames: productCategoryOptions.map((entry) => entry.label),
        currentProfiles: current,
      }),
    );
  }, [hasInitializedProductionStageProfiles, productCategoryOptions]);

  const totalMonthlyPayroll = useMemo(
    () =>
      staffSettings
        .filter((entry) => entry.isActive)
        .reduce((sum, entry) => sum + Number(entry.takeHomePay || 0), 0),
    [staffSettings],
  );

  const filteredStaffSettings = useMemo(() => {
    const keyword = staffSearch.trim().toLowerCase();
    return staffSettings.filter((entry) => {
      const matchRole =
        staffRoleFilter === "Semua" || entry.role === staffRoleFilter;
      const matchKeyword =
        keyword.length === 0 ||
        entry.name.toLowerCase().includes(keyword) ||
        entry.role.toLowerCase().includes(keyword);
      return matchRole && matchKeyword;
    });
  }, [staffRoleFilter, staffSearch, staffSettings]);

  const availableProductionCategoryOptions = useMemo(() => {
    const deduped = new Map<string, ProductionCategoryOption>();

    productCategoryOptions.forEach((entry) => {
      const key = normalizeMainCategoryKey(entry.label);
      if (!key) return;
      deduped.set(key, entry);
    });

    productionStageProfiles.forEach((profile) => {
      const key = normalizeMainCategoryKey(profile.category);
      if (!key || deduped.has(key)) return;
      deduped.set(key, {
        value: profile.category,
        label: profile.category,
        productCount: 0,
        source: "legacy",
      });
    });

    return Array.from(deduped.values()).sort((left, right) =>
      left.label.localeCompare(right.label, "id"),
    );
  }, [productCategoryOptions, productionStageProfiles]);

  const selectedProductionStageProfileIndex = useMemo(() => {
    const selectedKey = normalizeMainCategoryKey(
      selectedProductionStageCategory,
    );
    if (!selectedKey) return -1;
    return productionStageProfiles.findIndex(
      (profile) => normalizeMainCategoryKey(profile.category) === selectedKey,
    );
  }, [productionStageProfiles, selectedProductionStageCategory]);

  const selectedProductionStageProfile =
    selectedProductionStageProfileIndex >= 0
      ? productionStageProfiles[selectedProductionStageProfileIndex]
      : null;

  const isProductionStageDirty = useMemo(
    () =>
      serializeProductionStageProfiles(productionStageProfiles) !==
      productionStageProfilesSavedSnapshot,
    [productionStageProfiles, productionStageProfilesSavedSnapshot],
  );

  useEffect(() => {
    if (availableProductionCategoryOptions.length === 0) {
      if (selectedProductionStageCategory) {
        setSelectedProductionStageCategory("");
      }
      return;
    }

    const selectedKey = normalizeMainCategoryKey(
      selectedProductionStageCategory,
    );
    const stillExists = availableProductionCategoryOptions.some(
      (entry) => normalizeMainCategoryKey(entry.label) === selectedKey,
    );

    if (!stillExists) {
      setSelectedProductionStageCategory(
        availableProductionCategoryOptions[0]?.label ?? "",
      );
    }
  }, [availableProductionCategoryOptions, selectedProductionStageCategory]);

  const currentMonthExpenseLabel = getMonthLabel(currentMonthKey);
  const currentMonthHolidayCount = holidayEntries.length;

  const updateStaffSetting = (
    userId: number,
    patch: Partial<EditableStaff>,
  ) => {
    setStaffSettings((current) =>
      current.map((entry) => {
        if (entry.userId !== userId) return entry;
        const next = { ...entry, ...patch };
        next.takeHomePay = toTakeHome(next.monthlySalary, next.mealAllowance);
        return next;
      }),
    );
  };

  const updateExpense = (id: string, patch: Partial<EditableExpense>) => {
    setMonthlyExpenses((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const addCustomExpense = () => {
    const nextId = `${currentMonthKey}-custom-${Date.now()}`;
    setMonthlyExpenses((current) => [
      ...current,
      {
        id: nextId,
        monthKey: currentMonthKey,
        name: "Biaya Custom",
        amount: 0,
        category: "custom",
        note: "Nama biaya bisa diganti langsung",
      },
    ]);
  };

  const removeExpense = (id: string) => {
    setMonthlyExpenses((current) => {
      if (current.length <= 1) return current;
      return current.filter((entry) => entry.id !== id);
    });
  };

  const addHoliday = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newHolidayDate.trim())) {
      toast.error("Pilih tanggal libur yang valid.");
      return;
    }

    setHolidayEntries((current) => {
      const deduped = new Map(current.map((entry) => [entry.date, entry]));
      deduped.set(newHolidayDate.trim(), {
        date: newHolidayDate.trim(),
        label: newHolidayLabel.trim(),
        tag: newHolidayLabel.trim() ? "Hari Raya" : "Libur",
      });
      return Array.from(deduped.values()).sort((left, right) =>
        left.date.localeCompare(right.date),
      );
    });
    setNewHolidayDate("");
    setNewHolidayLabel("");
    toast.success("Tanggal libur ditambahkan ke draft pengaturan.");
  };

  const removeHoliday = (date: string) => {
    setHolidayEntries((current) =>
      current.filter((entry) => entry.date !== date),
    );
    toast.success("Tanggal libur dihapus dari draft pengaturan.");
  };

  const updateProductionStageRow = (
    profileIndex: number,
    stageKey: (typeof PRODUCTION_STAGE_ORDER)[number],
    patch: { label?: string; percentage?: number },
  ) => {
    setProductionStageProfiles((current) =>
      current.map((entry, index) => {
        if (index !== profileIndex) return entry;
        return {
          ...entry,
          stages: entry.stages.map((stage) =>
            stage.stage === stageKey
              ? {
                  ...stage,
                  ...patch,
                  percentage:
                    patch.percentage !== undefined
                      ? Math.max(0, Math.min(100, Math.round(patch.percentage)))
                      : stage.percentage,
                }
              : stage,
          ),
        };
      }),
    );
  };

  const validateProductionStageProfiles = (
    profiles: EditableProductionStageProfile[],
  ) => {
    for (const profile of profiles) {
      if (!profile.category.trim()) {
        return "Kategori besar pada profile proses produksi wajib diisi.";
      }
      const total = profile.stages.reduce(
        (sum, stage) => sum + Number(stage.percentage || 0),
        0,
      );
      if (total !== 100) {
        return `Total persentase proses untuk kategori ${profile.category} harus tepat 100%.`;
      }
    }

    return null;
  };

  const saveBakerySettings = async (input: Record<string, unknown>) => {
    const response = await fetch("/api/bakery/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      data?: {
        productionStageProfiles?: EditableProductionStageProfile[];
      };
    };

    if (!response.ok) {
      throw new Error(payload.error || "Gagal menyimpan bakery settings");
    }

    invalidateBakerySettingsCache();

    if (payload.data?.productionStageProfiles) {
      setProductionStageProfiles(payload.data.productionStageProfiles);
      setProductionStageProfilesSavedSnapshot(
        serializeProductionStageProfiles(payload.data.productionStageProfiles),
      );
    }

    window.dispatchEvent(new Event(BAKERY_SETTINGS_UPDATED_EVENT));

    return payload;
  };

  const handleSave = async () => {
    if (!isOwner) {
      toast.error("Hanya owner yang dapat menyimpan pengaturan.");
      return;
    }

    const productionStageValidationError = validateProductionStageProfiles(
      productionStageProfiles,
    );
    if (productionStageValidationError) {
      toast.error(productionStageValidationError);
      return;
    }
    if (
      attendanceWindowEnabled &&
      timeStringToMinutes(attendanceWindowEnd) <=
        timeStringToMinutes(attendanceWindowStart)
    ) {
      toast.error("Jam akhir absen harus lebih besar dari jam mulai.");
      return;
    }

    setIsSaving(true);
    try {
      const mergedMonthlyExpenses = mergeMonthlyExpensesForMonth({
        allExpenses: (settings?.monthlyExpenses ?? []).filter(
          (entry) => String(entry.category) !== "refund",
        ),
        monthKey: currentMonthKey,
        monthExpenses: monthlyExpenses,
      });

      await saveBakerySettings({
        dailyProductionTokenLimit,
        staffDailyTokenLimit,
        cutoffHour,
        cutoffEnabled,
        attendanceWindowEnabled,
        attendanceWindowStart,
        attendanceWindowEnd,
        defaultDpPercentage,
        notifyProductionWhatsapp,
        holidayEntries,
        staffSettings: staffSettings.map((entry) => ({
          ...entry,
          takeHomePay: toTakeHome(entry.monthlySalary, entry.mealAllowance),
        })),
        monthlyExpenses: mergedMonthlyExpenses,
        attendanceReconciliation,
        productionStageProfiles,
      });
      setProductionStageSaveMessage(
        "Proses produksi terakhir sudah tersimpan.",
      );
      toast.success(
        "Pengaturan bakery berhasil disimpan dan langsung diperbarui.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan bakery settings",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProductionStages = async () => {
    if (!isOwner) {
      toast.error("Hanya owner yang dapat menyimpan pengaturan.");
      return;
    }

    const productionStageValidationError = validateProductionStageProfiles(
      productionStageProfiles,
    );
    if (productionStageValidationError) {
      toast.error(productionStageValidationError);
      return;
    }

    setIsSavingProductionStages(true);
    try {
      await saveBakerySettings({
        productionStageProfiles,
      });
      setProductionStageSaveMessage(
        "Perubahan proses produksi sudah tersimpan dan tidak akan kembali ke versi sebelumnya.",
      );
      toast.success("Proses produksi per kategori berhasil disimpan.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan proses produksi",
      );
    } finally {
      setIsSavingProductionStages(false);
    }
  };

  if (isLoading || roleLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-[28px] border border-[#dccbbb] bg-[#f6ede2] px-5 py-10 text-sm text-[#8a6047] shadow-[0_20px_40px_-32px_rgba(52,31,20,0.35)]">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat pengaturan bakery...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10 text-[#2f1e13]">
      <GradientPageHeader
        title="Bakery Settings"
        description="Pengaturan operasional owner untuk staff, order, dan biaya bulanan."
        icon={Settings2}
      >
        <div className="mt-2 inline-flex rounded-full border border-[#ebd2bf] bg-[#fff5ea] px-3 py-1.5 text-[11px] font-semibold text-[#b15d2f]">
          Sinkron ke booking, calendar, dan business
        </div>
      </GradientPageHeader>

      <div className="space-y-5 rounded-[34px] border border-[#e4d2c4] bg-[#f8efe5] px-4 pb-6 pt-4 shadow-[0_26px_55px_-42px_rgba(94,53,30,0.6)] sm:px-5 xl:px-6">

        {!isOwner ? (
          <div className="rounded-[22px] border border-[#e9cbb6] bg-[#f9e8dc] px-4 py-3 text-sm text-[#a45731]">
            🔒 Halaman ini hanya bisa diubah oleh owner. Role lain hanya dapat
            melihat data.
          </div>
        ) : null}

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <section className="h-full overflow-hidden rounded-[24px] border border-[#ddcbbb] bg-[#f4e9dc] shadow-[0_16px_30px_-26px_rgba(52,31,20,0.35)]">
            <div className="flex items-center justify-between border-b border-[#e8d6c8] px-4 py-3">
              <div>
                <h2 className="text-lg font-bold">👥 Token & Gaji per Staff</h2>
                <p className="text-xs text-[#b58872]">
                  Reminder payroll owner untuk admin, kasir, dan staff.
                </p>
              </div>
              <NextLink
                href="/dashboard/staff"
                className="inline-flex items-center gap-1 rounded-full border border-[#cb6837] bg-[#cb6837] px-3 py-1.5 text-xs font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah
              </NextLink>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="grid gap-3">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b58872]" />
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={(event) => setStaffSearch(event.target.value)}
                    placeholder="Cari nama pegawai atau role..."
                    className="h-11 w-full rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] pl-10 pr-3 text-sm outline-none"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    ["Semua", "Admin", "Cashier", "Staff"] as StaffRoleFilter[]
                  ).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setStaffRoleFilter(role)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        staffRoleFilter === role
                          ? "bg-[#cb6837] text-white"
                          : "border border-[#dcc7b8] bg-[#fbf4ed] text-[#8a6047]"
                      }`}
                    >
                      {role === "Semua" ? "✨ Semua" : role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-[18px] border border-[#e2d1c3] bg-[#fbf4ed] px-4 py-3">
                <div>
                  <p className="text-sm font-bold">
                    📦 {filteredStaffSettings.length} pegawai tampil
                  </p>
                  <p className="text-xs text-[#b58872]">
                    Filter aktif untuk payroll dan batas token harian.
                  </p>
                </div>
                <div className="rounded-full bg-[#fff0df] px-3 py-1 text-xs font-semibold text-[#b15d2f]">
                  {formatCurrency(totalMonthlyPayroll)}
                </div>
              </div>

              <div className="space-y-3">
                {filteredStaffSettings.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-[#dcc7b8] px-4 py-6 text-center text-sm text-[#8a6047]">
                    🔎 Tidak ada pegawai yang cocok dengan filter ini.
                  </div>
                ) : (
                  filteredStaffSettings.map((entry) => (
                    <div
                      key={entry.userId}
                      className="rounded-[20px] border border-[#e2d1c3] bg-[#f8efe6] px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-base font-bold text-[#2f1e13]">
                              {entry.name}
                            </p>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getRoleTone(entry.role)}`}
                            >
                              {getRoleEmoji(entry.role)} {entry.role}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#b58872]">
                            {entry.isActive
                              ? "Kontrak aktif"
                              : "Pegawai nonaktif"}
                          </p>
                        </div>
                        <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-[#8a6047]">
                          <input
                            type="checkbox"
                            checked={entry.isActive}
                            disabled={!isOwner}
                            onChange={(event) =>
                              updateStaffSetting(entry.userId, {
                                isActive: event.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-[#cfb8a5]"
                          />
                          Aktif
                        </label>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-[11px] font-semibold uppercase text-[#b58872]">
                          Token/Hari
                          <input
                            type="number"
                            min={1}
                            max={10000}
                            value={entry.dailyTokenLimit}
                            disabled={!isOwner}
                            onChange={(event) =>
                              updateStaffSetting(entry.userId, {
                                dailyTokenLimit: Number(
                                  event.target.value || 0,
                                ),
                              })
                            }
                            className="h-11 w-full min-w-0 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm font-semibold text-[#2f1e13] outline-none"
                          />
                        </label>
                        <label className="grid gap-1 text-[11px] font-semibold uppercase text-[#b58872]">
                          Gaji/Bulan
                          <input
                            type="number"
                            min={0}
                            value={entry.monthlySalary}
                            disabled={!isOwner}
                            onChange={(event) =>
                              updateStaffSetting(entry.userId, {
                                monthlySalary: Number(event.target.value || 0),
                              })
                            }
                            className="h-11 w-full min-w-0 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm font-semibold text-[#2f1e13] outline-none"
                          />
                        </label>
                        <label className="grid gap-1 text-[11px] font-semibold uppercase text-[#b58872]">
                          Tunjangan Makan
                          <input
                            type="number"
                            min={0}
                            value={entry.mealAllowance}
                            disabled={!isOwner}
                            onChange={(event) =>
                              updateStaffSetting(entry.userId, {
                                mealAllowance: Number(event.target.value || 0),
                              })
                            }
                            className="h-11 w-full min-w-0 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm font-semibold text-[#2f1e13] outline-none"
                          />
                        </label>
                        <label className="grid gap-1 text-[11px] font-semibold uppercase text-[#7aaa90]">
                          Take-Home
                          <input
                            type="text"
                            readOnly
                            value={formatMoneyInput(entry.takeHomePay)}
                            className="h-11 w-full min-w-0 rounded-2xl border border-[#bfe0d0] bg-[#dbefe4] px-3 text-sm font-bold text-[#1e6b42] outline-none"
                          />
                        </label>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between rounded-[20px] border border-[#efcfb3] bg-[#fff0df] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[#9f5129]">
                    💰 Total Gaji Bulan Ini
                  </p>
                  <p className="text-xs text-[#c07c54]">
                    Akumulasi pegawai aktif yang tampil.
                  </p>
                </div>
                <span className="font-mono text-lg font-extrabold text-[#9f5129]">
                  {formatCurrency(totalMonthlyPayroll)}
                </span>
              </div>
            </div>
          </section>

          <section className="h-full overflow-hidden rounded-[24px] border border-[#ddcbbb] bg-[#f4e9dc] shadow-[0_16px_30px_-26px_rgba(52,31,20,0.35)]">
            <div className="border-b border-[#e8d6c8] px-4 py-3">
              <h2 className="text-lg font-bold">⚙️ Pengaturan Operasional</h2>
              <p className="text-xs text-[#b58872]">
                Cut-off H-1, DP default, token harian, dan blast WA produksi.
              </p>
            </div>
            <div className="space-y-4 px-4 py-4">
              <label className="flex items-center justify-between gap-4 rounded-[20px] border border-[#dcc7b8] bg-[#fbf4ed] px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#2f1e13]">
                      Absensi Otomatis
                    </p>
                    <span
                      className={`inline-flex min-w-[44px] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] ${
                        attendanceWindowEnabled
                          ? "bg-[#f7d8bf] text-[#b35b2a]"
                          : "bg-[#e7ddd4] text-[#8b6d5b]"
                      }`}
                    >
                      {attendanceWindowEnabled ? "ON" : "OFF"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#b58872]">
                    ON: staff/admin hanya bisa absen di jam yang owner tentukan.
                    Jika lewat jam akhir dan belum check-in, reports otomatis
                    menambah 1x telat.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={attendanceWindowEnabled}
                  disabled={!isOwner}
                  onClick={() =>
                    setAttendanceWindowEnabled((current) => !current)
                  }
                  className={`relative inline-flex h-[34px] w-[62px] shrink-0 items-center rounded-full border transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cb6837]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf4ed] disabled:cursor-not-allowed disabled:opacity-50 ${
                    attendanceWindowEnabled
                      ? "border-[#bf6435] bg-linear-to-r from-[#cf7442] to-[#c86131] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_16px_-12px_rgba(156,79,36,0.8)]"
                      : "border-[#d9c6b7] bg-[#e8ddd3] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
                  }`}
                >
                  <span
                    className={`inline-block h-[26px] w-[26px] rounded-full bg-white transition-all duration-200 ease-out ${
                      attendanceWindowEnabled
                        ? "translate-x-[32px] shadow-[0_3px_10px_rgba(110,54,24,0.28)]"
                        : "translate-x-[3px] shadow-[0_2px_8px_rgba(109,83,64,0.18)]"
                    }`}
                  />
                </button>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold text-[#2f1e13]">
                  Jam Mulai Absen
                  <input
                    type="time"
                    value={attendanceWindowStart}
                    disabled={!isOwner}
                    onChange={(event) =>
                      setAttendanceWindowStart(event.target.value)
                    }
                    className="h-11 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm outline-none"
                  />
                  <span className="text-xs font-normal text-[#b58872]">
                    Contoh 06:00.
                  </span>
                </label>
                <label className="grid gap-1 text-sm font-semibold text-[#2f1e13]">
                  Jam Akhir Absen
                  <input
                    type="time"
                    value={attendanceWindowEnd}
                    disabled={!isOwner}
                    onChange={(event) =>
                      setAttendanceWindowEnd(event.target.value)
                    }
                    className="h-11 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm outline-none"
                  />
                  <span className="text-xs font-normal text-[#b58872]">
                    Setelah jam ini, yang belum absen dihitung telat otomatis.
                  </span>
                </label>
              </div>

              <label className="grid gap-1 text-sm font-semibold text-[#2f1e13]">
                ⏰ Cut-off Time Order (H-1)
                <select
                  value={cutoffHour}
                  disabled={!isOwner}
                  onChange={(event) =>
                    setCutoffHour(Number(event.target.value))
                  }
                  className="h-11 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm outline-none"
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, "0")}.00 WIB
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal text-[#b58872]">
                  Order besok hanya bisa masuk sebelum jam ini.
                </span>
              </label>

              <label className="flex items-center justify-between gap-4 rounded-[20px] border border-[#dcc7b8] bg-[#fbf4ed] px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#2f1e13]">
                      Cut-off Order Aktif
                    </p>
                    <span
                      className={`inline-flex min-w-[44px] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] ${
                        cutoffEnabled
                          ? "bg-[#f7d8bf] text-[#b35b2a]"
                          : "bg-[#e7ddd4] text-[#8b6d5b]"
                      }`}
                    >
                      {cutoffEnabled ? "ON" : "OFF"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#b58872]">
                    ON: aturan cut-off H-1 berjalan. OFF: admin dan owner bisa
                    input order lama untuk backfill laporan.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cutoffEnabled}
                  disabled={!isOwner}
                  onClick={() => setCutoffEnabled((current) => !current)}
                  className={`relative inline-flex h-[34px] w-[62px] shrink-0 items-center rounded-full border transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cb6837]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf4ed] disabled:cursor-not-allowed disabled:opacity-50 ${
                    cutoffEnabled
                      ? "border-[#bf6435] bg-linear-to-r from-[#cf7442] to-[#c86131] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_16px_-12px_rgba(156,79,36,0.8)]"
                      : "border-[#d9c6b7] bg-[#e8ddd3] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
                  }`}
                >
                  <span
                    className={`inline-block h-[26px] w-[26px] rounded-full bg-white transition-all duration-200 ease-out ${
                      cutoffEnabled
                        ? "translate-x-[32px] shadow-[0_3px_10px_rgba(110,54,24,0.28)]"
                        : "translate-x-[3px] shadow-[0_2px_8px_rgba(109,83,64,0.18)]"
                    }`}
                  />
                </button>
              </label>

              <label className="grid gap-1 text-sm font-semibold text-[#2f1e13]">
                🪙 Default DP (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={defaultDpPercentage}
                  disabled={!isOwner}
                  onChange={(event) =>
                    setDefaultDpPercentage(Number(event.target.value || 0))
                  }
                  className="h-11 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm outline-none"
                />
                <span className="text-xs font-normal text-[#b58872]">
                  Bisa diubah lagi saat membuat booking tertentu.
                </span>
              </label>

              <label className="flex items-center justify-between rounded-[20px] border border-[#dcc7b8] bg-[#fbf4ed] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[#2f1e13]">
                    📲 Notifikasi WA Produksi
                  </p>
                  <p className="text-xs text-[#b58872]">
                    Blast otomatis ke grup saat order confirmed.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={notifyProductionWhatsapp}
                  disabled={!isOwner}
                  onChange={(event) =>
                    setNotifyProductionWhatsapp(event.target.checked)
                  }
                  className="h-5 w-5 rounded border-[#cfb8a5]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm font-semibold text-[#2f1e13]">
                  🍪 Token Harian Order
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={dailyProductionTokenLimit}
                    disabled={!isOwner}
                    onChange={(event) =>
                      setDailyProductionTokenLimit(
                        Number(event.target.value || 0),
                      )
                    }
                    className="h-11 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm outline-none"
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-[#2f1e13]">
                  👨‍🍳 Default Token Staff
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={staffDailyTokenLimit}
                    disabled={!isOwner}
                    onChange={(event) =>
                      setStaffDailyTokenLimit(Number(event.target.value || 0))
                    }
                    className="h-11 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm outline-none"
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-[24px] border border-[#ddcbbb] bg-[#f4e9dc] shadow-[0_16px_30px_-26px_rgba(52,31,20,0.35)]">
          <div className="border-b border-[#e8d6c8] px-4 py-3">
            <h2 className="text-lg font-bold">
              🧩 Proses Produksi per Kategori
            </h2>
            <p className="text-xs text-[#b58872]">
              Pilih main category produk, lalu edit 3 proses backend-nya tanpa
              risiko typo nama kategori.
            </p>
          </div>
          <div className="space-y-3 px-4 py-4">
            {availableProductionCategoryOptions.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-[#dcc7b8] px-4 py-6 text-center text-sm text-[#8a6047]">
                Belum ada kategori produk yang bisa dipakai. Tambahkan kategori
                di halaman product dulu, lalu kembali ke sini.
              </div>
            ) : (
              <>
                <label className="grid gap-1 text-sm font-semibold text-[#2f1e13]">
                  Main Category Product
                  <select
                    value={selectedProductionStageCategory}
                    onChange={(event) =>
                      setSelectedProductionStageCategory(event.target.value)
                    }
                    className="h-11 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm outline-none"
                  >
                    {availableProductionCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                        {option.productCount > 0
                          ? ` (${option.productCount} produk)`
                          : option.source === "legacy"
                            ? " (profile lama)"
                            : ""}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-normal text-[#b58872]">
                    Option ini mengikuti main category product, jadi subcategory
                    seperti One Tier Cake dan Two Tier Cake tetap masuk ke
                    category Cake yang sama.
                  </span>
                </label>

                {selectedProductionStageProfile &&
                selectedProductionStageProfileIndex >= 0 ? (
                  <div className="rounded-[20px] border border-[#e2d1c3] bg-[#f8efe6] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-[#2f1e13]">
                          {selectedProductionStageProfile.category}
                        </p>
                        <p className="mt-1 text-xs text-[#b58872]">
                          Preview dan edit 3 proses produksi untuk kategori ini.
                        </p>
                      </div>
                      <div className="rounded-full bg-[#fff0df] px-3 py-1 text-xs font-semibold text-[#b15d2f]">
                        3 proses backend tetap aktif
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      {selectedProductionStageProfile.stages.map((stage) => (
                        <div
                          key={`${selectedProductionStageProfile.category}-preview-${stage.stage}`}
                          className="rounded-[18px] border border-[#ead8ca] bg-[#fbf4ed] px-3 py-3"
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#b58872]">
                            {stage.stage}
                          </p>
                          <p className="mt-1 text-sm font-bold text-[#2f1e13]">
                            {stage.label}
                          </p>
                          <p className="mt-1 text-xs text-[#8a6047]">
                            {stage.percentage}% token
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 space-y-3">
                      {selectedProductionStageProfile.stages.map((stage) => (
                        <div
                          key={`${selectedProductionStageProfile.category}-${stage.stage}`}
                          className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]"
                        >
                          <input
                            type="text"
                            value={stage.label}
                            disabled={!isOwner}
                            onChange={(event) =>
                              updateProductionStageRow(
                                selectedProductionStageProfileIndex,
                                stage.stage,
                                {
                                  label: event.target.value,
                                },
                              )
                            }
                            className="h-11 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm font-semibold outline-none"
                          />
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={stage.percentage}
                              disabled={!isOwner}
                              onChange={(event) =>
                                updateProductionStageRow(
                                  selectedProductionStageProfileIndex,
                                  stage.stage,
                                  {
                                    percentage: Number(event.target.value || 0),
                                  },
                                )
                              }
                              className="h-11 w-full rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 pr-10 text-sm font-semibold outline-none"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8a6047]">
                              %
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="mt-3 text-xs text-[#b58872]">
                      Total persentase:{" "}
                      {selectedProductionStageProfile.stages.reduce(
                        (sum, stage) => sum + Number(stage.percentage || 0),
                        0,
                      )}
                      % · Slot stage backend saat ini tetap 3 proses.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p
                        className={`text-xs ${
                          isProductionStageDirty
                            ? "text-[#b15d2f]"
                            : "text-[#5f8a67]"
                        }`}
                      >
                        {isProductionStageDirty
                          ? "Ada perubahan yang belum disimpan."
                          : productionStageSaveMessage ||
                            "Versi proses produksi ini sudah sinkron dengan server."}
                      </p>
                      <button
                        type="button"
                        disabled={
                          !isOwner ||
                          isSavingProductionStages ||
                          !isProductionStageDirty
                        }
                        onClick={handleSaveProductionStages}
                        className="inline-flex items-center gap-2 rounded-full bg-[#cb6837] px-4 py-2 text-xs font-bold text-white shadow-[0_12px_20px_-18px_rgba(200,96,48,0.8)] disabled:opacity-50"
                      >
                        {isSavingProductionStages ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        {isSavingProductionStages
                          ? "Menyimpan..."
                          : isProductionStageDirty
                            ? "Simpan Proses Ini"
                            : "Sudah Tersimpan"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(320px,1.08fr)]">
          <section className="overflow-hidden rounded-[24px] border border-[#ddcbbb] bg-[#f4e9dc] shadow-[0_16px_30px_-26px_rgba(52,31,20,0.35)]">
            <div className="flex items-center justify-between border-b border-[#e8d6c8] px-4 py-3">
              <div>
                <h2 className="text-lg font-bold">
                  🧾 Biaya Operasional Bulanan
                </h2>
                <p className="text-xs text-[#b58872]">
                  {currentMonthExpenseLabel}
                </p>
              </div>
              <button
                type="button"
                disabled={!isOwner}
                onClick={addCustomExpense}
                className="inline-flex items-center gap-1 rounded-full border border-[#cb6837] bg-[#fff0df] px-3 py-1.5 text-xs font-bold text-[#cb6837] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah
              </button>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="grid gap-3 xl:grid-cols-2">
                {monthlyExpenses.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-[20px] border border-[#e2d1c3] bg-[#f8efe6] p-4"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <input
                        type="text"
                        value={entry.name}
                        disabled={!isOwner || entry.category !== "custom"}
                        onChange={(event) =>
                          updateExpense(entry.id, { name: event.target.value })
                        }
                        className="h-10 min-w-0 flex-1 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm font-semibold outline-none"
                      />
                      <button
                        type="button"
                        disabled={!isOwner}
                        onClick={() => removeExpense(entry.id)}
                        className="rounded-full p-2 text-[#c86030] disabled:opacity-40"
                        aria-label={`Hapus ${entry.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={entry.amount}
                      disabled={!isOwner}
                      onChange={(event) =>
                        updateExpense(entry.id, {
                          amount: Number(event.target.value || 0),
                        })
                      }
                      className="h-11 w-full rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm font-semibold outline-none"
                    />
                    <p className="mt-2 text-xs text-[#b58872]">
                      {entry.note || "Catatan owner untuk business summary"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[24px] border border-[#ddcbbb] bg-[#f4e9dc] shadow-[0_16px_30px_-26px_rgba(52,31,20,0.35)]">
            <div className="flex items-center justify-between border-b border-[#e8d6c8] px-4 py-3">
              <div>
                <h2 className="text-lg font-bold">📅 Kalender Libur</h2>
                <p className="text-xs text-[#b58872]">
                  {currentMonthHolidayCount} hari libur aktif. Order baru
                  ditutup di hari itu.
                </p>
              </div>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="date"
                  value={newHolidayDate}
                  disabled={!isOwner}
                  onChange={(event) => setNewHolidayDate(event.target.value)}
                  className="h-11 rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm outline-none"
                />
                <button
                  type="button"
                  disabled={!isOwner}
                  onClick={addHoliday}
                  className="rounded-2xl bg-[#cb6837] px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  Tambah
                </button>
              </div>
              <input
                type="text"
                value={newHolidayLabel}
                disabled={!isOwner}
                onChange={(event) => setNewHolidayLabel(event.target.value)}
                placeholder="Contoh: Lebaran, Nyepi, Libur keluarga"
                className="h-11 w-full rounded-2xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 text-sm outline-none"
              />

              <div className="space-y-2">
                {holidayEntries.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-[#dcc7b8] px-4 py-6 text-center text-sm text-[#8a6047]">
                    🎉 Belum ada tanggal libur yang disimpan untuk bakery ini.
                  </div>
                ) : (
                  holidayEntries.map((entry) => (
                    <div
                      key={entry.date}
                      className="flex items-center justify-between gap-3 rounded-[18px] border border-[#e2d1c3] bg-[#f8efe6] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#2f1e13]">
                          {formatDateLabel(entry.date)}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#fff0df] px-2.5 py-1 text-[11px] font-semibold text-[#b15d2f]">
                            🏷️ {getHolidayBadge(entry)}
                          </span>
                          {(entry.label || "").trim().length > 0 ? (
                            <span className="text-xs text-[#8a6047]">
                              {entry.label}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!isOwner}
                        onClick={() => removeHoliday(entry.date)}
                        className="rounded-full p-2 text-[#c86030] disabled:opacity-40"
                        aria-label={`Hapus ${entry.date}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Attendance Reconciliation */}
            <AttendanceReconciliation
              reconciliationData={attendanceReconciliation}
              onUpdate={setAttendanceReconciliation}
              staffSettings={staffSettings}
              currentMonthKey={currentMonthKey}
            />
          </section>
        </div>

        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-10 space-y-2 rounded-[24px] border border-[#ddcbbb] bg-[#f7ede2]/95 px-3 py-3 shadow-[0_18px_30px_-26px_rgba(52,31,20,0.35)] backdrop-blur md:bottom-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isOwner || isSaving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#cb6837] px-4 py-3.5 text-sm font-bold text-white shadow-[0_14px_24px_-20px_rgba(200,96,48,0.8)] disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Simpan Pengaturan
          </button>
          <p className="text-center text-xs text-[#b58872]">
            ✨ Setelah disimpan, perubahan langsung dipakai di booking order,
            calendar, dan business.
          </p>
        </div>
      </div>
    </div>
  );
}
