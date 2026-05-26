"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Calendar } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { getJakartaDateKey } from "@/lib/bakery/attendance";
import { BAKERY_SETTINGS_UPDATED_EVENT } from "@/hooks/useBakerySettings";

type AttendanceWindowData = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  label: string;
  todayKey: string;
  isHolidayToday: boolean;
  hasWindowStarted: boolean;
  hasWindowEnded: boolean;
  canCheckInNow: boolean;
  message: string;
};

type OwnerAttendanceMember = {
  memberId: number;
  userId: number;
  name: string;
  email: string;
  role: "Admin" | "Staff";
  attendanceCount: number;
  expectedAttendanceDays: number;
  lateCount: number;
  systemLateCount: number;
  manualLateCount: number;
  isManualOverride: boolean;
  missingDates: string[];
  daily: Array<{
    date: string;
    status: "present";
    checkInAt: string;
    checkOutAt: string | null;
    isLate: boolean;
    notes: string | null;
  }>;
};

type SelfAttendanceData = {
  attendanceCount: number;
  expectedAttendanceDays: number;
  lateCount: number;
  systemLateCount: number;
  manualLateCount: number;
  isManualOverride: boolean;
  missingDates: string[];
  attendanceWindow?: AttendanceWindowData;
  records: Array<{
    date: string;
    status: "present";
    checkInAt: string;
    checkOutAt: string | null;
    isLate: boolean;
    notes: string | null;
  }>;
  todayRecord: {
    date: string;
    status: "present";
    checkInAt: string;
    checkOutAt: string | null;
    isLate: boolean;
    notes: string | null;
  } | null;
};

type OwnerAttendanceEditorState = {
  date: string;
  checkInTime: string;
  checkOutTime: string;
  manualLateCount: string;
  note: string;
};

function getCurrentMonth() {
  return getJakartaDateKey(new Date()).slice(0, 7);
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

function formatTimeInputValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function getDefaultOwnerEditorState(
  member: OwnerAttendanceMember,
  month: string,
  defaultTime: string,
): OwnerAttendanceEditorState {
  const latestDailyEntry =
    member.daily.length > 0 ? member.daily[member.daily.length - 1] : null;
  const fallbackDate =
    member.missingDates[0] ?? latestDailyEntry?.date ?? `${month}-01`;

  return {
    date: fallbackDate,
    checkInTime: defaultTime,
    checkOutTime: formatTimeInputValue(latestDailyEntry?.checkOutAt),
    manualLateCount: String(member.manualLateCount ?? 0),
    note: "",
  };
}

export default function BakeryAttendancePage() {
  const { isOwner, isAdmin, isStaff, userName } = useRole();
  const [month, setMonth] = useState(getCurrentMonth());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ownerTeam, setOwnerTeam] = useState<OwnerAttendanceMember[]>([]);
  const [ownerAttendanceWindow, setOwnerAttendanceWindow] =
    useState<AttendanceWindowData | null>(null);
  const [selfData, setSelfData] = useState<SelfAttendanceData | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeEditorUserId, setActiveEditorUserId] = useState<number | null>(
    null,
  );
  const [ownerEditorByUserId, setOwnerEditorByUserId] = useState<
    Record<number, OwnerAttendanceEditorState>
  >({});
  const [ownerActionUserId, setOwnerActionUserId] = useState<number | null>(
    null,
  );

  const loadAttendance = useCallback(async () => {
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
          attendanceWindow?: AttendanceWindowData;
        } & SelfAttendanceData;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Gagal memuat absensi");
      }

      if (payload.data?.mode === "owner") {
        setOwnerTeam(payload.data.team || []);
        setOwnerAttendanceWindow(payload.data.attendanceWindow || null);
        setSelfData(null);
      } else {
        setSelfData(payload.data || null);
        setOwnerAttendanceWindow(null);
        setOwnerTeam([]);
      }
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Gagal memuat absensi",
      );
    } finally {
      setIsLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  const submitAttendance = async (action: "check-in" | "check-out") => {
    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/bakery/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Gagal menyimpan absensi");
      }

      setSuccessMessage(
        action === "check-out"
          ? "Absen pulang berhasil disimpan."
          : "Absen masuk hari ini berhasil disimpan.",
      );
      await loadAttendance();
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

  const ensureOwnerEditor = useCallback(
    (member: OwnerAttendanceMember) => {
      const defaultTime = ownerAttendanceWindow?.startTime || "06:00";
      setOwnerEditorByUserId((current) => ({
        ...current,
        [member.userId]:
          current[member.userId] ??
          getDefaultOwnerEditorState(member, month, defaultTime),
      }));
      setActiveEditorUserId(member.userId);
    },
    [month, ownerAttendanceWindow],
  );

  const updateOwnerEditorField = useCallback(
    (
      userId: number,
      field: keyof OwnerAttendanceEditorState,
      value: string,
      member?: OwnerAttendanceMember,
    ) => {
      setOwnerEditorByUserId((current) => {
        const fallback =
          member
            ? getDefaultOwnerEditorState(
                member,
                month,
                ownerAttendanceWindow?.startTime || "06:00",
              )
            : {
                date: `${month}-01`,
                checkInTime: ownerAttendanceWindow?.startTime || "06:00",
                manualLateCount: "0",
                note: "",
              };

        return {
          ...current,
          [userId]: {
            ...(current[userId] ?? fallback),
            [field]: value,
          },
        };
      });
    },
    [month, ownerAttendanceWindow],
  );

  const runOwnerAttendanceAction = useCallback(
    async (userId: number, body: Record<string, unknown>) => {
      setOwnerActionUserId(userId);
      setError("");
      setSuccessMessage("");
      try {
        const response = await fetch("/api/bakery/attendance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          data?: { message?: string };
        };

        if (!response.ok) {
          throw new Error(payload.error || "Gagal mengubah absensi staff");
        }

        setSuccessMessage(payload.data?.message || "Perubahan absensi tersimpan.");
        window.dispatchEvent(new Event(BAKERY_SETTINGS_UPDATED_EVENT));
        await loadAttendance();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Gagal mengubah absensi staff",
        );
      } finally {
        setOwnerActionUserId(null);
      }
    },
    [loadAttendance],
  );

  const saveOwnerAttendanceRecord = useCallback(
    async (member: OwnerAttendanceMember) => {
      const editor =
        ownerEditorByUserId[member.userId] ??
        getDefaultOwnerEditorState(
          member,
          month,
          ownerAttendanceWindow?.startTime || "06:00",
        );

      await runOwnerAttendanceAction(member.userId, {
        action: "upsert-record",
        userId: member.userId,
        date: editor.date,
        checkInTime: editor.checkInTime,
        checkOutTime: editor.checkOutTime,
        notes: editor.note,
      });
    },
    [month, ownerAttendanceWindow, ownerEditorByUserId, runOwnerAttendanceAction],
  );

  const saveOwnerManualLate = useCallback(
    async (member: OwnerAttendanceMember) => {
      const editor =
        ownerEditorByUserId[member.userId] ??
        getDefaultOwnerEditorState(
          member,
          month,
          ownerAttendanceWindow?.startTime || "06:00",
        );

      await runOwnerAttendanceAction(member.userId, {
        action: "set-manual-late-count",
        userId: member.userId,
        monthKey: month,
        manualLateCount: Number(editor.manualLateCount || 0),
        notes: editor.note,
      });
    },
    [month, ownerAttendanceWindow, ownerEditorByUserId, runOwnerAttendanceAction],
  );

  const resetLateForMember = useCallback(
    async (member: OwnerAttendanceMember) => {
      const editor =
        ownerEditorByUserId[member.userId] ??
        getDefaultOwnerEditorState(
          member,
          month,
          ownerAttendanceWindow?.startTime || "06:00",
        );

      const confirmed = window.confirm(
        `Reset semua telat untuk ${member.name} di ${formatMonthLabel(month)}? Ini akan membersihkan override manual, mengubah check-in telat jadi on-time, dan mengisi tanggal yang dianggap belum absen di bulan ini.`,
      );
      if (!confirmed) return;

      await runOwnerAttendanceAction(member.userId, {
        action: "reset-late-for-user",
        userId: member.userId,
        monthKey: month,
        notes: editor.note,
      });
    },
    [month, ownerAttendanceWindow, ownerEditorByUserId, runOwnerAttendanceAction],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
      <GradientPageHeader
        title="Absensi"
        description={
          isOwner
            ? "Pantau kehadiran admin & staff"
            : `Absensi harian untuk ${userName || (isAdmin ? "Admin" : isStaff ? "Staff" : "Team")}`
        }
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

        {!error && successMessage ? (
          <div className="mt-4 rounded-[16px] border border-[#bddfc4] bg-[#eefaf0] px-4 py-3 text-xs text-[#237247]">
            {successMessage}
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
                        <p className="text-sm font-bold text-[#1f140d]">
                          {member.name}
                        </p>
                        <p className="text-[11px] text-[#8a6a54]">
                          {member.role}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-right">
                      <div>
                        <p className="text-sm font-bold text-[#1f140d]">
                          {member.attendanceCount}/{member.expectedAttendanceDays}
                        </p>
                        <p className="text-[11px] text-[#8a6a54]">hari hadir</p>
                        <p className="text-[11px] text-[#cf4028]">
                          {member.lateCount}x telat
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => ensureOwnerEditor(member)}
                          className="rounded-full border border-[#dfc9b7] bg-[#fff7f0] px-3 py-1.5 text-[11px] font-semibold text-[#7f4a24]"
                        >
                          Edit absensi
                        </button>
                        <button
                          type="button"
                          onClick={() => void resetLateForMember(member)}
                          disabled={ownerActionUserId === member.userId}
                          className="rounded-full border border-[#efb5aa] bg-[#fff1ef] px-3 py-1.5 text-[11px] font-semibold text-[#c24f39] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {ownerActionUserId === member.userId
                            ? "Memproses..."
                            : "Reset telat"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 border-b border-[#f2e3d8] px-4 py-3">
                    <MiniMetric
                      title={String(member.systemLateCount)}
                      subtitle="Sistem"
                      danger={member.systemLateCount > 0}
                    />
                    <MiniMetric
                      title={String(member.manualLateCount)}
                      subtitle="Owner"
                      danger={member.manualLateCount > 0}
                    />
                    <MiniMetric
                      title={String(member.missingDates.length)}
                      subtitle="Belum absen"
                      danger={member.missingDates.length > 0}
                    />
                  </div>

                  {activeEditorUserId === member.userId ? (
                    <div className="border-b border-[#f2e3d8] bg-[#fffaf5] px-4 py-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-[#8a6a54]">
                            Tanggal absensi
                          </span>
                          <input
                            type="date"
                            value={
                              ownerEditorByUserId[member.userId]?.date ??
                              getDefaultOwnerEditorState(
                                member,
                                month,
                                ownerAttendanceWindow?.startTime || "06:00",
                              ).date
                            }
                            onChange={(event) =>
                              updateOwnerEditorField(
                                member.userId,
                                "date",
                                event.target.value,
                                member,
                              )
                            }
                            className="h-10 w-full rounded-xl border border-[#dfc9b7] bg-white px-3 text-sm font-semibold text-[#2f1e13] outline-none"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-[#8a6a54]">
                            Jam check-in
                          </span>
                          <input
                            type="time"
                            value={
                              ownerEditorByUserId[member.userId]?.checkInTime ??
                              getDefaultOwnerEditorState(
                                member,
                                month,
                                ownerAttendanceWindow?.startTime || "06:00",
                              ).checkInTime
                            }
                            onChange={(event) =>
                              updateOwnerEditorField(
                                member.userId,
                                "checkInTime",
                                event.target.value,
                                member,
                              )
                            }
                            className="h-10 w-full rounded-xl border border-[#dfc9b7] bg-white px-3 text-sm font-semibold text-[#2f1e13] outline-none"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-[#8a6a54]">
                            Jam check-out
                          </span>
                          <input
                            type="time"
                            value={
                              ownerEditorByUserId[member.userId]?.checkOutTime ??
                              getDefaultOwnerEditorState(
                                member,
                                month,
                                ownerAttendanceWindow?.startTime || "06:00",
                              ).checkOutTime
                            }
                            onChange={(event) =>
                              updateOwnerEditorField(
                                member.userId,
                                "checkOutTime",
                                event.target.value,
                                member,
                              )
                            }
                            className="h-10 w-full rounded-xl border border-[#dfc9b7] bg-white px-3 text-sm font-semibold text-[#2f1e13] outline-none"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-[#8a6a54]">
                            Override telat
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={
                              ownerEditorByUserId[member.userId]?.manualLateCount ??
                              getDefaultOwnerEditorState(
                                member,
                                month,
                                ownerAttendanceWindow?.startTime || "06:00",
                              ).manualLateCount
                            }
                            onChange={(event) =>
                              updateOwnerEditorField(
                                member.userId,
                                "manualLateCount",
                                event.target.value,
                                member,
                              )
                            }
                            className="h-10 w-full rounded-xl border border-[#dfc9b7] bg-white px-3 text-sm font-semibold text-[#2f1e13] outline-none"
                          />
                        </label>
                        <label className="space-y-1 md:col-span-1">
                          <span className="text-[11px] font-semibold text-[#8a6a54]">
                            Catatan owner
                          </span>
                          <input
                            type="text"
                            value={
                              ownerEditorByUserId[member.userId]?.note ?? ""
                            }
                            onChange={(event) =>
                              updateOwnerEditorField(
                                member.userId,
                                "note",
                                event.target.value,
                                member,
                              )
                            }
                            placeholder="Contoh: lupa absen dari web"
                            className="h-10 w-full rounded-xl border border-[#dfc9b7] bg-white px-3 text-sm text-[#2f1e13] outline-none"
                          />
                        </label>
                      </div>

                      {member.missingDates.length > 0 ? (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold text-[#8a6a54]">
                            Tanggal belum absen
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {member.missingDates.map((dateKey) => (
                              <button
                                key={`${member.userId}-missing-${dateKey}`}
                                type="button"
                                onClick={() =>
                                  updateOwnerEditorField(
                                    member.userId,
                                    "date",
                                    dateKey,
                                    member,
                                  )
                                }
                                className="rounded-full border border-[#efcdb9] bg-white px-3 py-1 text-[11px] font-semibold text-[#8a5d3e]"
                              >
                                {formatDateLabel(dateKey)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void saveOwnerAttendanceRecord(member)}
                          disabled={ownerActionUserId === member.userId}
                          className="rounded-full bg-[#d3662d] px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {ownerActionUserId === member.userId
                            ? "Menyimpan..."
                            : "Simpan/Edit absensi"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveOwnerManualLate(member)}
                          disabled={ownerActionUserId === member.userId}
                          className="rounded-full border border-[#dfc9b7] bg-white px-3 py-2 text-[11px] font-semibold text-[#7f4a24] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Simpan override telat
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveEditorUserId(null)}
                          className="rounded-full border border-[#dfc9b7] bg-[#f6ede4] px-3 py-2 text-[11px] font-semibold text-[#6e513d]"
                        >
                          Tutup
                        </button>
                      </div>
                    </div>
                  ) : null}

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
                            Masuk {formatTimeLabel(entry.checkInAt)}
                          </p>
                          <p className="text-[11px] text-[#8a6a54]">
                            Pulang {entry.checkOutAt ? formatTimeLabel(entry.checkOutAt) : "--:--"}
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
                    {selfData?.attendanceWindow?.message ||
                      "Tekan tombol di bawah untuk check-in harian."}
                  </p>
                  {selfData?.attendanceWindow ? (
                    <p className="mt-1 text-[11px] font-semibold text-[#a85d31]">
                      Window: {selfData.attendanceWindow.label}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void submitAttendance(
                      selfData?.todayRecord ? "check-out" : "check-in",
                    )
                  }
                  disabled={
                    isSubmitting ||
                    Boolean(selfData?.todayRecord?.checkOutAt) ||
                    (selfData?.attendanceWindow?.enabled === true &&
                      !selfData?.todayRecord &&
                      !selfData.attendanceWindow.canCheckInNow)
                  }
                  className="rounded-full bg-[#d3662d] px-3 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {!selfData?.todayRecord
                    ? selfData?.attendanceWindow?.enabled === true &&
                      !selfData.attendanceWindow.canCheckInNow
                      ? selfData.attendanceWindow.hasWindowStarted
                        ? "Sudah Tutup"
                        : "Belum Dibuka"
                      : isSubmitting
                        ? "Menyimpan..."
                        : "Absen Masuk"
                    : selfData.todayRecord.checkOutAt
                      ? "Sudah Lengkap"
                      : isSubmitting
                        ? "Menyimpan..."
                        : "Absen Pulang"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b border-[#f1e1d5] px-4 py-4 sm:grid-cols-4">
                <MiniMetric
                  title={`${selfData?.attendanceCount ?? 0}/${selfData?.expectedAttendanceDays ?? 0}`}
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
                <MiniMetric
                  title={
                    selfData?.todayRecord?.checkOutAt
                      ? formatTimeLabel(selfData.todayRecord.checkOutAt)
                      : "--:--"
                  }
                  subtitle="Check-out"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 px-4 py-4">
                <MiniMetric
                  title={String(selfData?.systemLateCount ?? 0)}
                  subtitle="Hitung sistem"
                  danger={(selfData?.systemLateCount ?? 0) > 0}
                />
                <MiniMetric
                  title={String(selfData?.manualLateCount ?? 0)}
                  subtitle="Input owner"
                  danger={(selfData?.manualLateCount ?? 0) > 0}
                />
                <MiniMetric
                  title={String(selfData?.missingDates.length ?? 0)}
                  subtitle="Belum absen"
                  danger={(selfData?.missingDates.length ?? 0) > 0}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-[18px] border border-[#dec8b6] bg-white">
              <div className="border-b border-[#ead6c8] px-4 py-3">
                <p className="text-sm font-bold text-[#1f140d]">
                  Riwayat Bulan Ini
                </p>
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
                            Masuk {formatTimeLabel(record.checkInAt)}
                          </p>
                          <p className="text-[11px] text-[#8a6a54]">
                            Pulang {record.checkOutAt ? formatTimeLabel(record.checkOutAt) : "--:--"}
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
    <div
      className={`rounded-[12px] px-3 py-3 text-center ${danger ? "bg-[#fdecee]" : "bg-[#f6ede4]"}`}
    >
      <p
        className={`text-[1.1rem] font-bold ${danger ? "text-[#cf4028]" : "text-[#1f140d]"}`}
      >
        {title}
      </p>
      <p className="text-[11px] text-[#8a6a54]">{subtitle}</p>
    </div>
  );
}
