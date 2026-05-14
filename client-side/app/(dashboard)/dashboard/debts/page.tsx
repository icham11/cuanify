"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  BookOpen,
  Search,
  User,
  Phone,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Loader2,
  Receipt,
  ChevronDown,
  Banknote,
  AlertTriangle,
  Printer,
  MessageCircle,
  Users,
  Filter,
} from "lucide-react";
import StatTile from "@/app/components/StatTile";
import { useApiQuery } from "@/hooks/useApiQuery";
import {
  debtsListUrl,
  invalidateDebtsCaches,
  invalidateSalesCaches,
  invalidateAiInsightsCaches,
  API_CACHE_TTL_5_MIN_MS,
} from "@/lib/api/cache-keys";
import { useBusiness } from "@/context/BusinessContext";

const formatRupiah = (val: number) => `Rp ${val.toLocaleString("id-ID")}`;

interface DebtPaymentRecord {
  id: number;
  amount: number;
  notes: string | null;
  createdAt: string;
}

interface Debt {
  id: number;
  saleId: number;
  transactionNumber: string;
  customerName: string;
  customerPhone: string | null;
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  status: "Unpaid" | "Partial" | "Paid";
  notes: string | null;
  dueDate: string | null;
  createdAt: string;
  items: string;
  payments: DebtPaymentRecord[];
}

interface Summary {
  totalDebt: number;
  unpaidCount: number;
  totalCount: number;
}

interface CustomerSummary {
  name: string;
  phone: string | null;
  totalDebt: number;
  totalRemaining: number;
  count: number;
  overdueCount: number;
}

interface DebtsResponse {
  success?: boolean;
  data?: Debt[];
  summary?: Summary;
}

const STATUS_CONFIG = {
  Unpaid: { label: "Belum Bayar", color: "red", icon: AlertCircle },
  Partial: { label: "Cicilan", color: "amber", icon: Clock },
  Paid: { label: "Lunas", color: "green", icon: CheckCircle2 },
};

function isOverdue(debt: Debt): boolean {
  if (debt.status === "Paid" || !debt.dueDate) return false;
  return new Date(debt.dueDate) < new Date();
}

function daysOverdue(debt: Debt): number {
  if (!debt.dueDate) return 0;
  const diff = new Date().getTime() - new Date(debt.dueDate).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function daysUntilDue(debt: Debt): number | null {
  if (!debt.dueDate || debt.status === "Paid") return null;
  const diff = new Date(debt.dueDate).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function DebtsPage() {
  const { business } = useBusiness();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCustomerSummary, setShowCustomerSummary] = useState(false);

  // Pay modal
  const [payDebt, setPayDebt] = useState<Debt | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paying, setPaying] = useState(false);
  const [paySuccess, setPaySuccess] = useState<{
    debtId: number;
    amount: number;
    remaining: number;
    customerName: string;
    isFullyPaid: boolean;
  } | null>(null);

  // Receipt
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const debtsQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all" && statusFilter !== "overdue") {
      params.set("status", statusFilter);
    }
    if (search) params.set("search", search);
    return debtsListUrl(params);
  }, [search, statusFilter]);

  const debtsQuery = useApiQuery<DebtsResponse>(debtsQueryKey, {
    ttlMs: API_CACHE_TTL_5_MIN_MS,
  });
  const debts = debtsQuery.data?.data ?? [];
  const summary = debtsQuery.data?.summary ?? {
    totalDebt: 0,
    unpaidCount: 0,
    totalCount: 0,
  };
  const loading = debts.length === 0 && debtsQuery.isLoading;

  const fetchDebts = useCallback(
    async (options?: { force?: boolean }) => {
      await debtsQuery.refresh(options);
    },
    [debtsQuery],
  );

  // Computed data
  const overdueDebts = useMemo(() => debts.filter(isOverdue), [debts]);
  const overdueTotal = useMemo(() => overdueDebts.reduce((s, d) => s + d.remaining, 0), [overdueDebts]);

  const filteredDebts = useMemo(() => {
    let result = debts.slice();
    if (statusFilter === "overdue") {
      result = result.filter(isOverdue);
    }
    // Sort: overdue first, then by date
    return result.sort((a, b) => {
      const aOverdue = isOverdue(a) ? 1 : 0;
      const bOverdue = isOverdue(b) ? 1 : 0;
      if (bOverdue !== aOverdue) return bOverdue - aOverdue;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [debts, statusFilter]);

  const customerSummaries = useMemo(() => {
    const map = new Map<string, CustomerSummary>();
    debts
      .filter((d) => d.status !== "Paid")
      .forEach((d) => {
        const key = d.customerName.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.totalDebt += d.totalAmount;
          existing.totalRemaining += d.remaining;
          existing.count++;
          if (isOverdue(d)) existing.overdueCount++;
        } else {
          map.set(key, {
            name: d.customerName,
            phone: d.customerPhone,
            totalDebt: d.totalAmount,
            totalRemaining: d.remaining,
            count: 1,
            overdueCount: isOverdue(d) ? 1 : 0,
          });
        }
      });
    return Array.from(map.values()).sort((a, b) => b.totalRemaining - a.totalRemaining);
  }, [debts]);

  async function handlePay() {
    if (!payDebt || !payAmount || Number(payAmount) <= 0) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/debts/${payDebt.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: Number(payAmount),
          notes: payNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      await debtsQuery.mutate(
        (current) => {
          if (!current?.data) return current;
          const nextDebts = current.data
            .map((debt) => {
              if (debt.id !== payDebt.id) return debt;
              const totalPaid = debt.paidAmount + Number(data.data.amountPaid ?? 0);
              const remaining = Number(data.data.remaining ?? 0);
              return {
                ...debt,
                paidAmount: totalPaid,
                remaining,
                status: (data.data.isFullyPaid ? "Paid" : "Partial") as Debt["status"],
                payments: [
                  {
                    id: Date.now(),
                    amount: Number(data.data.amountPaid ?? 0),
                    notes: payNotes || null,
                    createdAt: new Date().toISOString(),
                  },
                  ...debt.payments,
                ],
              };
            })
            .filter((debt) => {
              if (statusFilter === "Unpaid") return debt.status === "Unpaid";
              if (statusFilter === "Partial") return debt.status === "Partial";
              if (statusFilter === "Paid") return debt.status === "Paid";
              return true;
            });

          return {
            ...current,
            data: nextDebts,
            summary: {
              totalDebt: nextDebts.reduce((sum, debt) => sum + debt.remaining, 0),
              unpaidCount: nextDebts.filter((debt) => debt.status !== "Paid").length,
              totalCount: nextDebts.length,
            },
          };
        },
        { revalidate: false },
      );
      setPaySuccess({
        debtId: payDebt.id,
        amount: data.data.amountPaid,
        remaining: data.data.remaining,
        customerName: payDebt.customerName,
        isFullyPaid: data.data.isFullyPaid,
      });
      toast.success(
        data.data.isFullyPaid
          ? `🎉 Kasbon ${payDebt.customerName} LUNAS!`
          : `Pembayaran ${formatRupiah(data.data.amountPaid)} berhasil.`,
      );
      setPayAmount("");
      setPayNotes("");
      invalidateDebtsCaches();
      invalidateSalesCaches();
      invalidateAiInsightsCaches();
      await fetchDebts({ force: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memproses pembayaran");
    } finally {
      setPaying(false);
    }
  }

  function printReceipt(debt: Debt, paymentAmount?: number) {
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    w.document.write(`<!DOCTYPE html><html><head><title>Bukti Kasbon</title>
      <style>
        body { font-family: 'Courier New', monospace; width: 300px; margin: 20px auto; font-size: 12px; color: #333; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #999; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        h2 { margin: 0 0 4px; font-size: 16px; }
        .status { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; display: inline-block; margin-top: 4px; }
        .unpaid { background: #FEE2E2; color: #DC2626; }
        .partial { background: #FEF3C7; color: #D97706; }
        .paid { background: #D1FAE5; color: #059669; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <div class="center">
        <h2>${business?.name || "Crumbella"}</h2>
        <p style="margin:0">${business?.location || ""}</p>
        <div class="divider"></div>
        <p class="bold">${paymentAmount ? "BUKTI PEMBAYARAN KASBON" : "BUKTI KASBON"}</p>
      </div>
      <div class="divider"></div>
      <div class="row"><span>No. Transaksi:</span><span class="bold">${debt.transactionNumber}</span></div>
      <div class="row"><span>Tanggal:</span><span>${now}</span></div>
      <div class="row"><span>Pelanggan:</span><span class="bold">${debt.customerName}</span></div>
      ${debt.customerPhone ? `<div class="row"><span>Telepon:</span><span>${debt.customerPhone}</span></div>` : ""}
      <div class="divider"></div>
      <div class="row"><span>Item:</span><span>${debt.items}</span></div>
      <div class="row"><span>Total Kasbon:</span><span class="bold">${formatRupiah(debt.totalAmount)}</span></div>
      ${paymentAmount ? `<div class="row"><span>Dibayar:</span><span class="bold" style="color:#059669">${formatRupiah(paymentAmount)}</span></div>` : ""}
      <div class="row"><span>Sudah Bayar:</span><span>${formatRupiah(debt.paidAmount + (paymentAmount || 0))}</span></div>
      <div class="row"><span>Sisa:</span><span class="bold" style="color:${debt.remaining - (paymentAmount || 0) > 0 ? "#DC2626" : "#059669"}">${formatRupiah(Math.max(0, debt.remaining - (paymentAmount || 0)))}</span></div>
      ${debt.dueDate ? `<div class="row"><span>Jatuh Tempo:</span><span>${new Date(debt.dueDate).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</span></div>` : ""}
      <div class="divider"></div>
      <div class="center">
        <span class="status ${debt.remaining - (paymentAmount || 0) <= 0 ? "paid" : debt.paidAmount > 0 || paymentAmount ? "partial" : "unpaid"}">
          ${debt.remaining - (paymentAmount || 0) <= 0 ? "✅ LUNAS" : debt.paidAmount > 0 || paymentAmount ? "⏳ CICILAN" : "⏰ BELUM BAYAR"}
        </span>
      </div>
      ${debt.notes ? `<div class="divider"></div><p style="font-size:11px;color:#666">Catatan: ${debt.notes}</p>` : ""}
      <div class="divider"></div>
      <p class="center" style="font-size:10px;color:#999;margin-top:8px">Dicetak oleh Crumbella<br/>${now}</p>
      </body></html>`);
    w.document.close();
    w.print();
  }

  function getWhatsAppLink(debt: Debt): string | null {
    if (!debt.customerPhone) return null;
    const phone = debt.customerPhone.replace(/\D/g, "").replace(/^0/, "62");
    const remaining = formatRupiah(debt.remaining);
    const msg = encodeURIComponent(
      `Halo ${debt.customerName}, ini dari ${business?.name || "kami"}. Mengingatkan kasbon Anda sebesar ${remaining} untuk transaksi ${debt.transactionNumber}${debt.dueDate ? ` (jatuh tempo: ${new Date(debt.dueDate).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })})` : ""}. Terima kasih 🙏`,
    );
    return `https://wa.me/${phone}?text=${msg}`;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
    <div className="space-y-6 max-w-full">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="p-2 sm:p-2.5 bg-linear-to-br from-amber-500 to-orange-500 rounded-xl text-white">
            <BookOpen className="w-5 h-5 sm:w-7 sm:h-7" />
          </div>
          Kasbon
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Catat dan kelola piutang pelanggan. Bayar sebagian atau lunas.</p>
      </motion.div>

      {debtsQuery.errorMessage && debts.length === 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {debtsQuery.errorMessage}
        </div>
      )}

      {/* ══ Overdue Warning Banner ══ */}
      {overdueDebts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-bold text-red-800 text-sm">{overdueDebts.length} kasbon sudah jatuh tempo!</p>
              <p className="text-xs text-red-600">Total piutang lewat tempo: {formatRupiah(overdueTotal)}</p>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter("overdue")}
            className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition cursor-pointer shrink-0"
          >
            Lihat Semua
          </button>
        </motion.div>
      )}

      {/* Summary Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        <StatTile icon={DollarSign} label="Total Piutang" value={formatRupiah(summary.totalDebt)} color="red" />
        <StatTile icon={Clock} label="Belum Lunas" value={String(summary.unpaidCount)} color="amber" />
        <StatTile icon={AlertTriangle} label="Jatuh Tempo" value={String(overdueDebts.length)} color="red" />
        <StatTile icon={Receipt} label="Total Kasbon" value={String(summary.totalCount)} color="indigo" />
      </motion.div>

      {/* Customer Summary Toggle */}
      {customerSummaries.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <button
            onClick={() => setShowCustomerSummary(!showCustomerSummary)}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer transition"
          >
            <Users className="w-4 h-4" />
            {showCustomerSummary ? "Sembunyikan" : "Lihat"} Ringkasan per Pelanggan ({customerSummaries.length})
            <ChevronDown className={`w-4 h-4 transition ${showCustomerSummary ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {showCustomerSummary && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {customerSummaries.map((c) => (
                    <div
                      key={c.name}
                      className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3"
                    >
                      <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{c.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {c.count} kasbon
                          {c.overdueCount > 0 ? ` · ${c.overdueCount} jatuh tempo` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-red-600">{formatRupiah(c.totalRemaining)}</p>
                        <button
                          onClick={() => {
                            setSearchInput(c.name);
                            setSearch(c.name);
                            setStatusFilter("all");
                          }}
                          className="text-[10px] text-indigo-600 font-medium hover:underline cursor-pointer"
                        >
                          <Filter className="w-3 h-3 inline" /> Filter
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Filter + Search */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-50">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nama pelanggan..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none text-black placeholder-gray-400"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: "all", label: "Semua" },
            { key: "overdue", label: "🔴 Jatuh Tempo" },
            { key: "Unpaid", label: "Belum Bayar" },
            { key: "Partial", label: "Cicilan" },
            { key: "Paid", label: "Lunas" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                statusFilter === f.key
                  ? f.key === "overdue"
                    ? "bg-red-600 text-white"
                    : "bg-amber-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Debt List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filteredDebts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <BookOpen className="w-16 h-16 mb-4 opacity-40" />
          <p className="text-lg font-medium text-gray-500">
            {statusFilter === "overdue" ? "Tidak ada kasbon jatuh tempo 🎉" : "Belum ada kasbon"}
          </p>
          <p className="text-sm">Kasbon akan muncul saat transaksi dengan metode &quot;Kasbon&quot; di POS</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDebts.map((debt) => {
            const cfg = STATUS_CONFIG[debt.status];
            const StatusIcon = cfg.icon;
            const isExp = expandedId === debt.id;
            const overdue = isOverdue(debt);
            const overdueDays = daysOverdue(debt);
            const daysLeft = daysUntilDue(debt);
            const waLink = getWhatsAppLink(debt);

            return (
              <motion.div
                key={debt.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                  overdue ? "border-red-300 ring-1 ring-red-200" : "border-gray-100"
                }`}
              >
                {/* Main row */}
                <div
                  className={`px-5 py-4 flex items-center gap-4 cursor-pointer transition ${
                    overdue ? "bg-red-50/50 hover:bg-red-50" : "hover:bg-gray-50/50"
                  }`}
                  onClick={() => setExpandedId(isExp ? null : debt.id)}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      overdue
                        ? "bg-red-200"
                        : cfg.color === "red"
                          ? "bg-red-100"
                          : cfg.color === "amber"
                            ? "bg-amber-100"
                            : "bg-green-100"
                    }`}
                  >
                    {overdue ? (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    ) : (
                      <StatusIcon
                        className={`w-5 h-5 ${
                          cfg.color === "red"
                            ? "text-red-600"
                            : cfg.color === "amber"
                              ? "text-amber-600"
                              : "text-green-600"
                        }`}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">{debt.customerName}</p>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          overdue
                            ? "bg-red-200 text-red-800"
                            : cfg.color === "red"
                              ? "bg-red-100 text-red-700"
                              : cfg.color === "amber"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-green-100 text-green-700"
                        }`}
                      >
                        {overdue ? `LEWAT ${overdueDays} HARI` : cfg.label}
                      </span>
                      {daysLeft !== null && daysLeft > 0 && daysLeft <= 3 && !overdue && (
                        <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                          ⏰ {daysLeft} hari lagi
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {debt.transactionNumber} · {debt.items}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">{formatRupiah(debt.totalAmount)}</p>
                    {debt.remaining > 0 && (
                      <p className={`text-xs font-medium ${overdue ? "text-red-700" : "text-red-500"}`}>
                        Sisa: {formatRupiah(debt.remaining)}
                      </p>
                    )}
                  </div>

                  <ChevronDown className={`w-4 h-4 text-gray-400 transition shrink-0 ${isExp ? "rotate-180" : ""}`} />
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExp && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
                        {/* Info grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <User className="w-3.5 h-3.5" /> {debt.customerName}
                          </div>
                          {debt.customerPhone && (
                            <div className="flex items-center gap-1.5 text-gray-500">
                              <Phone className="w-3.5 h-3.5" /> {debt.customerPhone}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Calendar className="w-3.5 h-3.5" />{" "}
                            {new Date(debt.createdAt).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}
                          </div>
                          {debt.dueDate && (
                            <div
                              className={`flex items-center gap-1.5 ${overdue ? "text-red-600 font-semibold" : "text-gray-500"}`}
                            >
                              <Clock className="w-3.5 h-3.5" />
                              {overdue ? "⚠️ " : ""}Jatuh tempo:{" "}
                              {new Date(debt.dueDate).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}
                            </div>
                          )}
                        </div>

                        {/* Progress bar */}
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Sudah bayar: {formatRupiah(debt.paidAmount)}</span>
                            <span>{Math.round((debt.paidAmount / debt.totalAmount) * 100)}%</span>
                          </div>
                          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                debt.status === "Paid" ? "bg-green-500" : overdue ? "bg-red-500" : "bg-amber-500"
                              }`}
                              style={{
                                width: `${Math.min(100, (debt.paidAmount / debt.totalAmount) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>

                        {/* Payment history */}
                        {debt.payments.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-600 mb-1.5">Riwayat Pembayaran</p>
                            <div className="space-y-1">
                              {debt.payments.map((p) => (
                                <div
                                  key={p.id}
                                  className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-gray-100"
                                >
                                  <div className="flex items-center gap-2">
                                    <DollarSign className="w-3 h-3 text-green-500" />
                                    <span className="font-medium text-green-700">{formatRupiah(p.amount)}</span>
                                    {p.notes && <span className="text-gray-400">— {p.notes}</span>}
                                  </div>
                                  <span className="text-gray-400">
                                    {new Date(p.createdAt).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {debt.notes && <p className="text-xs text-gray-400 italic">Catatan: {debt.notes}</p>}

                        {/* Action buttons */}
                        <div className="flex gap-2 flex-wrap">
                          {debt.status !== "Paid" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPayDebt(debt);
                                setPayAmount(String(debt.remaining));
                                setPaySuccess(null);
                              }}
                              className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Banknote className="w-4 h-4" /> Bayar
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              printReceipt(debt);
                            }}
                            className="py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition cursor-pointer flex items-center gap-2"
                          >
                            <Printer className="w-4 h-4" /> Cetak
                          </button>
                          {waLink && debt.status !== "Paid" && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="py-2.5 px-4 bg-green-100 text-green-700 rounded-xl text-sm font-medium hover:bg-green-200 transition cursor-pointer flex items-center gap-2"
                            >
                              <MessageCircle className="w-4 h-4" /> WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ══ Pay Modal ══ */}
      <AnimatePresence>
        {payDebt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => {
              setPayDebt(null);
              setPaySuccess(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            >
              {/* Success state */}
              {paySuccess ? (
                <div className="text-center space-y-4" ref={receiptRef}>
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {paySuccess.isFullyPaid ? "🎉 Kasbon Lunas!" : "Pembayaran Berhasil"}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">{paySuccess.customerName}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Dibayar:</span>
                      <span className="font-bold text-green-600">{formatRupiah(paySuccess.amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Sisa:</span>
                      <span className={`font-bold ${paySuccess.remaining > 0 ? "text-red-600" : "text-green-600"}`}>
                        {paySuccess.remaining > 0 ? formatRupiah(paySuccess.remaining) : "Rp 0 (Lunas)"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => printReceipt(payDebt, paySuccess.amount)}
                      className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Printer className="w-4 h-4" /> Cetak Bukti
                    </button>
                    <button
                      onClick={() => {
                        setPayDebt(null);
                        setPaySuccess(null);
                      }}
                      className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition cursor-pointer"
                    >
                      Tutup
                    </button>
                  </div>
                </div>
              ) : (
                /* Pay form */
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                      <Receipt className="w-5 h-5 text-green-600" /> Bayar Kasbon
                    </h3>
                    <button
                      onClick={() => setPayDebt(null)}
                      className="text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div
                      className={`rounded-xl p-3 ${isOverdue(payDebt) ? "bg-red-50 border border-red-200" : "bg-gray-50"}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{payDebt.customerName}</p>
                        {isOverdue(payDebt) && (
                          <span className="text-[10px] bg-red-200 text-red-800 font-bold px-2 py-0.5 rounded-full">
                            LEWAT {daysOverdue(payDebt)} HARI
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{payDebt.items}</p>
                      <div className="flex justify-between mt-2 text-sm">
                        <span className="text-gray-500">Sisa hutang:</span>
                        <span className="font-bold text-red-600">{formatRupiah(payDebt.remaining)}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Jumlah Bayar (Rp)</label>
                      <input
                        type="number"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        max={payDebt.remaining}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-green-300 focus:outline-none"
                        placeholder="0"
                      />
                      {/* Quick-pay presets */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
                        {[
                          { label: "Lunas", value: payDebt.remaining },
                          {
                            label: "½",
                            value: Math.round(payDebt.remaining / 2),
                          },
                          ...[10000, 20000, 50000, 100000, 200000, 500000]
                            .filter(
                              (v) =>
                                v <= payDebt.remaining &&
                                v !== payDebt.remaining &&
                                v !== Math.round(payDebt.remaining / 2),
                            )
                            .slice(0, 6)
                            .map((v) => ({ label: `${v / 1000}rb`, value: v })),
                        ]
                          .filter((v, i, a) => a.findIndex((x) => x.value === v.value) === i && v.value > 0)
                          .slice(0, 4)
                          .map((preset) => (
                            <button
                              key={preset.value}
                              onClick={() => setPayAmount(String(preset.value))}
                              className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer ${
                                Number(payAmount) === preset.value
                                  ? "bg-green-600 text-white border-green-600"
                                  : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Catatan (opsional)</label>
                      <input
                        type="text"
                        value={payNotes}
                        onChange={(e) => setPayNotes(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-300 focus:outline-none"
                        placeholder="Contoh: Bayar sebagian di kasir pagi"
                      />
                    </div>

                    <button
                      onClick={handlePay}
                      disabled={paying || !payAmount || Number(payAmount) <= 0}
                      className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      {paying ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          Bayar {payAmount ? formatRupiah(Number(payAmount)) : ""}
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
}
