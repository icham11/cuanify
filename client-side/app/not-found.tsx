import Link from "next/link";
import { Search, Home, ArrowLeft, MapPin } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full text-center">
        {/* 404 Big Number */}
        <div className="relative mb-6">
          <h1 className="text-[10rem] font-black text-transparent bg-clip-text bg-gradient-to-b from-indigo-200 to-indigo-100 leading-none select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="p-4 bg-white rounded-2xl shadow-xl border border-indigo-100">
              <MapPin className="w-10 h-10 text-indigo-500" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-indigo-100 px-8 py-8 mx-auto">
          <h2 className="text-2xl font-bold text-gray-900">Halaman Tidak Ditemukan</h2>
          <p className="text-gray-500 mt-3 text-sm leading-relaxed max-w-sm mx-auto">
            Halaman yang Anda cari tidak ditemukan. Mungkin sudah dipindahkan atau belum tersedia.
          </p>

          <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50 rounded-xl mt-6 border border-indigo-100">
            <Search className="w-4 h-4 text-indigo-400 shrink-0" />
            <p className="text-xs text-indigo-600">
              Cek URL-nya atau navigasi menggunakan tombol di bawah
            </p>
          </div>

          <div className="flex gap-3 mt-6">
            <Link
              href="/"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition shadow-md shadow-indigo-100 active:scale-[0.98]"
            >
              <Home className="w-4 h-4" />
              Beranda
            </Link>
            <Link
              href="/dashboard"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition active:scale-[0.98]"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Link>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Cuanify — Bikin Bisnis Makin Cuan
        </p>
      </div>
    </div>
  );
}
