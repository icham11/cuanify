"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Coins, Loader2, RefreshCw } from "lucide-react";
import { getJakartaTodayIsoDate } from "@/lib/bookings/shipping-schedule";
import {
    PRODUCTION_STAGE_LABELS,
    normalizeProductionStageKey,
} from "@/lib/bookings/production-stages";

type StaffTokenReportTask = {
    orderId: string;
    bookingCode: string;
    customerName: string;
    deliveryDate: string;
    stage: string;
    token: number;
    completedAt: string | null;
};

type StaffTokenReportRow = {
    staffUserId: number;
    staffName: string;
    readyDateToken: number;
    readyDateTaskCount: number;
    readyMonthToken: number;
    pendingToken: number;
    pendingTaskCount: number;
    missedToken: number;
    missedTaskCount: number;
    readyDateTasks: StaffTokenReportTask[];
    missedTasks: StaffTokenReportTask[];
};

// Samakan dengan polling data order agar Ready dari staff cepat terlihat.
const REPORT_REFRESH_INTERVAL_MS = 60_000;

type StaffTokenReportData = {
    date: string;
    month: string;
    staff: StaffTokenReportRow[];
};

function formatStageLabel(stage: string): string {
    const key = normalizeProductionStageKey(stage);
    return key ? PRODUCTION_STAGE_LABELS[key] : stage;
}

function formatTime(value: string | null): string {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function formatDateLabel(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "-";
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(year, month - 1, day));
}

function formatMonthLabel(value: string): string {
    if (!/^\d{4}-\d{2}$/.test(value)) return value;
    const [year, month] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
    }).format(new Date(year, month - 1, 1));
}

function TaskList({
    title,
    tasks,
    showTime,
}: {
    title: string;
    tasks: StaffTokenReportTask[];
    showTime: boolean;
}) {
    if (tasks.length === 0) return null;

    return (
        <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--crumbella-muted)]">
                {title}
            </p>
            {tasks.map((task) => (
                <div
                    key={`${task.orderId}:${task.stage}`}
                    className="flex items-center justify-between gap-3 rounded-[14px] bg-[#fbf5ef] px-3 py-2 text-[11px]"
                >
                    <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--foreground)]">
                            {task.bookingCode} · {task.customerName}
                        </p>
                        <p className="truncate text-[var(--crumbella-muted)]">
                            {formatStageLabel(task.stage)}
                            {showTime
                                ? ` · Ready ${formatTime(task.completedAt)}`
                                : ` · Kirim ${formatDateLabel(task.deliveryDate)}`}
                        </p>
                    </div>
                    <p className="shrink-0 font-bold text-[var(--foreground)]">
                        {task.token} tok
                    </p>
                </div>
            ))}
        </div>
    );
}

/**
 * Laporan token harian per staff untuk Owner/Admin. Token dihitung masuk ke
 * staff saat tahap produksinya ditandai Ready oleh staff yang ditugaskan.
 */
export default function StaffTokenReport() {
    const [date, setDate] = useState(() => getJakartaTodayIsoDate());
    const [data, setData] = useState<StaffTokenReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expandedStaffId, setExpandedStaffId] = useState<number | null>(null);

    const loadReport = useCallback(
        async (targetDate: string, options?: { silent?: boolean }) => {
            if (!options?.silent) setLoading(true);
            setError("");
            try {
                const response = await fetch(
                    `/api/bakery/production/staff-token-report?date=${encodeURIComponent(targetDate)}`,
                    { cache: "no-store" },
                );
                const payload = (await response.json().catch(() => ({}))) as {
                    success?: boolean;
                    data?: StaffTokenReportData;
                    error?: string;
                };
                if (!response.ok || !payload.success || !payload.data) {
                    throw new Error(
                        payload.error || "Gagal memuat laporan token staff.",
                    );
                }
                setData(payload.data);
            } catch (loadError) {
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : "Gagal memuat laporan token staff.",
                );
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        void loadReport(date);

        const refresh = () => {
            if (document.visibilityState === "visible") {
                void loadReport(date, { silent: true });
            }
        };
        const intervalId = window.setInterval(
            refresh,
            REPORT_REFRESH_INTERVAL_MS,
        );
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [date, loadReport]);

    const staff = data?.staff ?? [];
    const totalReadyDateToken = staff.reduce(
        (sum, entry) => sum + entry.readyDateToken,
        0,
    );
    const totalMissedToken = staff.reduce(
        (sum, entry) => sum + entry.missedToken,
        0,
    );

    return (
        <div className="space-y-3 rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.45)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--crumbella-primary)]">
                        <Coins className="h-3.5 w-3.5" />
                        Laporan Token Staff
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
                        Token masuk ke staff saat proses produksinya ditandai
                        Ready oleh staff yang bertugas.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={date}
                        max={getJakartaTodayIsoDate()}
                        onChange={(event) => {
                            if (event.target.value) setDate(event.target.value);
                        }}
                        className="h-10 rounded-[14px] border border-[var(--crumbella-border)] bg-white px-2.5 text-xs font-medium text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--crumbella-focus)]/20"
                    />
                    <button
                        type="button"
                        onClick={() => void loadReport(date)}
                        disabled={loading}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] transition hover:bg-[#fbf5ef] disabled:opacity-60"
                        title="Muat ulang laporan"
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4" />
                        )}
                    </button>
                </div>
            </div>

            {error ? (
                <p className="rounded-[16px] border border-[#e8b4a8] bg-[#fdf0ec] px-3 py-2 text-[11px] text-[#a83030]">
                    {error}
                </p>
            ) : null}

            {data ? (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-[20px] border border-[var(--crumbella-border)] bg-white px-3 py-3">
                            <p className="text-[10px] font-medium text-[var(--crumbella-muted)]">
                                Token Ready {formatDateLabel(data.date)}
                            </p>
                            <p className="mt-1 text-[1.5rem] font-extrabold leading-none text-[#1f6a43]">
                                {totalReadyDateToken}
                            </p>
                        </div>
                        <div className="rounded-[20px] border border-[var(--crumbella-border)] bg-white px-3 py-3">
                            <p className="text-[10px] font-medium text-[var(--crumbella-muted)]">
                                Terlewat {formatMonthLabel(data.month)}
                            </p>
                            <p
                                className={`mt-1 text-[1.5rem] font-extrabold leading-none ${
                                    totalMissedToken > 0
                                        ? "text-[#a83030]"
                                        : "text-[var(--foreground)]"
                                }`}
                            >
                                {totalMissedToken}
                            </p>
                        </div>
                    </div>

                    {staff.length === 0 ? (
                        <p className="text-[11px] text-[var(--crumbella-muted)]">
                            Belum ada staff di tim ini.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {staff.map((entry) => {
                                const isExpanded =
                                    expandedStaffId === entry.staffUserId;
                                const hasDetails =
                                    entry.readyDateTasks.length > 0 ||
                                    entry.missedTasks.length > 0;

                                return (
                                    <div
                                        key={entry.staffUserId}
                                        className="rounded-[20px] border border-[var(--crumbella-border)] bg-white"
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setExpandedStaffId(
                                                    isExpanded
                                                        ? null
                                                        : entry.staffUserId,
                                                )
                                            }
                                            disabled={!hasDetails}
                                            className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-3 text-left disabled:cursor-default"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-[var(--foreground)]">
                                                    {entry.staffName}
                                                </p>
                                                <p className="text-[11px] text-[var(--crumbella-muted)]">
                                                    {formatMonthLabel(
                                                        data.month,
                                                    )}
                                                    : {entry.readyMonthToken}{" "}
                                                    tok · Belum Ready:{" "}
                                                    {entry.pendingToken} tok
                                                    {entry.missedToken > 0 ? (
                                                        <span className="text-[#a83030]">
                                                            {" "}
                                                            · Terlewat:{" "}
                                                            {
                                                                entry.missedToken
                                                            }{" "}
                                                            tok
                                                        </span>
                                                    ) : null}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-right">
                                                    <p className="text-lg font-extrabold leading-none text-[#1f6a43]">
                                                        {entry.readyDateToken}{" "}
                                                        tok
                                                    </p>
                                                    <p className="mt-0.5 text-[10px] text-[var(--crumbella-muted)]">
                                                        {
                                                            entry.readyDateTaskCount
                                                        }{" "}
                                                        proses Ready
                                                    </p>
                                                </div>
                                                {hasDetails ? (
                                                    <ChevronDown
                                                        className={`h-4 w-4 text-[var(--crumbella-muted)] transition ${
                                                            isExpanded
                                                                ? "rotate-180"
                                                                : ""
                                                        }`}
                                                    />
                                                ) : null}
                                            </div>
                                        </button>
                                        {isExpanded ? (
                                            <div className="space-y-3 border-t border-[var(--crumbella-border)] px-3 py-3">
                                                <TaskList
                                                    title={`Ready ${formatDateLabel(data.date)}`}
                                                    tasks={entry.readyDateTasks}
                                                    showTime
                                                />
                                                <TaskList
                                                    title="Terlewat — order sudah selesai, proses belum ditandai Ready"
                                                    tasks={entry.missedTasks}
                                                    showTime={false}
                                                />
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : null}
        </div>
    );
}
