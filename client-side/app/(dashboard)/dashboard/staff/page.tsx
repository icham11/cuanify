"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Trash2,
  Loader2,
  Mail,
  Crown,
  BadgeCheck,
  Eye,
  EyeOff,
  Lock,
  User,
  Copy,
  Check,
  Link2,
  Pencil,
  X,
  Building2,
  ArrowRightLeft,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";

interface BusinessInfo {
  id: number;
  name: string;
}

interface StaffMember {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: "Owner" | "Cashier";
  businessId: number;
  businessName: string;
  joinedAt: string;
}

interface OwnerInfo {
  id: number;
  name: string;
  email: string;
}

type TabMode = "register" | "existing";

export default function StaffPage() {
  const { isOwner } = useRole();
  const [owner, setOwner] = useState<OwnerInfo | null>(null);
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [businesses, setBusinesses] = useState<BusinessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Tab mode
  const [tabMode, setTabMode] = useState<TabMode>("register");

  // Register new kasir form
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regBusinessId, setRegBusinessId] = useState<number | "">("");
  const [showPassword, setShowPassword] = useState(false);
  const [registering, setRegistering] = useState(false);

  // Existing user invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusinessId, setInviteBusinessId] = useState<number | "">("");
  const [inviting, setInviting] = useState(false);

  // Edit modal
  const [editMember, setEditMember] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editBusinessId, setEditBusinessId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  // Success card after registration
  const [newCashierInfo, setNewCashierInfo] = useState<{
    name: string;
    email: string;
    password: string;
    businessName: string;
    isNewAccount: boolean;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Filter
  const [filterBusinessId, setFilterBusinessId] = useState<number | "all">("all");

  // ── Fetch Staff ──
  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch("/api/staff", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setOwner(data.data.owner);
        setMembers(data.data.members);
        setBusinesses(data.data.businesses || []);
        // Set default business for register forms
        if (data.data.businesses?.length > 0) {
          setRegBusinessId((prev) => prev || data.data.businesses[0].id);
          setInviteBusinessId((prev) => prev || data.data.businesses[0].id);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner) fetchStaff();
    else setLoading(false);
  }, [isOwner, fetchStaff]);

  // ── Generate random password ──
  function generatePassword() {
    const chars = "abcdefghijkmnpqrstuvwxyz23456789";
    let pw = "";
    for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setRegPassword(pw);
    setShowPassword(true);
  }

  // ── Copy to clipboard ──
  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  // ── Register new kasir ──
  async function handleRegister() {
    if (!regName.trim() || !regEmail.trim() || !regPassword || !regBusinessId) return;
    setRegistering(true);
    try {
      const res = await fetch("/api/staff/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          password: regPassword,
          businessId: regBusinessId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Gagal mendaftarkan kasir");
        return;
      }
      const biz = businesses.find((b) => b.id === regBusinessId);
      toast.success(data.message || "Kasir berhasil didaftarkan!");
      setNewCashierInfo({
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        businessName: biz?.name || "",
        isNewAccount: data.data.isNewAccount,
      });
      setRegName("");
      setRegEmail("");
      setRegPassword("");
      fetchStaff();
    } catch {
      toast.error("Gagal mendaftarkan kasir baru");
    } finally {
      setRegistering(false);
    }
  }

  // ── Add existing user ──
  async function handleInvite() {
    if (!inviteEmail.trim() || !inviteBusinessId) return;
    setInviting(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          businessId: inviteBusinessId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Gagal menambahkan");
        return;
      }
      toast.success(`${data.data.name} berhasil ditambahkan sebagai Kasir!`);
      setInviteEmail("");
      fetchStaff();
    } catch {
      toast.error("Gagal menambahkan staff");
    } finally {
      setInviting(false);
    }
  }

  // ── Edit member ──
  function openEditModal(member: StaffMember) {
    setEditMember(member);
    setEditName(member.name);
    setEditBusinessId(member.businessId);
  }

  async function handleSaveEdit() {
    if (!editMember || !editName.trim() || !editBusinessId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          memberId: editMember.id,
          name: editName.trim(),
          businessId: editBusinessId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Gagal memperbarui");
        return;
      }
      toast.success("Staff berhasil diperbarui!");
      setEditMember(null);
      fetchStaff();
    } catch {
      toast.error("Gagal memperbarui staff");
    } finally {
      setSaving(false);
    }
  }

  // ── Remove member ──
  async function handleRemove(memberId: number) {
    if (!confirm("Yakin ingin menghapus staff ini? Mereka tidak bisa mengakses bisnis Anda lagi.")) return;
    setDeletingId(memberId);
    try {
      const res = await fetch("/api/staff", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ memberId }),
      });
      if (res.ok) {
        toast.success("Staff berhasil dihapus");
        fetchStaff();
      } else {
        toast.error("Gagal menghapus staff");
      }
    } catch {
      toast.error("Gagal menghapus staff");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Filtered members ──
  const filteredMembers =
    filterBusinessId === "all" ? members : members.filter((m) => m.businessId === filterBusinessId);

  // ── Access denied for Cashier ──
  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Shield className="w-16 h-16 mb-4 opacity-40" />
        <h2 className="text-xl font-bold text-gray-600">Akses Ditolak</h2>
        <p className="text-sm mt-2">Hanya pemilik bisnis yang bisa mengelola staff.</p>
      </div>
    );
  }

  // Business selector component
  const BusinessSelect = ({
    value,
    onChange,
    className = "",
  }: {
    value: number | "";
    onChange: (v: number) => void;
    className?: string;
  }) => (
    <div className={`relative ${className}`}>
      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none appearance-none cursor-pointer text-black disabled:text-black placeholder-gray-400"
      >
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* ═══ Header ═══ */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="p-2 sm:p-2.5 bg-linear-to-br from-indigo-500 to-purple-500 rounded-xl text-white">
            <Users className="w-5 h-5 sm:w-7 sm:h-7" />
          </div>
          Staff
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Daftarkan kasir, atur bisnis penempatan, dan kelola tim Anda.</p>
      </motion.div>

      {/* ═══ RBAC Explanation ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
      >
        <h3 className="font-bold text-gray-900 text-sm mb-3">Perbedaan Hak Akses</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-4 h-4 text-amber-600" />
              <span className="font-bold text-amber-800 text-sm">Owner (Bos)</span>
            </div>
            <ul className="text-xs text-amber-700 space-y-1">
              <li>✅ Akses semua fitur</li>
              <li>✅ Lihat margin & profit</li>
              <li>✅ Kelola produk & stok</li>
              <li>✅ Analytics & AI</li>
              <li>✅ Kelola staff</li>
              <li>✅ Export data</li>
            </ul>
          </div>
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="flex items-center gap-2 mb-2">
              <BadgeCheck className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-blue-800 text-sm">Kasir</span>
            </div>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>✅ POS (input transaksi)</li>
              <li>✅ Kasbon (catat piutang)</li>
              <li>✅ Riwayat penjualan</li>
              <li>
                ❌ <s>Margin & profit</s>
              </li>
              <li>
                ❌ <s>Kelola produk/stok</s>
              </li>
              <li>
                ❌ <s>Analytics & AI</s>
              </li>
            </ul>
          </div>
        </div>
      </motion.div>

      {/* ═══ Add Staff — Tabs ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      >
        {/* Tab bar */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => {
              setTabMode("register");
              setNewCashierInfo(null);
            }}
            className={`flex-1 py-3.5 text-sm font-semibold text-center transition cursor-pointer ${
              tabMode === "register"
                ? "text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <UserPlus className="w-4 h-4" />
              Daftarkan Kasir Baru
            </span>
          </button>
          <button
            onClick={() => {
              setTabMode("existing");
              setNewCashierInfo(null);
            }}
            className={`flex-1 py-3.5 text-sm font-semibold text-center transition cursor-pointer ${
              tabMode === "existing"
                ? "text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <Link2 className="w-4 h-4" />
              Tambah yang Sudah Punya Akun
            </span>
          </button>
        </div>

        <div className="p-5">
          {/* ── Tab: Register new kasir ── */}
          {tabMode === "register" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                Buat akun baru untuk kasir Anda. Pilih bisnis penempatan, lalu berikan email dan password kepada kasir.
              </p>

              {/* Success Card */}
              <AnimatePresence>
                {newCashierInfo && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="w-5 h-5 text-green-600" />
                      <p className="font-bold text-green-800 text-sm">
                        {newCashierInfo.isNewAccount ? "Akun kasir berhasil dibuat!" : "Kasir berhasil ditambahkan!"}
                      </p>
                    </div>
                    <p className="text-xs text-green-700">Berikan info berikut kepada kasir agar mereka bisa login:</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                        <div>
                          <p className="text-[10px] text-gray-400 font-medium">Nama</p>
                          <p className="text-sm font-semibold text-gray-900">{newCashierInfo.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                        <div>
                          <p className="text-[10px] text-gray-400 font-medium">Ditempatkan di</p>
                          <p className="text-sm font-semibold text-indigo-700">{newCashierInfo.businessName}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                        <div>
                          <p className="text-[10px] text-gray-400 font-medium">Email (untuk login)</p>
                          <p className="text-sm font-semibold text-gray-900">{newCashierInfo.email}</p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(newCashierInfo.email, "email")}
                          className="text-green-600 hover:text-green-800 p-1 cursor-pointer"
                        >
                          {copiedField === "email" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      {newCashierInfo.isNewAccount && (
                        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                          <div>
                            <p className="text-[10px] text-gray-400 font-medium">Password (untuk login)</p>
                            <p className="text-sm font-mono font-bold text-gray-900">{newCashierInfo.password}</p>
                          </div>
                          <button
                            onClick={() => copyToClipboard(newCashierInfo.password, "password")}
                            className="text-green-600 hover:text-green-800 p-1 cursor-pointer"
                          >
                            {copiedField === "password" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setNewCashierInfo(null)}
                      className="text-xs text-green-600 hover:text-green-800 font-medium mt-2 cursor-pointer"
                    >
                      ✕ Tutup & daftarkan lagi
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Registration form */}
              {!newCashierInfo && (
                <div className="space-y-3">
                  {/* Business selector */}
                  {businesses.length > 1 && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">Penempatan Bisnis</label>
                      <BusinessSelect value={regBusinessId} onChange={(v) => setRegBusinessId(v)} />
                    </div>
                  )}
                  {/* Name */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Nama Kasir</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Contoh: Siti Aisyah"
                        className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none text-black placeholder-gray-400"
                      />
                    </div>
                  </div>
                  {/* Email */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Email Kasir</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="Contoh: siti@gmail.com"
                        className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none text-black placeholder-gray-400"
                      />
                    </div>
                  </div>
                  {/* Password */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Password Kasir</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="w-full pl-9 pr-20 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none text-black placeholder-gray-400"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={generatePassword}
                      className="mt-1.5 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                    >
                      🎲 Generate password otomatis
                    </button>
                  </div>
                  {/* Submit */}
                  <button
                    onClick={handleRegister}
                    disabled={
                      registering ||
                      !regName.trim() ||
                      !regEmail.trim() ||
                      !regPassword ||
                      regPassword.length < 6 ||
                      !regBusinessId
                    }
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Daftarkan Kasir
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Existing user invite ── */}
          {tabMode === "existing" && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                Tambahkan user yang <strong>sudah punya akun</strong> sebagai kasir. Pilih bisnis penempatannya.
              </p>
              {businesses.length > 1 && (
                <BusinessSelect value={inviteBusinessId} onChange={(v) => setInviteBusinessId(v)} />
              )}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    placeholder="email@kasir.com"
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none text-black placeholder-gray-400"
                  />
                </div>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim() || !inviteBusinessId}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-2"
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Tambahkan
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ═══ Staff List ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold text-gray-900 text-sm">Daftar Anggota ({filteredMembers.length + 1})</h3>
          {/* Filter by business */}
          {businesses.length > 1 && (
            <select
              value={filterBusinessId}
              onChange={(e) => setFilterBusinessId(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 focus:ring-2 focus:ring-indigo-300 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Bisnis</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* Owner row */}
            {owner && (
              <div className="px-5 py-4 flex items-center gap-4 bg-amber-50/50">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                  <Crown className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{owner.name}</p>
                  <p className="text-xs text-gray-500">{owner.email}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {businesses.map((b) => (
                      <span
                        key={b.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded-full"
                      >
                        <Building2 className="w-2.5 h-2.5" /> {b.name}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full flex items-center gap-1 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" /> Owner
                </span>
              </div>
            )}

            {/* Members */}
            {filteredMembers.map((member) => (
              <div key={member.id} className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                  <BadgeCheck className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{member.name}</p>
                  <p className="text-xs text-gray-500">{member.email}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded-full">
                      <Building2 className="w-2.5 h-2.5" /> {member.businessName}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Bergabung: {new Date(member.joinedAt).toLocaleDateString("id-ID")}
                    </span>
                  </div>
                </div>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full shrink-0">
                  Kasir
                </span>
                {/* Edit button */}
                <button
                  onClick={() => openEditModal(member)}
                  className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                  title="Edit staff"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {/* Delete button */}
                <button
                  onClick={() => handleRemove(member.id)}
                  disabled={deletingId === member.id}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer disabled:opacity-50"
                  title="Hapus staff"
                >
                  {deletingId === member.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}

            {filteredMembers.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {members.length === 0
                    ? "Belum ada kasir. Daftarkan kasir pertama Anda!"
                    : "Tidak ada kasir di bisnis ini."}
                </p>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* ═══ Edit Modal ═══ */}
      <AnimatePresence>
        {editMember && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={() => setEditMember(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-indigo-600" />
                  Edit Staff
                </h3>
                <button onClick={() => setEditMember(null)} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Current info */}
                <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-500 space-y-1">
                  <p>
                    <span className="font-medium text-gray-700">Email:</span> {editMember.email}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">Bisnis saat ini:</span> {editMember.businessName}
                  </p>
                </div>

                {/* Name */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Nama</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Business assignment */}
                {businesses.length > 1 && (
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      Pindahkan ke Bisnis
                    </label>
                    <BusinessSelect value={editBusinessId} onChange={(v) => setEditBusinessId(v)} />
                    {editBusinessId !== editMember.businessId && (
                      <p className="mt-1.5 text-[11px] text-amber-600 font-medium">
                        ⚠️ Kasir akan dipindahkan dari <strong>{editMember.businessName}</strong> ke{" "}
                        <strong>{businesses.find((b) => b.id === editBusinessId)?.name}</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditMember(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || !editName.trim()}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Simpan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
