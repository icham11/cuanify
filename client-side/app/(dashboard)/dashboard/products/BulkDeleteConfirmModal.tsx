import React from "react";

export default function BulkDeleteConfirmModal({ count, deleting, error, onClose, onConfirm }: {
  count: number;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full flex flex-col items-center">
        <h2 className="text-lg font-bold mb-2 text-red-600">Hapus {count} produk?</h2>
        {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-100 text-gray-700 font-semibold">Batal</button>
          <button onClick={onConfirm} disabled={deleting} className="px-4 py-2 rounded bg-red-600 text-white font-bold disabled:opacity-50">
            {deleting ? "Menghapus..." : "Hapus"}
          </button>
        </div>
      </div>
    </div>
  );
}
