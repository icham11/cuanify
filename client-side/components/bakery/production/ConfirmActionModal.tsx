"use client";

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ConfirmActionTone = "primary" | "success" | "danger";

export interface ConfirmActionRequest {
    /** Judul singkat, pakai bentuk pertanyaan. */
    title: string;
    /** Satu kalimat yang menjelaskan aksi pada order/proses mana. */
    description: string;
    /** Daftar efek konkret yang terjadi setelah aksi dikonfirmasi. */
    effects: string[];
    confirmLabel: string;
    cancelLabel?: string;
    tone: ConfirmActionTone;
    onConfirm: () => void;
}

const TONE_STYLES: Record<
    ConfirmActionTone,
    {
        iconWrapper: string;
        confirmButton: string;
        effectsWrapper: string;
        effectsTitle: string;
        bullet: string;
    }
> = {
    primary: {
        iconWrapper:
            "bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)]",
        confirmButton:
            "bg-[var(--crumbella-primary)] text-white hover:bg-[var(--crumbella-primary-strong)]",
        effectsWrapper: "border-[var(--crumbella-border)] bg-[#fbf5ef]",
        effectsTitle: "text-[var(--crumbella-primary)]",
        bullet: "bg-[var(--crumbella-primary)]",
    },
    success: {
        iconWrapper: "bg-emerald-100 text-emerald-700",
        confirmButton: "bg-emerald-600 text-white hover:bg-emerald-700",
        effectsWrapper: "border-emerald-200 bg-emerald-50/70",
        effectsTitle: "text-emerald-700",
        bullet: "bg-emerald-600",
    },
    danger: {
        iconWrapper: "bg-rose-100 text-rose-600",
        confirmButton: "bg-rose-600 text-white hover:bg-rose-700",
        effectsWrapper: "border-rose-200 bg-rose-50/70",
        effectsTitle: "text-rose-700",
        bullet: "bg-rose-500",
    },
};

function ToneIcon({ tone }: { tone: ConfirmActionTone }) {
    if (tone === "success") return <CheckCircle2 className="h-5 w-5" />;
    if (tone === "danger") return <AlertTriangle className="h-5 w-5" />;
    return <Info className="h-5 w-5" />;
}

export default function ConfirmActionModal({
    request,
    onCancel,
}: {
    request: ConfirmActionRequest | null;
    onCancel: () => void;
}) {
    useEffect(() => {
        if (!request) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onCancel();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onCancel, request]);

    if (!request) return null;

    const tone = TONE_STYLES[request.tone];

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="production-confirm-action-title"
            onClick={onCancel}
        >
            <div
                className="w-full rounded-t-3xl border border-[var(--crumbella-border)] bg-white shadow-2xl sm:max-w-md sm:rounded-3xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="h-1 w-10 rounded-full bg-slate-200" />
                </div>

                <div className="space-y-4 px-5 py-4 sm:px-6 sm:py-5">
                    <div className="flex items-start gap-3">
                        <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.iconWrapper}`}
                        >
                            <ToneIcon tone={request.tone} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2
                                id="production-confirm-action-title"
                                className="text-base font-extrabold leading-snug text-[var(--foreground)]"
                            >
                                {request.title}
                            </h2>
                            <p className="mt-1 text-[13px] leading-relaxed text-[var(--crumbella-muted)]">
                                {request.description}
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-label="Tutup konfirmasi"
                            onClick={onCancel}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--crumbella-border)] text-[var(--crumbella-muted)] transition hover:bg-slate-100"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {request.effects.length > 0 ? (
                        <div
                            className={`rounded-2xl border px-4 py-3 ${tone.effectsWrapper}`}
                        >
                            <p
                                className={`text-[10px] font-bold uppercase tracking-[0.14em] ${tone.effectsTitle}`}
                            >
                                Efek dari aksi ini
                            </p>
                            <ul className="mt-2 space-y-1.5">
                                {request.effects.map((effect) => (
                                    <li
                                        key={effect}
                                        className="flex items-start gap-2 text-[12px] leading-relaxed text-[var(--foreground)]"
                                    >
                                        <span
                                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.bullet}`}
                                        />
                                        <span>{effect}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    <div className="flex gap-3 pb-4 sm:pb-0">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 rounded-xl border border-[var(--crumbella-border)] px-4 py-2.5 text-sm font-semibold text-[var(--crumbella-muted)] transition hover:bg-slate-50"
                        >
                            {request.cancelLabel || "Batal"}
                        </button>
                        <button
                            type="button"
                            autoFocus
                            onClick={request.onConfirm}
                            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tone.confirmButton}`}
                        >
                            {request.confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
