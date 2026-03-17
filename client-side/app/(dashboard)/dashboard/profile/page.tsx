"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { useBusiness } from "@/context/BusinessContext";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
import {
  User,
  Mail,
  Calendar,
  Shield,
  Edit3,
  Check,
  X,
  Lock,
  Eye,
  EyeOff,
  Building2,
  Package,
  ShoppingCart,
  DollarSign,
  Loader2,
  RefreshCw,
  Sparkles,
  Clock,
  KeyRound,
  ChevronRight,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProfileData {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    businessCount: number;
    totalProducts: number;
    totalSales: number;
    totalRevenue: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function timeAgo(d: string) {
  // Use a stable reference: always computed on the client (never during SSR).
  // Callers must ensure this runs inside a useEffect or event handler.
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Hari ini";
  if (days === 1) return "Kemarin";
  if (days < 30) return `${days} hari lalu`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} bulan lalu`;
  const years = Math.floor(months / 12);
  return `${years} tahun lalu`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ProfilePage() {
  const { data: session } = useSession();
  const { business } = useBusiness();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  // Client-only values to avoid SSR/client hydration mismatches
  const [updatedAgoLabel, setUpdatedAgoLabel] = useState("");
  const [currentYear, setCurrentYear] = useState("");

  // Edit name
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Change password
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const isOAuth = !!session?.user; // Google login = has session

  // Compute time-dependent labels only on the client
  useEffect(() => {
    setCurrentYear(String(new Date().getFullYear()));
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/auth/profile");
      if (res.success) {
        setProfile(res.data);
        setNameVal(res.data.name);
        // Compute time-relative label on client after data arrives
        setUpdatedAgoLabel(timeAgo(res.data.updatedAt));
      }
    } catch {
      toast.error("Gagal memuat profil");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  /* ---- Save name ---- */
  async function handleSaveName() {
    if (!nameVal.trim() || nameVal.trim().length < 2) {
      return toast.error("Nama minimal 2 karakter");
    }
    setSavingName(true);
    try {
      const res = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: nameVal.trim() }),
      });
      if (res.success) {
        toast.success("Nama berhasil diperbarui");
        setEditingName(false);
        await fetchProfile();
      }
    } catch {
      toast.error("Gagal menyimpan nama");
    } finally {
      setSavingName(false);
    }
  }

  /* ---- Change password ---- */
  async function handleChangePw() {
    if (!currentPw || !newPw) return toast.error("Semua field wajib diisi");
    if (newPw.length < 6) return toast.error("Password baru minimal 6 karakter");
    if (newPw !== confirmPw) return toast.error("Konfirmasi password tidak cocok");

    setSavingPw(true);
    try {
      const res = await apiFetch("/api/auth/profile/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: currentPw,
          newPassword: newPw,
        }),
      });
      if (res.success) {
        toast.success("Password berhasil diubah!");
        setShowPwForm(false);
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengubah password");
    } finally {
      setSavingPw(false);
    }
  }

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
        <User className="w-12 h-12 mb-3" />
        <p>Profil tidak ditemukan</p>
      </div>
    );
  }

  const stats = profile.stats;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* ───── Header ───── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-linear-to-br from-violet-500 to-fuchsia-500 rounded-xl text-white">
              <User className="w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            Profile
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Kelola informasi akun dan keamanan Anda</p>
        </div>
        <button
          onClick={fetchProfile}
          className="self-start flex items-center gap-2 px-4 py-2 text-sm text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </motion.div>

      {/* ───── Profile Hero Card ───── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden bg-white rounded-2xl shadow-lg border border-gray-100"
      >
        {/* Gradient top */}
        <div className="h-32 bg-linear-to-r from-violet-500 via-purple-500 to-fuchsia-500 relative">
          {/* Decorative circles */}
          <div className="absolute top-4 right-8 w-20 h-20 bg-white/10 rounded-full" />
          <div className="absolute bottom-2 right-24 w-10 h-10 bg-white/10 rounded-full" />
          <div className="absolute top-6 left-12 w-14 h-14 bg-white/5 rounded-full" />
        </div>

        <div className="px-6 sm:px-8 pb-8 -mt-14 relative">
          {/* Avatar */}
          <div className="flex items-end gap-5 mb-6">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-linear-to-br from-violet-400 to-fuchsia-500 flex items-center justify-center text-white text-2xl sm:text-3xl font-bold shadow-xl border-4 border-white">
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt="avatar"
                  width={96}
                  height={96}
                  className="w-full h-full rounded-2xl object-cover"
                />
              ) : (
                getInitials(profile.name || "U")
              )}
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-2">
                {isOAuth && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/90 backdrop-blur text-xs font-bold text-violet-700 rounded-full border border-violet-100">
                    <svg className="w-3 h-3" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Google
                  </span>
                )}
                {!isOAuth && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/90 backdrop-blur text-xs font-bold text-gray-600 rounded-full border border-gray-200">
                    <Mail className="w-3 h-3" />
                    Email
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Name & Email section */}
          <div className="space-y-5">
            {/* Name */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-5 h-5 text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Nama Lengkap</p>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={nameVal}
                      onChange={(e) => setNameVal(e.target.value)}
                      className="flex-1 px-3 py-2 border border-violet-200 rounded-lg text-lg font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-300"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="p-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 cursor-pointer disabled:opacity-50"
                    >
                      {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setEditingName(false);
                        setNameVal(profile.name);
                      }}
                      className="p-2 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <p className="text-xl font-bold text-gray-900">{profile.name}</p>
                    <button
                      onClick={() => setEditingName(true)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-violet-500 hover:bg-violet-50 rounded-lg transition-all cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email</p>
                <p className="text-gray-700 font-medium">{profile.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">Email tidak dapat diubah</p>
              </div>
            </div>

            {/* Account dates */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Calendar className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Bergabung</p>
                  <p className="text-gray-700 font-medium">{formatDate(profile.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Terakhir Diperbarui</p>
                  <p className="text-gray-700 font-medium">{updatedAgoLabel}</p>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Terakhir Diperbarui</p>
                  <p className="text-gray-700 font-medium">{timeAgo(profile.updatedAt)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ───── Stats Overview ───── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Ringkasan Akun
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <AccountStat
            icon={Building2}
            label="Bisnis"
            value={String(stats.businessCount)}
            sub={business?.name || "—"}
            color="indigo"
          />
          <AccountStat
            icon={Package}
            label="Produk"
            value={String(stats.totalProducts)}
            sub="Terdaftar"
            color="emerald"
          />
          <AccountStat
            icon={ShoppingCart}
            label="Penjualan"
            value={String(stats.totalSales)}
            sub="Transaksi lunas"
            color="blue"
          />
          <AccountStat
            icon={DollarSign}
            label="Total Omzet"
            value={formatRupiah(stats.totalRevenue)}
            sub="Semua waktu"
            color="violet"
          />
        </div>
      </motion.div>

      {/* ───── Security Section ───── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-xl">
              <Shield className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Keamanan Akun</h3>
              <p className="text-sm text-gray-500">Kelola password dan keamanan</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Password change toggle */}
          {isOAuth ? (
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-700">Password</p>
                <p className="text-sm text-gray-400">
                  Akun Google tidak memerlukan password. Keamanan dikelola oleh Google.
                </p>
              </div>
              <span className="px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-100">
                Aman
              </span>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowPwForm(!showPwForm)}
                className="w-full flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 group-hover:bg-orange-100 transition">
                  <KeyRound className="w-5 h-5 text-orange-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-gray-700">Ubah Password</p>
                  <p className="text-sm text-gray-400">Ganti password login Anda secara berkala</p>
                </div>
                <ChevronRight
                  className={`w-5 h-5 text-gray-300 transition-transform ${showPwForm ? "rotate-90" : ""}`}
                />
              </button>

              {/* Password form */}
              {showPwForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="mt-4 p-5 bg-orange-50/50 rounded-xl border border-orange-100 space-y-4"
                >
                  {/* Current password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password Saat Ini</label>
                    <div className="relative">
                      <input
                        type={showCurrentPw ? "text" : "password"}
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        placeholder="Masukkan password saat ini"
                        className="w-full px-4 py-2.5 pr-10 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-black placeholder-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password Baru</label>
                    <div className="relative">
                      <input
                        type={showNewPw ? "text" : "password"}
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="w-full px-4 py-2.5 pr-10 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-black placeholder-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* Strength indicator */}
                    {newPw && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              newPw.length < 6
                                ? "w-1/4 bg-red-400"
                                : newPw.length < 10
                                  ? "w-2/4 bg-amber-400"
                                  : newPw.length < 14
                                    ? "w-3/4 bg-blue-400"
                                    : "w-full bg-emerald-400"
                            }`}
                          />
                        </div>
                        <span className="text-xs text-gray-400">
                          {newPw.length < 6
                            ? "Lemah"
                            : newPw.length < 10
                              ? "Cukup"
                              : newPw.length < 14
                                ? "Kuat"
                                : "Sangat Kuat"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Confirm */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Konfirmasi Password Baru</label>
                    <input
                      type="password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      placeholder="Ulangi password baru"
                      className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 text-black placeholder-gray-400 ${
                        confirmPw && confirmPw !== newPw
                          ? "border-red-300 focus:ring-red-300"
                          : "border-gray-200 focus:ring-orange-300"
                      }`}
                    />
                    {confirmPw && confirmPw !== newPw && (
                      <p className="text-xs text-red-500 mt-1">Password tidak cocok</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleChangePw}
                      disabled={savingPw || !currentPw || !newPw || newPw !== confirmPw}
                      className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
                    >
                      {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Ubah Password
                    </button>
                    <button
                      onClick={() => {
                        setShowPwForm(false);
                        setCurrentPw("");
                        setNewPw("");
                        setConfirmPw("");
                      }}
                      className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 cursor-pointer transition"
                    >
                      Batal
                    </button>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* ───── Account Info Footer ───── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl text-xs text-gray-400"
      >
        <span>User ID: #{profile.id}</span>
        <span>Cuanify • {currentYear}</span>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function AccountStat({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
    indigo: {
      bg: "from-indigo-50 to-indigo-100/50 border-indigo-100",
      icon: "bg-indigo-100 text-indigo-600",
      text: "text-indigo-700",
    },
    emerald: {
      bg: "from-emerald-50 to-emerald-100/50 border-emerald-100",
      icon: "bg-emerald-100 text-emerald-600",
      text: "text-emerald-700",
    },
    blue: {
      bg: "from-blue-50 to-blue-100/50 border-blue-100",
      icon: "bg-blue-100 text-blue-600",
      text: "text-blue-700",
    },
    violet: {
      bg: "from-violet-50 to-violet-100/50 border-violet-100",
      icon: "bg-violet-100 text-violet-600",
      text: "text-violet-700",
    },
  };

  const c = colorMap[color] ?? colorMap.indigo;

  return (
    <div className={`p-4 rounded-xl bg-linear-to-br border ${c.bg}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${c.icon}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${c.text}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>
    </div>
  );
}
