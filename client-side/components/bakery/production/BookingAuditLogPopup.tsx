"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Clock3,
  Loader2,
  Mail,
  RefreshCcw,
  ScrollText,
  Trash2,
  UserRound,
  X,
  PencilLine,
  PlusCircle,
} from "lucide-react";

type BookingAuditAction = "created" | "edited" | "deleted";

type BookingAuditEntry = {
  id: number;
  action: BookingAuditAction;
  orderId: string;
  bookingCode: string;
  customerName: string;
  orderSummary: string;
  actorUserId: number | null;
  actorName: string;
  actorEmail: string;
  occurredAt: string;
  createdAt: string;
};

type BookingAuditPageInfo = {
  nextCursor?: number | null;
  hasMore?: boolean;
  total?: number;
};

type BookingAuditResponse = {
  success?: boolean;
  data?: BookingAuditEntry[];
  pageInfo?: BookingAuditPageInfo;
  error?: string;
};

function formatAuditTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return {
      date: "-",
      time: "-",
    };
  }

  return {
    date: new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(parsed),
    time: new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed),
  };
}

function getActionMeta(action: BookingAuditAction) {
  if (action === "created") {
    return {
      label: "Buat Booking",
      icon: PlusCircle,
      badgeClass: "bg-[#e8f4ee] text-[#22684a] border-[#bedccf]",
      iconClass: "text-[#22684a]",
    };
  }

  if (action === "edited") {
    return {
      label: "Edit Booking",
      icon: PencilLine,
      badgeClass: "bg-[#fff3e5] text-[#a45a16] border-[#f0d4ad]",
      iconClass: "text-[#a45a16]",
    };
  }

  return {
    label: "Hapus Booking",
    icon: Trash2,
    badgeClass: "bg-[#fdeaea] text-[#b33838] border-[#efc2c2]",
    iconClass: "text-[#b33838]",
  };
}

export default function BookingAuditLogPopup() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [entries, setEntries] = useState<BookingAuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalEntries, setTotalEntries] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadEntries = useCallback(
    async (options?: {
      cursor?: number | null;
      append?: boolean;
    }) => {
      const append = Boolean(options?.append);
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const params = new URLSearchParams({
          limit: "20",
        });
        if (options?.cursor) {
          params.set("cursor", String(options.cursor));
        }

        const response = await fetch(
          `/api/bookings/audit-logs?${params.toString()}`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );
        const payload = (await response.json().catch(() => ({}))) as BookingAuditResponse;
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Gagal memuat log booking.");
        }

        const nextEntries = payload.data ?? [];
        setEntries((currentEntries) =>
          append ? [...currentEntries, ...nextEntries] : nextEntries,
        );
        setNextCursor(payload.pageInfo?.nextCursor ?? null);
        setHasMore(Boolean(payload.pageInfo?.hasMore));
        setTotalEntries(payload.pageInfo?.total ?? nextEntries.length);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Gagal memuat log booking.",
        );
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    void loadEntries();
  }, [loadEntries, open]);

  const titleSummary = useMemo(() => {
    if (loading && entries.length === 0) return "Memuat aktivitas booking...";
    if (entries.length === 0) return "Belum ada aktivitas booking yang tercatat.";
    if (hasMore && totalEntries > entries.length) {
      return `Menampilkan ${entries.length} dari ${totalEntries} aktivitas booking terbaru.`;
    }
    return `${Math.max(totalEntries, entries.length)} aktivitas booking tercatat untuk owner.`;
  }, [entries.length, hasMore, loading, totalEntries]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group rounded-[20px] border border-[var(--crumbella-border)] bg-[linear-gradient(135deg,#fff8f1_0%,#fff 100%)] px-3 py-3 text-left shadow-[0_14px_30px_-24px_rgba(30,18,10,0.6)] transition hover:-translate-y-0.5 hover:border-[#d9b89a] hover:shadow-[0_20px_34px_-22px_rgba(30,18,10,0.38)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-2xl bg-[#fff1e7] p-2 text-[var(--crumbella-primary)] transition group-hover:bg-[#ffe6d5]">
            <ScrollText className="h-4 w-4" />
          </div>
          <span className="rounded-full border border-[#ead6c3] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--crumbella-primary)]">
            Owner
          </span>
        </div>
        <p className="mt-3 text-sm font-bold text-[var(--foreground)]">
          Log Booking
        </p>
        <p className="mt-1 text-[11px] leading-5 text-[var(--crumbella-muted)]">
          Lihat siapa yang membuat, mengedit, dan menghapus booking.
        </p>
      </button>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[220] bg-[rgba(43,28,18,0.38)] backdrop-blur-[2px]">
              <div
                className="absolute inset-0"
                onClick={() => setOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 top-auto rounded-t-[28px] border border-[var(--crumbella-border)] bg-[linear-gradient(180deg,#fffdf9_0%,#fff7f0_100%)] shadow-[0_-12px_40px_-18px_rgba(30,18,10,0.45)] sm:inset-y-6 sm:right-6 sm:left-auto sm:w-[min(720px,calc(100vw-48px))] sm:rounded-[30px]">
                <div className="flex h-full max-h-[88vh] flex-col">
                  <div className="flex items-start justify-between gap-4 border-b border-[rgba(205,176,147,0.35)] px-5 py-4 sm:px-6">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-[#efdac6] bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--crumbella-primary)]">
                        <ScrollText className="h-3.5 w-3.5" />
                        Booking Activity
                      </div>
                      <h3 className="mt-3 text-[1.4rem] font-extrabold text-[var(--foreground)]">
                        Riwayat Booking
                      </h3>
                      <p className="mt-1 text-sm text-[var(--crumbella-muted)]">
                        {titleSummary}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void loadEntries()}
                        disabled={loading}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--crumbella-border)] bg-white text-[var(--crumbella-primary)] transition hover:bg-[var(--crumbella-accent-soft)] disabled:opacity-60"
                        aria-label="Refresh log booking"
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--crumbella-border)] bg-white text-[var(--foreground)] transition hover:bg-[var(--crumbella-accent-soft)]"
                        aria-label="Tutup log booking"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                    {error ? (
                      <div className="rounded-[22px] border border-[#efc2c2] bg-[#fff1f1] px-4 py-3 text-sm text-[#b33838]">
                        {error}
                      </div>
                    ) : null}

                    {!error && loading && entries.length === 0 ? (
                      <div className="flex min-h-[240px] items-center justify-center rounded-[24px] border border-dashed border-[var(--crumbella-border)] bg-white/70">
                        <div className="text-center">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--crumbella-primary)]" />
                          <p className="mt-3 text-sm text-[var(--crumbella-muted)]">
                            Mengambil log booking terbaru...
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {!error && !loading && entries.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-[var(--crumbella-border)] bg-white/75 px-5 py-10 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff1e7] text-[var(--crumbella-primary)]">
                          <ScrollText className="h-5 w-5" />
                        </div>
                        <p className="mt-4 text-base font-bold text-[var(--foreground)]">
                          Belum ada log booking
                        </p>
                        <p className="mt-1 text-sm text-[var(--crumbella-muted)]">
                          Aktivitas buat, edit, dan hapus booking akan muncul di sini.
                        </p>
                      </div>
                    ) : null}

                    <div className="space-y-3 pb-5">
                      {entries.map((entry) => {
                        const actionMeta = getActionMeta(entry.action);
                        const ActionIcon = actionMeta.icon;
                        const timestamp = formatAuditTimestamp(
                          entry.occurredAt || entry.createdAt,
                        );
                        const orderLabel =
                          entry.bookingCode || entry.customerName || entry.orderId;

                        return (
                          <div
                            key={entry.id}
                            className="rounded-[24px] border border-[var(--crumbella-border)] bg-white px-4 py-4 shadow-[0_14px_30px_-28px_rgba(30,18,10,0.45)]"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${actionMeta.badgeClass}`}
                                  >
                                    <ActionIcon className={`h-3.5 w-3.5 ${actionMeta.iconClass}`} />
                                    {actionMeta.label}
                                  </span>
                                  <span className="text-xs font-medium text-[var(--crumbella-muted)]">
                                    {orderLabel}
                                  </span>
                                </div>
                                <div className="mt-3 rounded-[18px] border border-[#efe1d3] bg-[#fff9f4] px-3 py-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--crumbella-primary)]">
                                    Detail Booking
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-[var(--foreground)]">
                                    {entry.customerName || "Pemesan tidak tersedia"}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-[var(--crumbella-muted)]">
                                    {entry.orderSummary || "Ringkasan order tidak tersedia"}
                                  </p>
                                </div>
                                <div className="mt-2 flex flex-col gap-2 text-xs text-[var(--crumbella-muted)] sm:flex-row sm:flex-wrap sm:items-center">
                                  <span className="inline-flex items-center gap-1.5">
                                    <UserRound className="h-3.5 w-3.5" />
                                    {entry.actorName || "Akun tidak diketahui"}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <Mail className="h-3.5 w-3.5" />
                                    {entry.actorEmail || "Email tidak tersedia"}
                                  </span>
                                </div>
                              </div>

                              <div className="rounded-[18px] border border-[#efe1d3] bg-[#fffaf5] px-3 py-2 text-right">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--crumbella-primary)]">
                                  Tanggal
                                </p>
                                <p className="mt-1 text-sm font-bold text-[var(--foreground)]">
                                  {timestamp.date}
                                </p>
                                <p className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--crumbella-muted)]">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  {timestamp.time}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {!error && entries.length > 0 ? (
                      <div className="mt-4 flex items-center justify-center">
                        {hasMore ? (
                          <button
                            type="button"
                            onClick={() =>
                              void loadEntries({
                                cursor: nextCursor,
                                append: true,
                              })
                            }
                            disabled={loadingMore || !nextCursor}
                            className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-[18px] border border-[var(--crumbella-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--crumbella-primary)] transition hover:bg-[var(--crumbella-accent-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {loadingMore ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Memuat riwayat...
                              </>
                            ) : (
                              "Muat riwayat lebih lama"
                            )}
                          </button>
                        ) : totalEntries > 20 ? (
                          <p className="text-xs text-[var(--crumbella-muted)]">
                            Semua riwayat booking sudah ditampilkan.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
