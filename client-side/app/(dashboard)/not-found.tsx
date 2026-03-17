import Link from "next/link";
import {
  Search,
  LayoutDashboard,
  Home,
  ShoppingCart,
  Package,
  BarChart3,
  MapPin,
} from "lucide-react";

const quickLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "blue" },
  { href: "/pos", label: "POS / Kasir", icon: ShoppingCart, color: "green" },
  { href: "/dashboard/products", label: "Produk", icon: Package, color: "purple" },
  { href: "/dashboard/analytics", label: "Analitik", icon: BarChart3, color: "orange" },
];

const colorMap: Record<string, string> = {
  blue: "bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100",
  green: "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100",
  purple: "bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100",
  orange: "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100",
};

export default function DashboardNotFound() {
  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-[60vh]">
      <div className="max-w-lg w-full text-center">
        {/* 404 Header */}
        <div className="relative mb-6">
          <h1 className="text-8xl font-black text-transparent bg-clip-text bg-linear-to-b from-indigo-200 to-indigo-100 leading-none select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="p-3 bg-white rounded-xl shadow-lg border border-indigo-100">
              <MapPin className="w-7 h-7 text-indigo-500" />
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="px-8 pt-8 pb-4">
            <h2 className="text-xl font-bold text-gray-900">
              Halaman Dashboard Tidak Ditemukan
            </h2>
            <p className="text-gray-500 mt-2 text-sm leading-relaxed">
              Fitur atau halaman ini belum tersedia atau URL-nya tidak sesuai.
            </p>
          </div>

          {/* Quick Navigation */}
          <div className="px-8 pb-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Navigasi Cepat
            </p>
            <div className="grid grid-cols-2 gap-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all active:scale-[0.98] ${colorMap[link.color]}`}
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Search hint */}
          <div className="px-8 pb-4">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <p className="text-xs text-gray-500">
                Pastikan URL sudah benar, atau gunakan navigasi di sidebar
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="px-8 pb-8 flex gap-3">
            <Link
              href="/dashboard"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-linear-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-600 transition-all shadow-md shadow-indigo-100 active:scale-[0.98]"
            >
              <LayoutDashboard className="w-4 h-4" />
              Ke Dashboard
            </Link>
            <Link
              href="/"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all active:scale-[0.98]"
            >
              <Home className="w-4 h-4" />
              Beranda
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

