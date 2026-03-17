"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">📡</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Anda Sedang Offline</h1>
        <p className="text-gray-500 leading-relaxed mb-6">
          Sepertinya koneksi internet Anda terputus.
          Beberapa fitur mungkin tidak tersedia sampai koneksi kembali.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-linear-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-xl hover:opacity-90 transition cursor-pointer"
        >
          🔄 Coba Lagi
        </button>
        <div className="mt-8 p-4 bg-white rounded-xl border border-gray-200 text-left">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Yang masih bisa dilakukan
          </h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>✅ Melihat halaman yang sudah dibuka sebelumnya</li>
            <li>✅ Melihat data yang sudah di-cache</li>
            <li>✅ Mengakses kembali saat online</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

