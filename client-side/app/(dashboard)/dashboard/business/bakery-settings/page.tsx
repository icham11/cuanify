"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface BakerySettingsResponse {
  success?: boolean;
  data?: {
    dailyProductionTokenLimit: number;
    blockedDates: string[];
  };
  error?: string;
}

function normalizeBlockedDateLines(value: string): string[] {
  const lines = value
    .split(/[,\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return Array.from(
    new Set(lines.filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line))),
  ).sort();
}

export default function BakerySettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [dailyProductionTokenLimit, setDailyProductionTokenLimit] =
    useState<number>(500);
  const [blockedDatesText, setBlockedDatesText] = useState("");

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/bakery/settings", {
          cache: "no-store",
        });
        const payload = (await response
          .json()
          .catch(() => ({}))) as BakerySettingsResponse;

        if (!response.ok || !payload.data) {
          throw new Error(payload.error || "Gagal memuat bakery settings");
        }

        if (!active) return;

        setDailyProductionTokenLimit(payload.data.dailyProductionTokenLimit);
        setBlockedDatesText(payload.data.blockedDates.join("\n"));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Gagal memuat bakery settings";
        toast.error(message);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  const blockedDateCount = useMemo(
    () => normalizeBlockedDateLines(blockedDatesText).length,
    [blockedDatesText],
  );

  const handleSave = async () => {
    const normalizedBlockedDates = normalizeBlockedDateLines(blockedDatesText);

    if (
      !Number.isFinite(dailyProductionTokenLimit) ||
      dailyProductionTokenLimit < 1 ||
      dailyProductionTokenLimit > 10_000
    ) {
      toast.error("Token harian order wajib di rentang 1-10000.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/bakery/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dailyProductionTokenLimit: Math.round(dailyProductionTokenLimit),
          blockedDates: normalizedBlockedDates,
        }),
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as BakerySettingsResponse;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "Gagal menyimpan bakery settings");
      }

      setDailyProductionTokenLimit(payload.data.dailyProductionTokenLimit);
      setBlockedDatesText(payload.data.blockedDates.join("\n"));
      toast.success("Bakery settings berhasil disimpan.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Gagal menyimpan bakery settings";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bakery Settings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Owner dapat mengatur token harian order dan kalender libur dari sini.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat pengaturan...
          </div>
        ) : (
          <div className="space-y-6">
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Token Harian Order
              <input
                type="number"
                min={1}
                max={10000}
                value={dailyProductionTokenLimit}
                onChange={(event) =>
                  setDailyProductionTokenLimit(Number(event.target.value || 0))
                }
                className="h-10 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-indigo-400"
              />
              <span className="text-xs text-gray-500">
                Dipakai untuk batas kapasitas produksi per hari pada order bakery.
              </span>
            </label>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Kalender Libur (satu tanggal per baris, format YYYY-MM-DD)
              <textarea
                value={blockedDatesText}
                onChange={(event) => setBlockedDatesText(event.target.value)}
                rows={10}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                placeholder="2026-04-14\n2026-04-15"
              />
              <span className="text-xs text-gray-500">
                Total tanggal libur aktif: {blockedDateCount}
              </span>
            </label>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
              Edit harga produk tetap dilakukan dari menu Products. Endpoint update
              harga sekarang sudah owner-only.
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Simpan Bakery Settings
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
