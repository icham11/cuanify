import React from "react";

interface Product {
  name: string;
  // Add other fields as needed
}

export default function DeleteConfirmModal({
  product,
  onClose,
  onDeleted,
}: {
  product: Product;
  onClose: () => void;
  onDeleted: () => void;
}) {
  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      style={{ zIndex: 200 }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm overflow-hidden">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-6 py-5 sm:py-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">Hapus Produk?</h2>
              <p className="text-sm text-gray-500 mt-1">
                Yakin ingin menghapus produk <span className="font-semibold text-slate-700">{product?.name}</span>?
                Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
          </div>
          <div className="flex gap-3 pb-6 sm:pb-0">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
            >
              Batal
            </button>
            <button
              onClick={onDeleted}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition"
            >
              Hapus
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
