"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  ShoppingBag, 
  Plus, 
  Trash2, 
  Calendar, 
  Search, 
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Package,
  Store
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface MarketplaceSale {
  id: number;
  marketplace: string;
  orderId: string | null;
  totalAmount: number;
  itemName: string | null;
  saleDate: string;
}

export default function MarketplacePage() {
  const [sales, setSales] = useState<MarketplaceSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    marketplace: "Tokopedia",
    orderId: "",
    totalAmount: "",
    itemName: "",
    saleDate: new Date().toISOString().split('T')[0]
  });

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bakery/marketplace");
      const json = await res.json();
      if (json.success) {
        setSales(json.data);
      }
    } catch (err) {
      toast.error("Gagal mengambil data penjualan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.totalAmount) return;

    try {
      const res = await fetch("/api/bakery/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Penjualan berhasil dicatat");
        setIsAdding(false);
        setFormData({
          marketplace: "Tokopedia",
          orderId: "",
          totalAmount: "",
          itemName: "",
          saleDate: new Date().toISOString().split('T')[0]
        });
        fetchSales();
      }
    } catch (err) {
      toast.error("Gagal menyimpan data");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus data penjualan ini?")) return;

    try {
      const res = await fetch(`/api/bakery/marketplace?id=${id}`, {
        method: "DELETE"
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Data berhasil dihapus");
        fetchSales();
      }
    } catch (err) {
      toast.error("Gagal menghapus data");
    }
  };

  const formatRp = (n: number) => 
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  const totalOmzet = sales.reduce((acc, curr) => acc + Number(curr.totalAmount), 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            Marketplace Sales
          </h1>
          <p className="text-slate-500 mt-1 font-medium italic">Rekap penjualan Tokopedia & Shopee (Non-Cashflow)</p>
        </div>
        
        <Button 
          onClick={() => setIsAdding(!isAdding)}
          className={`rounded-2xl px-6 py-6 h-auto text-lg font-bold shadow-xl transition-all duration-300 ${isAdding ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}
        >
          {isAdding ? "Batal" : <><Plus className="w-5 h-5 mr-2" /> Catat Penjualan</>}
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <TrendingUp className="w-20 h-20 text-indigo-600" />
            </div>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-widest">Total Omzet Marketplace</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-4xl font-black text-indigo-600 mb-1">{formatRp(totalOmzet)}</div>
                <div className="text-xs text-slate-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Akumulasi dari seluruh transaksi tercatat
                </div>
            </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <Package className="w-20 h-20 text-indigo-600" />
            </div>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-widest">Jumlah Pesanan</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-4xl font-black text-slate-800 mb-1">{sales.length} <span className="text-xl text-slate-400">Order</span></div>
                <div className="text-xs text-slate-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Berhasil diproses
                </div>
            </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-indigo-600 text-white overflow-hidden relative">
            <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-indigo-100 uppercase tracking-widest">Status Dana</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-black mb-1">Masuk Saldo E-commerce</div>
                <p className="text-xs text-indigo-100 leading-relaxed font-medium">
                    Dana tidak dihitung dalam Expected Cash kasir hari ini untuk mencegah selisih/nombok.
                </p>
            </CardContent>
        </Card>
      </div>

      {/* Add Form */}
      {isAdding && (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-white p-2 animate-in slide-in-from-top-4 duration-500">
          <CardHeader>
            <CardTitle className="text-xl font-black text-slate-800">Catat Penjualan Baru</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase px-1">Marketplace</label>
                <select 
                  className="w-full rounded-2xl border-slate-200 bg-slate-50 p-3 text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                  value={formData.marketplace}
                  onChange={e => setFormData({...formData, marketplace: e.target.value})}
                >
                  <option value="Tokopedia">Tokopedia</option>
                  <option value="Shopee">Shopee</option>
                  <option value="TikTok Shop">TikTok Shop</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase px-1">Tanggal</label>
                <input 
                  type="date"
                  className="w-full rounded-2xl border-slate-200 bg-slate-50 p-3 text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                  value={formData.saleDate}
                  onChange={e => setFormData({...formData, saleDate: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase px-1">Order ID / Resi</label>
                <Input 
                  placeholder="e.g. INV/2024..."
                  className="rounded-2xl border-slate-200 bg-slate-50 p-3 h-auto"
                  value={formData.orderId}
                  onChange={e => setFormData({...formData, orderId: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase px-1">Total (Rp)</label>
                <Input 
                  type="number"
                  placeholder="0"
                  className="rounded-2xl border-slate-200 bg-slate-50 p-3 h-auto font-bold text-indigo-600"
                  value={formData.totalAmount}
                  onChange={e => setFormData({...formData, totalAmount: e.target.value})}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 py-6 h-auto font-bold shadow-lg shadow-indigo-100">
                  Simpan Data
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* History Table */}
      <Card className="rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-50 flex flex-row items-center justify-between py-6 px-8">
            <CardTitle className="text-xl font-black text-slate-800">Riwayat Penjualan Marketplace</CardTitle>
            <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Cari pesanan..." className="pl-10 rounded-full bg-slate-50 border-none w-64 h-10" />
            </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tanggal</th>
                  <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Marketplace</th>
                  <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</th>
                  <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Omzet</th>
                  <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-20 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div>
                        <p className="mt-4 text-slate-400 font-bold">Memuat data...</p>
                    </td>
                  </tr>
                ) : sales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-20 text-center">
                      <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShoppingBag className="w-10 h-10 text-slate-300" />
                      </div>
                      <p className="text-slate-400 font-bold text-lg">Belum ada data penjualan tercatat</p>
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-indigo-50/30 transition-colors group">
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-slate-100 rounded-xl group-hover:bg-white transition-colors">
                                <Calendar className="w-4 h-4 text-slate-500" />
                            </div>
                            <div className="font-bold text-slate-700">{format(new Date(sale.saleDate), "dd MMM yyyy", { locale: id })}</div>
                        </div>
                      </td>
                      <td className="p-6">
                        <span className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                          sale.marketplace === "Tokopedia" ? "bg-emerald-100 text-emerald-700" : 
                          sale.marketplace === "Shopee" ? "bg-orange-100 text-orange-700" :
                          "bg-indigo-100 text-indigo-700"
                        }`}>
                          {sale.marketplace}
                        </span>
                      </td>
                      <td className="p-6 font-mono text-xs text-slate-500 font-bold">{sale.orderId || "-"}</td>
                      <td className="p-6 text-right">
                        <div className="font-black text-slate-800 text-lg">{formatRp(Number(sale.totalAmount))}</div>
                      </td>
                      <td className="p-6">
                        <div className="flex justify-center">
                            <button 
                                onClick={() => handleDelete(sale.id)}
                                className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 flex gap-4 items-start">
        <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-1" />
        <div className="space-y-1">
          <h4 className="font-bold text-amber-900">Tentang Penjualan Marketplace</h4>
          <p className="text-sm text-amber-800 leading-relaxed">
            Data di halaman ini khusus untuk mencatat omzet yang masuk ke saldo E-commerce (Tokped/Shopee). 
            Uang ini tidak masuk ke laci kasir tunai, sehingga tidak akan muncul di laporan "Expected Cash" saat tutup shift 
            untuk menghindari selisih kas. Data ini akan masuk ke laporan <b>Monthly Income</b> secara otomatis.
          </p>
        </div>
      </div>
    </div>
  );
}
