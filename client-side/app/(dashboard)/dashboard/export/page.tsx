"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Download,
  FileSpreadsheet,
  FileText,
  ShoppingCart,
  Boxes,
  Calendar,
  ArrowRight,
  Loader2,
  CheckCircle2,
  FileDown,
  Table,
  BarChart3,
} from "lucide-react";

type ExportFormat = "csv" | "xlsx";
type ExportType = "sales" | "stock" | "movements" | "inventory-all" | "bakery-bookings";

interface ExportOption {
  id: ExportType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  endpoint: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: "sales",
    title: "Data Penjualan",
    description: "Semua transaksi dengan detail produk, pendapatan, HPP, profit, dan margin",
    icon: ShoppingCart,
    color: "indigo",
    endpoint: "/api/export/sales",
  },
  {
    id: "stock",
    title: "Stok Inventori",
    description: "Daftar bahan, stok saat ini, status, dan nilai total inventori",
    icon: Boxes,
    color: "emerald",
    endpoint: "/api/export/inventory?type=stock",
  },
  {
    id: "movements",
    title: "Pergerakan Stok",
    description: "Riwayat masuk/keluar bahan baku (max 1000 record terakhir)",
    icon: BarChart3,
    color: "blue",
    endpoint: "/api/export/inventory?type=movements",
  },
  {
    id: "inventory-all",
    title: "Inventori Lengkap (Excel)",
    description: "Stok + pergerakan dalam 1 file Excel multi-sheet",
    icon: Table,
    color: "purple",
    endpoint: "/api/export/inventory?type=all",
  },
  {
    id: "bakery-bookings",
    title: "Bakery Bookings",
    description: "Order bakery live dari server yang sama dengan bookings, calendar, dan production",
    icon: Boxes,
    color: "amber",
    endpoint: "",
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; icon: string; text: string; ring: string }> = {
  indigo: {
    bg: "bg-indigo-50",
    border: "border-indigo-100 hover:border-indigo-300",
    icon: "bg-indigo-100 text-indigo-600",
    text: "text-indigo-700",
    ring: "ring-indigo-200",
  },
  emerald: {
    bg: "bg-emerald-50",
    border: "border-emerald-100 hover:border-emerald-300",
    icon: "bg-emerald-100 text-emerald-600",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-100 hover:border-blue-300",
    icon: "bg-blue-100 text-blue-600",
    text: "text-blue-700",
    ring: "ring-blue-200",
  },
  purple: {
    bg: "bg-purple-50",
    border: "border-purple-100 hover:border-purple-300",
    icon: "bg-purple-100 text-purple-600",
    text: "text-purple-700",
    ring: "ring-purple-200",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-100 hover:border-amber-300",
    icon: "bg-amber-100 text-amber-600",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
};

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadBlob(blob: Blob, filename: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

interface BakeryExportOrderItem {
  quantity?: number;
  productName?: string;
  size?: string;
}

interface BakeryExportAddress {
  label?: string;
  addressLine?: string;
  area?: string;
}

interface BakeryExportOrder {
  id: string;
  bookingCode?: string;
  resi?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryDate?: string;
  deliverySlot?: string;
  orderStatus?: string;
  paymentStatus?: string;
  items?: BakeryExportOrderItem[];
  deliveryAddresses?: BakeryExportAddress[];
  basePrice?: number;
  addOnTotal?: number;
  deliveryFee?: number;
  manualAdjustment?: number;
  totalPrice?: number;
  downPaymentAmount?: number;
  remainingBalance?: number;
  shippingQuote?: {
    provider?: string;
    courierServiceName?: string;
    price?: number;
    eta?: string;
    distanceKm?: number;
  } | null;
  shipment?: {
    trackingNumber?: string;
    status?: string;
    externalOrderId?: string;
  } | null;
  simulations?: {
    productionWhatsappSent?: boolean;
    customerWhatsappSent?: boolean;
    calendarEventCreated?: boolean;
    googleSheetsSynced?: boolean;
  } | null;
}

interface BakeryOrdersApiResponse {
  success?: boolean;
  error?: string;
  data?: {
    orders?: BakeryExportOrder[];
  };
}

function buildBakeryExportRows(orders: BakeryExportOrder[]) {
  return orders.map((order) => {
    const items = (order.items ?? [])
      .map(
        (item) =>
          `${Math.max(1, Number(item.quantity) || 1)}x ${item.productName || "-"} (${item.size || "-"})`,
      )
      .join(" | ");
    const addresses = (order.deliveryAddresses ?? [])
      .map(
        (address) =>
          `${address.label || "-"}: ${address.addressLine || "-"} (${address.area || "-"})`,
      )
      .join(" | ");

    return {
      orderId: order.id,
      bookingCode: order.bookingCode || "",
      resi: order.resi || "",
      customerName: order.customerName || "",
      customerPhone: order.customerPhone || "",
      deliveryDate: order.deliveryDate || "",
      deliverySlot: order.deliverySlot || "",
      orderStatus: order.orderStatus || "",
      paymentStatus: order.paymentStatus || "",
      items,
      deliveryAddresses: addresses,
      basePrice: Number(order.basePrice || 0),
      addOnTotal: Number(order.addOnTotal || 0),
      deliveryFee: Number(order.deliveryFee || 0),
      manualAdjustment: Number(order.manualAdjustment || 0),
      totalPrice: Number(order.totalPrice || 0),
      downPaymentAmount: Number(order.downPaymentAmount || 0),
      remainingBalance: Number(order.remainingBalance || 0),
      shippingProvider: order.shippingQuote?.provider || "",
      shippingService: order.shippingQuote?.courierServiceName || "",
      shippingPrice: Number(order.shippingQuote?.price || 0),
      shippingEta: order.shippingQuote?.eta || "",
      shippingDistanceKm: Number(order.shippingQuote?.distanceKm || 0),
      trackingNumber: order.shipment?.trackingNumber || "",
      shipmentStatus: order.shipment?.status || "",
      shipmentOrderId: order.shipment?.externalOrderId || "",
      automationProductionWa: order.simulations?.productionWhatsappSent ? "yes" : "no",
      automationCustomerWa: order.simulations?.customerWhatsappSent ? "yes" : "no",
      automationCalendar: order.simulations?.calendarEventCreated ? "yes" : "no",
      automationSheets: order.simulations?.googleSheetsSynced ? "yes" : "no",
    };
  });
}

export default function ExportPage() {
  const [selected, setSelected] = useState<ExportType>("sales");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const selectedOption = EXPORT_OPTIONS.find((o) => o.id === selected)!;

  async function handleExport() {
    setExporting(true);
    setLastExport(null);

    try {
      if (selected === "bakery-bookings") {
        const response = await fetch("/api/bookings/orders", {
          cache: "no-store",
          credentials: "include",
        });
        const payload =
          (await response.json().catch(() => ({}))) as BakeryOrdersApiResponse;

        if (!response.ok || !payload.success || !Array.isArray(payload.data?.orders)) {
          throw new Error(payload.error || "Gagal memuat data bakery dari server");
        }

        const orders = payload.data.orders;
        const filteredOrders = orders.filter((order) => {
          if (startDate && order.deliveryDate && order.deliveryDate < startDate) return false;
          if (endDate && order.deliveryDate && order.deliveryDate > endDate) return false;
          return true;
        });

        if (filteredOrders.length === 0) {
          toast.error("Data bakery belum ada untuk di-export pada rentang tanggal tersebut.");
          return;
        }

        const rows = buildBakeryExportRows(filteredOrders);

        const dateLabel =
          startDate && endDate
            ? `${startDate}_${endDate}`
            : new Date().toISOString().split("T")[0];
        const filename = `bakery_bookings_${dateLabel}.${format}`;

        if (format === "xlsx") {
          const XLSX = await import("xlsx");
          const sheet = XLSX.utils.json_to_sheet(rows);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, sheet, "Bakery Bookings");
          const binary = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
          downloadBlob(
            new Blob([binary], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }),
            filename
          );
        } else {
          const headers = Object.keys(rows[0] || {});
          const lines = [
            headers.map(csvEscape).join(","),
            ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(",")),
          ];
          const csv = "\uFEFF" + lines.join("\n");
          downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
        }

        setLastExport(filename);
        toast.success(`Berhasil mengexport ${filename}`);
        return;
      }

      const params = new URLSearchParams();
      params.set("format", format);

      if (selected === "sales") {
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
      }

      const baseEndpoint = selectedOption.endpoint;
      const separator = baseEndpoint.includes("?") ? "&" : "?";
      const url = `${baseEndpoint}${separator}${params.toString()}`;

      const res = await fetch(url, { credentials: "include" });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export gagal" }));
        toast.error(err.error || "Export gagal");
        return;
      }

      // Get filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
      const filename = filenameMatch?.[1] || `export_${Date.now()}.${format}`;

      const blob = await res.blob();
      downloadBlob(blob, filename);

      setLastExport(filename);
      toast.success(`Berhasil mengexport ${filename}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengexport data");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="p-2 sm:p-2.5 bg-linear-to-br from-green-500 to-emerald-500 rounded-xl text-white">
            <Download className="w-5 h-5 sm:w-7 sm:h-7" />
          </div>
          Export Data
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Download data transaksi &amp; inventori dalam format CSV atau Excel untuk laporan akhir bulan, pajak, atau
          pembukuan
        </p>
      </motion.div>

      {/* Data Type Selection */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Pilih Data</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EXPORT_OPTIONS.map((opt) => {
            const c = COLOR_MAP[opt.color];
            const isActive = selected === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  setSelected(opt.id);
                  // Force xlsx for inventory-all
                  if (opt.id === "inventory-all") setFormat("xlsx");
                }}
                className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  isActive ? `${c.border} ${c.bg} ring-2 ${c.ring}` : "border-gray-100 hover:border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isActive ? c.icon : "bg-gray-100 text-gray-400"}`}
                  >
                    <opt.icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className={`font-semibold ${isActive ? c.text : "text-gray-700"}`}>{opt.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{opt.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Settings Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Pengaturan Export</h3>
        </div>

        <div className="p-6 space-y-6">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Format File</label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormat("xlsx")}
                disabled={selected === "inventory-all"}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition cursor-pointer ${
                  format === "xlsx"
                    ? "border-green-400 bg-green-50 text-green-700"
                    : "border-gray-100 bg-white text-gray-500 hover:border-gray-200"
                }`}
              >
                <FileSpreadsheet className="w-5 h-5" />
                <div className="text-left">
                  <p className="font-semibold text-sm">Excel (.xlsx)</p>
                  <p className="text-xs opacity-70">Kompatibel dengan Excel &amp; Google Sheets</p>
                </div>
              </button>
              <button
                onClick={() => setFormat("csv")}
                disabled={selected === "inventory-all"}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition cursor-pointer ${
                  format === "csv"
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-gray-100 bg-white text-gray-500 hover:border-gray-200"
                } ${selected === "inventory-all" ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <FileText className="w-5 h-5" />
                <div className="text-left">
                  <p className="font-semibold text-sm">CSV (.csv)</p>
                  <p className="text-xs opacity-70">Format universal, ukuran kecil</p>
                </div>
              </button>
            </div>
          </div>

          {/* Date Range (only for sales) */}
          {(selected === "sales" || selected === "bakery-bookings") && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Rentang Tanggal (opsional)
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Dari</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-300 text-black placeholder-gray-400"
                  />
                </div>
                <div className="flex items-end pb-2.5">
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Sampai</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-300 text-black placeholder-gray-400"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Kosongkan untuk mengexport semua data</p>
            </div>
          )}
        </div>

        {/* Export Button */}
        <div className="p-6 bg-gray-50 border-t border-gray-100">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-linear-to-r from-green-500 to-emerald-500 text-white rounded-xl text-sm font-bold hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition shadow-lg shadow-green-100 active:scale-[0.98]"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Mengexport...
                </>
              ) : (
                <>
                  <FileDown className="w-5 h-5" />
                  Unduh {format.toUpperCase()}
                </>
              )}
            </button>

            {lastExport && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-sm text-green-600"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-medium">{lastExport}</span>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Info Cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <InfoCard
          icon="📊"
          title="Laporan Pajak"
          description="Export data penjualan bulanan untuk pelaporan pajak UMKM"
        />
        <InfoCard icon="📋" title="Audit Stok" description="Bandingkan stok digital dengan stok fisik di toko Anda" />
        <InfoCard
          icon="💰"
          title="Analisis Profit"
          description="Buka di Excel untuk analisis margin dan HPP lebih detail"
        />
      </motion.div>
    </div>
  );
}

function InfoCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="p-4 bg-white rounded-xl border border-gray-100">
      <span className="text-2xl">{icon}</span>
      <h4 className="font-semibold text-gray-800 mt-2 text-sm">{title}</h4>
      <p className="text-xs text-gray-400 mt-1">{description}</p>
    </div>
  );
}
