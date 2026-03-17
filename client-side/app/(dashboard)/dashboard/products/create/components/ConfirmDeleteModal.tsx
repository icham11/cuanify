"use client";

import { Trash2, X } from "lucide-react";

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A bottom-sheet confirmation dialog for destructive actions.
 * Matches the existing bottom-sheet modal pattern used across this page.
 */
export default function ConfirmDeleteModal({
  open,
  title = "Hapus item ini?",
  description,
  confirmLabel = "Hapus",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm pb-16 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
              <Trash2 size={18} className="text-red-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{title}</h2>
              {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition shrink-0 ml-2"
          >
            <X size={16} />
          </button>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row-reverse gap-2 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-bold rounded-xl transition"
          >
            <Trash2 size={14} />
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
