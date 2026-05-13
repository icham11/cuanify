"use client";

import { useEffect, useState } from "react";
import { Loader2, Calendar } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";

type OwnerAttendanceMember = {
  memberId: number;
  userId: number;
  name: string;
  email: string;
  role: "Admin" | "Staff";
  attendanceCount: number;
  lateCount: number;
  daily: Array<{
    date: string;
    status: "present";
    checkInAt: string;
    isLate: boolean;
  }>;
};

type SelfAttendanceData = {
  attendanceCount: number;
  lateCount: number;
  records: Array<{
    date: string;
    status: "present";
    checkInAt: string;
    isLate: boolean;
    notes: string | null;
  }>;
  todayRecord: {
    date: string;
    status: "present";
    checkInAt: string;
    isLate: boolean;
    notes: string | null;
  } | null;
};

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}

function formatDateLabel(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function formatTimeLabel(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export default function BakeryAttendancePage() {
  const { isOwner, isAdmin, isStaff, userName } = useRole();
  const [month, setMonth] = useState(getCurrentMonth());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ownerTeam, setOwnerTeam] = useState<OwnerAttendanceMember[]>([]);
  const [selfData, setSelfData] = useState<SelfAttendanceData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadAttendance = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/bakery/attendance?month=${month}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          data?: {
            mode?: "owner" | "self";
            team?: OwnerAttendanceMember[];
          } & SelfAttendanceData;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Gagal memuat absensi");
        }

        if (cancelled) return;
        if (payload.data?.mode === "owner") {
          setOwnerTeam(payload.data.team || []);
          setSelfData(null);
        } else {
          setSelfData(payload.data || null);
          setOwnerTeam([]);
        }
      } catch (fetchError) {
        if (cancelled) return;
        setError(
          fetchError instanceof Error ? fetchError.message : "Gagal memuat absensi",
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadAttendance();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const submitAttendance = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/bakery/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Gagal menyimpan absensi");
      }

      const reload = await fetch(`/api/bakery/attendance?month=${month}`, {
        cache: "no-store",
      });
      const reloadPayload = (await reload.json().catch(() => ({}))) as {
        data?: SelfAttendanceData;
        error?: string;
      };
      if (!reload.ok) {
        throw new Error(reloadPayload.error || "Gagal memuat ulang absensi");
      }
      setSelfData(reloadPayload.data || null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal menyimpan absensi",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
      <GradientPageHeader
        title="Absensi"
        description={isOwner ? "Pantau kehadiran admin & staff" : `Absensi harian untuk ${userName || (isAdmin ? "Admin" : isStaff ? "Staff" : "Team")}`}
        icon={Calendar}
      />

      <section className="space-y-3 rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.45)]">
        <div className="mt-4 flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="h-11 flex-1 rounded-xl border border-[#dfc9b7] bg-white px-3 text-sm font-semibold text-[#2f1e13] outline-none"
          />
          <div className="rounded-xl border border-[#dfc9b7] bg-white px-3 py-2 text-center">
            <p className="text-[10px] text-[#9b775e]">Bulan</p>
            <p className="text-[11px] font-bold text-[#2f1e13]">
              {formatMonthLabel(month)}
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f2b0a7] bg-[#fff1ef] px-4 py-3 text-xs text-[#ba5644]">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-[18px] border border-[#ead6c8] bg-white px-4 py-10 text-sm text-[#8a6a54]">
            <Loader2 className="h-4 w-4 animate-spin text-[#cb6531]" />
            Memuat data absensi...
          </div>
        ) : isOwner ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {ownerTeam.length === 0 ? (
              <div className="rounded-[18px] border border-[#ead6c8] bg-white px-4 py-4 text-sm text-[#8a6a54]">
                Belum ada admin/staff yang terdaftar di bisnis ini.
              </div>
            ) : (
              ownerTeam.map((member) => (
                <div
                  key={member.memberId}
                  className="overflow-hidden rounded-[18px] border border-[#dec8b6] bg-white"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[#ead6c8] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#fbe7d8] text-sm font-bold text-[#a64f1f]">
                        {member.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-[#1f140d]">{member.name}</p>
                        <p className="text-[11px] text-[#8a6a54]">{member.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#1f140d]">
                        {member.attendanceCount} hari
                      </p>
                      <p className="text-[11px] text-[#cf4028]">
                        {member.lateCount}x telat
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-3 lg:grid-cols-4">
                    {member.daily.length === 0 ? (
                      <p className="col-span-3 text-[11px] text-[#8a6a54]">
                        Belum ada absensi di bulan ini.
                      </p>
                    ) : (
                      member.daily.map((entry) => (
                        <div
                          key={`${member.memberId}-${entry.date}`}
                          className={`rounded-[12px] px-3 py-2 ${
                            entry.isLate ? "bg-[#fdecee]" : "bg-[#e6f4ea]"
                          }`}
                        >
                          <p className="text-[11px] font-bold text-[#1f140d]">
                            {formatDateLabel(entry.date)}
                          </p>
                          <p className="text-[11px] text-[#8a6a54]">
                            {formatTimeLabel(entry.checkInAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="overflow-hidden rounded-[18px] border border-[#dd8c5a] bg-white">
              <div className="flex items-start justify-between gap-3 border-b border-[#ebc8b0] bg-[#fff1e6] px-4 py-3">
                <div>
                  <p className="text-[1.08rem] font-semibold leading-tight text-[#cb6531]">
                    Absensi Hari Ini
                  </p>
                  <p className="mt-1 text-xs text-[#8a6a54]">
                    Tekan tombol di bawah untuk check-in harian.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void submitAttendance()}
                  disabled={isSubmitting || Boolean(selfData?.todayRecord)}
                  className="rounded-full bg-[#d3662d] px-3 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {selfData?.todayRecord
                    ? "Sudah Absen"
                    : isSubmitting
                      ? "Menyimpan..."
                      : "+ Absen"}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 px-4 py-4">
                <MiniMetric
                  title={String(selfData?.attendanceCount ?? 0)}
                  subtitle="Hadir"
                />
                <MiniMetric
                  title={String(selfData?.lateCount ?? 0)}
                  subtitle="Telat"
                  danger={(selfData?.lateCount ?? 0) > 0}
                />
                <MiniMetric
                  title={
                    selfData?.todayRecord
                      ? formatTimeLabel(selfData.todayRecord.checkInAt)
                      : "--:--"
                  }
                  subtitle="Check-in"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-[18px] border border-[#dec8b6] bg-white">
              <div className="border-b border-[#ead6c8] px-4 py-3">
                <p className="text-sm font-bold text-[#1f140d]">Riwayat Bulan Ini</p>
              </div>
              <div className="px-4 py-3">
                {!selfData || selfData.records.length === 0 ? (
                  <p className="text-[11px] text-[#8a6a54]">
                    Belum ada riwayat absensi di bulan ini.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selfData.records.map((record) => (
                      <div
                        key={record.date}
                        className="flex items-center justify-between rounded-[12px] bg-[#f7eee6] px-3 py-2"
                      >
                        <div>
                          <p className="text-[12px] font-bold text-[#1f140d]">
                            {formatDateLabel(record.date)}
                          </p>
                          <p className="text-[11px] text-[#8a6a54]">
                            {formatTimeLabel(record.checkInAt)}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
                            record.isLate
                              ? "bg-[#fdecee] text-[#cf4028]"
                              : "bg-[#e6f4ea] text-[#237247]"
                          }`}
                        >
                          {record.isLate ? "Terlambat" : "Hadir"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MiniMetric({
  title,
  subtitle,
  danger = false,
}: {
  title: string;
  subtitle: string;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-[12px] px-3 py-3 text-center ${danger ? "bg-[#fdecee]" : "bg-[#f6ede4]"}`}>
      <p className={`text-[1.1rem] font-bold ${danger ? "text-[#cf4028]" : "text-[#1f140d]"}`}>
        {title}
      </p>
      <p className="text-[11px] text-[#8a6a54]">{subtitle}</p>
    </div>
  );
}
