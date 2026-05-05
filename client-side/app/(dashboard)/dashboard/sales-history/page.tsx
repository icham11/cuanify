"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Search,
  Filter,
  Calendar,
  Package,
  TrendingUp,
  Clock,
  ShoppingCart,
  RefreshCw,
  Receipt,
  ChevronDown,
  ChevronUp,
  Wallet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { InvoiceViewer } from "../../components/InvoiceViewer";

/** Compact currency formatter — shows "3,04 jt" instead of "3.039.622.500" on small numbers */
function fmtCurrency(val: number): string {
  if (Math.abs(val) >= 1_000_000_000)
    return `Rp ${(val / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(val) >= 1_000_000)
    return `Rp ${(val / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (Math.abs(val) >= 1_000) return `Rp ${(val / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return `Rp ${val.toLocaleString("id-ID")}`;
}
function fmtFull(val: number): string {
  return `Rp ${val.toLocaleString("id-ID")}`;
}

interface Sale {
  id: number;
  transactionNumber: string;
  totalRevenue: number;
  totalCost: number;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: string;
  saleItems: Array<{
    id: number;
    quantity: number;
    priceAtSale: number;
    product: {
      name: string;
    };
  }>;
}

export default function SalesHistoryPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("All");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("All");
  const [dateFilter, setDateFilter] = useState<string>("All");
  const [productFilter, setProductFilter] = useState<string>("All");

  // Derived: unique product names from all loaded sales
  const allProductNames = useMemo(() => {
    const names = new Set<string>();
    sales.forEach((sale) => sale.saleItems.forEach((item) => names.add(item.product.name)));
    return Array.from(names).sort();
  }, [sales]);

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE));

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/sales");
      const data = await response.json();

      if (data.success && data.data) {
        // API returns: { success: true, data: { sales: [...], summary: {...} } }
        if (Array.isArray(data.data.sales)) {
          setSales(data.data.sales);
        } else if (Array.isArray(data.data)) {
          // Fallback: if data.data is directly an array
          setSales(data.data);
        } else {
          console.warn("API returned unexpected data structure:", data.data);
          setSales([]);
          setError("Invalid data format received");
        }
      } else if (data.error) {
        setSales([]);
        setError(data.error);
      } else {
        setSales([]);
        setError("Failed to fetch sales");
      }
    } catch (err) {
      setSales([]); // Ensure sales is always an array
      const msg = err instanceof Error ? err.message : "Failed to fetch sales";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = useCallback(() => {
    // Guard: Ensure sales is an array
    if (!Array.isArray(sales)) {
      setFilteredSales([]);
      return;
    }

    let filtered = [...sales];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (sale) =>
          sale.transactionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          sale.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          sale.customerEmail?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    // Payment method filter
    if (paymentMethodFilter !== "All") {
      filtered = filtered.filter((sale) => sale.paymentMethod === paymentMethodFilter);
    }

    // Payment status filter
    if (paymentStatusFilter !== "All") {
      filtered = filtered.filter((sale) => sale.paymentStatus === paymentStatusFilter);
    }

    // Product filter
    if (productFilter !== "All") {
      filtered = filtered.filter((sale) => sale.saleItems.some((item) => item.product.name === productFilter));
    }

    // Date filter
    if (dateFilter !== "All") {
      const now = new Date();
      filtered = filtered.filter((sale) => {
        const saleDate = new Date(sale.createdAt);
        const diffTime = now.getTime() - saleDate.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);

        switch (dateFilter) {
          case "Today":
            return diffDays < 1;
          case "Week":
            return diffDays < 7;
          case "Month":
            return diffDays < 30;
          default:
            return true;
        }
      });
    }

    setFilteredSales(filtered);
  }, [sales, searchQuery, paymentMethodFilter, paymentStatusFilter, dateFilter, productFilter]);

  useEffect(() => {
    applyFilters();
    setPage(1); // Reset to first page on filter change
  }, [applyFilters]);

  // Calculate statistics
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + Number(sale.totalRevenue), 0);
  const totalProfit = filteredSales.reduce(
    (sum, sale) => sum + (Number(sale.totalRevenue) - Number(sale.totalCost)),
    0,
  );
  const paidSales = filteredSales.filter((sale) => sale.paymentStatus === "Paid").length;

  // Pending breakdown
  const pendingSales = filteredSales.filter((sale) => sale.paymentStatus === "Pending");
  const pendingCount = pendingSales.length;
  const pendingRevenue = pendingSales.reduce((sum, sale) => sum + Number(sale.totalRevenue), 0);
  const pendingProfit = pendingSales.reduce(
    (sum, sale) => sum + (Number(sale.totalRevenue) - Number(sale.totalCost)),
    0,
  );
  const paidProfit = totalProfit - pendingProfit;

  // Pending grouped by payment method
  const pendingByMethod = pendingSales.reduce<Record<string, { count: number; amount: number }>>((acc, sale) => {
    const method = sale.paymentMethod || "Unknown";
    if (!acc[method]) acc[method] = { count: 0, amount: 0 };
    acc[method].count += 1;
    acc[method].amount += Number(sale.totalRevenue);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sales history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ═══ Header ═══ */}
      <div className="bg-linear-to-br from-indigo-600 via-purple-600 to-indigo-700 rounded-2xl p-4 sm:p-6 shadow-lg shadow-indigo-200/30">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-white">Sales History</h1>
            <p className="text-indigo-200 text-xs sm:text-sm mt-0.5">Semua transaksi bisnis Anda</p>
          </div>
          <button
            onClick={fetchSales}
            className="p-2 sm:px-4 sm:py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl transition text-sm font-medium backdrop-blur-sm border border-white/20 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Stats Grid — 2x2 on mobile, 4 cols on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            {
              label: "Transaksi",
              value: filteredSales.length.toString(),
              icon: Receipt,
            },
            {
              label: "Revenue",
              value: fmtCurrency(totalRevenue),
              icon: Wallet,
            },
            {
              label: "Profit",
              value: fmtCurrency(totalProfit),
              icon: TrendingUp,
            },
            {
              label: "Lunas",
              value: `${paidSales}/${filteredSales.length}`,
              icon: CheckCircle2,
            },
          ].map((s) => (
            <div key={s.label} className="bg-white/10 backdrop-blur-sm border border-white/15 p-2.5 sm:p-3 rounded-xl">
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-200" />
                <span className="text-indigo-200 text-[10px] sm:text-xs">{s.label}</span>
              </div>
              <p className="text-sm sm:text-lg font-bold text-white truncate">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Pending Breakdown (only if there are pending sales) ═══ */}
      {pendingCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="flex items-center gap-3 p-3 sm:p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500">Profit Lunas</p>
              <p className="text-sm sm:text-base font-bold text-gray-900 truncate">{fmtCurrency(paidProfit)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 sm:p-4 bg-amber-50 border border-amber-100 rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500">Profit Pending ({pendingCount})</p>
              <p className="text-sm sm:text-base font-bold text-gray-900 truncate">{fmtCurrency(pendingProfit)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 sm:p-4 bg-purple-50 border border-purple-100 rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500">Pending Revenue</p>
              <p className="text-sm sm:text-base font-bold text-gray-900 truncate">{fmtCurrency(pendingRevenue)}</p>
            </div>
          </div>
          {Object.keys(pendingByMethod).length > 0 && (
            <div className="sm:col-span-3 flex flex-wrap gap-1.5">
              {Object.entries(pendingByMethod).map(([method, info]) => (
                <span
                  key={method}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-medium text-gray-600"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {method}: {info.count}x ({fmtCurrency(info.amount)})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-100">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari transaksi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-black placeholder-gray-400"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <select
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
              className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none text-xs sm:text-sm text-black"
            >
              <option value="All">Semua Metode</option>
              <option value="Cash">Tunai</option>
              <option value="QRIS">QRIS</option>
              <option value="Transfer">Transfer</option>
              <option value="Digital">Digital</option>
              <option value="Kasbon">Kasbon</option>
            </select>
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none text-xs sm:text-sm text-black"
            >
              <option value="All">Semua Status</option>
              <option value="Paid">Lunas</option>
              <option value="Pending">Belum Lunas</option>
            </select>
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none text-xs sm:text-sm text-black"
            >
              <option value="All">Semua Waktu</option>
              <option value="Today">Hari Ini</option>
              <option value="Week">Minggu Ini</option>
              <option value="Month">Bulan Ini</option>
            </select>
          </div>
          <div className="relative">
            <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none text-xs sm:text-sm text-black"
            >
              <option value="All">Semua Produk</option>
              {allProductNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ═══ Mobile Card View (md:hidden) ═══ */}
      <div className="md:hidden space-y-2">
        {filteredSales.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">Tidak ada transaksi</p>
            <p className="text-xs">Coba ubah filter</p>
          </div>
        ) : (
          filteredSales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((sale) => (
            <div key={sale.id} className="bg-white border border-gray-100 rounded-xl p-3.5 hover:shadow-sm transition">
              {/* Top row: TXN number + status badge */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-mono font-medium text-gray-700 truncate max-w-[55%]">
                  {sale.transactionNumber}
                </p>
                {sale.paymentStatus === "Paid" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-green-100 text-green-700">
                    <CheckCircle2 className="w-3 h-3" /> Lunas
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">
                    <AlertCircle className="w-3 h-3" /> Pending
                  </span>
                )}
              </div>

              {/* Customer + date */}
              <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2.5">
                <span>{sale.customerName || "Guest"}</span>
                <span>
                  {new Date(sale.createdAt).toLocaleDateString("id-ID", {
                    timeZone: "Asia/Jakarta",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {/* Items summary */}
              <p className="text-[11px] text-gray-400 mb-2 truncate">
                {sale.saleItems
                  .slice(0, 3)
                  .map((item) => `${item.product.name} x${item.quantity}`)
                  .join(", ")}
                {sale.saleItems.length > 3 && ` +${sale.saleItems.length - 3} lainnya`}
              </p>

              {/* Bottom row: amount + payment method + invoice */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">{fmtFull(Number(sale.totalRevenue))}</p>
                  <p className="text-[10px] text-gray-400">
                    Profit: {fmtCurrency(Number(sale.totalRevenue) - Number(sale.totalCost))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                    {sale.paymentMethod}
                  </span>
                  {sale.paymentStatus === "Paid" && (
                    <InvoiceViewer saleId={sale.id} transactionNumber={sale.transactionNumber} />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ═══ Desktop Table (hidden on mobile) ═══ */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/80 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  No. Transaksi
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Pelanggan
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Jumlah
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Bayar
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Tanggal
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Invoice
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">Tidak ada transaksi</p>
                    <p className="text-xs mt-1">Coba ubah filter Anda</p>
                  </td>
                </tr>
              ) : (
                filteredSales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((sale, idx) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-indigo-50/50 transition"
                    style={{
                      opacity: 0,
                      animation: `fadeInUp 0.3s ease ${idx * 0.03}s forwards`,
                    }}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-medium text-gray-800">{sale.transactionNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">{sale.customerName || "Guest"}</p>
                      {sale.customerEmail && <p className="text-xs text-gray-400">{sale.customerEmail}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">{sale.saleItems.reduce((s, i) => s + i.quantity, 0)} item</p>
                      <p className="text-xs text-gray-400 truncate max-w-37.5">
                        {sale.saleItems
                          .slice(0, 2)
                          .map((i) => i.product.name)
                          .join(", ")}
                        {sale.saleItems.length > 2 && "..."}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{fmtFull(Number(sale.totalRevenue))}</p>
                      <p className="text-xs text-gray-400">
                        Profit: {fmtCurrency(Number(sale.totalRevenue) - Number(sale.totalCost))}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                        {sale.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {sale.paymentStatus === "Paid" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-100">
                          <CheckCircle2 className="w-3 h-3" /> Lunas
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                          <AlertCircle className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(sale.createdAt).toLocaleDateString("id-ID", {
                        timeZone: "Asia/Jakarta",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {sale.paymentStatus === "Paid" && (
                        <InvoiceViewer saleId={sale.id} transactionNumber={sale.transactionNumber} />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Pagination ═══ */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2">
          <button
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-indigo-600 font-semibold text-sm shadow-sm hover:bg-indigo-50 disabled:opacity-40 transition"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            ‹ Prev
          </button>
          <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">
            {page} / {totalPages}
          </span>
          <button
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-indigo-600 font-semibold text-sm shadow-sm hover:bg-indigo-50 disabled:opacity-40 transition"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}
