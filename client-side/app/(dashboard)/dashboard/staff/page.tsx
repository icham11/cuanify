"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  ChevronDown,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import {
  staffListUrl,
  invalidateStaffCaches,
  API_CACHE_TTL_5_MIN_MS,
} from "@/lib/api/cache-keys";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { useRole } from "@/context/RoleContext";
import { TEAM_MEMBERS_UPDATED_EVENT } from "@/lib/staff/events";

interface BusinessInfo {
  id: number;
  name: string;
}

interface StaffMember {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Cashier" | "Staff";
  businessId: number;
  businessName: string;
  joinedAt: string;
}

type ManagedRole = "Admin" | "Cashier" | "Staff";

interface OwnerInfo {
  id: number;
  name: string;
  email: string;
}

interface StaffResponse {
  success?: boolean;
  data?: {
    owner?: OwnerInfo | null;
    members?: StaffMember[];
    businesses?: BusinessInfo[];
  };
  error?: string;
}

type TabMode = "register" | "existing";

export default function StaffPage() {
  const { isOwner, loading: isRoleLoading } = useRole();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Tab mode
  const [tabMode, setTabMode] = useState<TabMode>("register");

  // Register new team member form
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState<ManagedRole>("Staff");
  const [regBusinessId, setRegBusinessId] = useState<number | "">("");
  const [showPassword, setShowPassword] = useState(false);
  const [registering, setRegistering] = useState(false);

  // Existing user invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ManagedRole>("Staff");
  const [inviteBusinessId, setInviteBusinessId] = useState<number | "">("");
  const [inviting, setInviting] = useState(false);

  // Edit modal
  const [editMember, setEditMember] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<ManagedRole>("Staff");
  const [editBusinessId, setEditBusinessId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  // Success card after registration
  const [newCashierInfo, setNewCashierInfo] = useState<{
    name: string;
    email: string;
    password: string;
    role: ManagedRole;
    businessName: string;
    isNewAccount: boolean;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Filter
  const [filterBusinessId, setFilterBusinessId] = useState<number | "all">("all");

  const notifyTeamMembersUpdated = useCallback(() => {
    window.dispatchEvent(new Event(TEAM_MEMBERS_UPDATED_EVENT));
  }, []);

  const staffQuery = useApiQuery<StaffResponse>(staffListUrl, {
    enabled: !isRoleLoading && isOwner,
    ttlMs: API_CACHE_TTL_5_MIN_MS,
  });
  const owner = staffQuery.data?.data?.owner ?? null;
  const members = useMemo(
    () => staffQuery.data?.data?.members ?? [],
    [staffQuery.data?.data?.members],
  );
  const businesses = useMemo(
    () => staffQuery.data?.data?.businesses ?? [],
    [staffQuery.data?.data?.businesses],
  );
  const loading = isOwner && staffQuery.isLoading;

  // ── Fetch Staff ──
  const fetchStaff = useCallback(
    async (options?: { force?: boolean }) => {
      await staffQuery.refresh(options);
    },
    [staffQuery],
  );

  useEffect(() => {
    if (!isOwner || !staffQuery.data?.success) return;
    notifyTeamMembersUpdated();
  }, [isOwner, notifyTeamMembersUpdated, staffQuery.data]);

  useEffect(() => {
    if (businesses.length === 0) return;
    setRegBusinessId((prev) => prev || businesses[0].id);
    setInviteBusinessId((prev) => prev || businesses[0].id);
  }, [businesses]);

  // ── Generate random password ──
  function generatePassword() {
    const chars = "abcdefghijkmnpqrstuvwxyz23456789";
    const randomArray = new Uint32Array(8);
    window.crypto.getRandomValues(randomArray);
    let pw = "";
    for (let i = 0; i < 8; i++) {
      pw += chars[randomArray[i] % chars.length];
    }
    setRegPassword(pw);
    setShowPassword(true);
  }

  // ── Copy to clipboard ──
  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  // ── Register new team member ──
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
          role: regRole,
          businessId: regBusinessId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Gagal mendaftarkan anggota tim");
        return;
      }
      const biz = businesses.find((b) => b.id === regBusinessId);
      toast.success(data.message || `${regRole} berhasil didaftarkan!`);
      setNewCashierInfo({
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        role: regRole,
        businessName: biz?.name || "",
        isNewAccount: data.data.isNewAccount,
      });
      setRegName("");
      setRegEmail("");
      setRegPassword("");
      invalidateStaffCaches();
      await fetchStaff({ force: true });
    } catch {
      toast.error("Gagal mendaftarkan anggota tim baru");
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
          role: inviteRole,
          businessId: inviteBusinessId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Gagal menambahkan");
        return;
      }
      toast.success(`${data.data.name} berhasil ditambahkan sebagai ${data.data.role || inviteRole}!`);
      setInviteEmail("");
      invalidateStaffCaches();
      await fetchStaff({ force: true });
    } catch {
      toast.error("Gagal menambahkan anggota tim");
    } finally {
      setInviting(false);
    }
  }

  // ── Edit member ──
  function openEditModal(member: StaffMember) {
    setEditMember(member);
    setEditName(member.name);
    setEditRole(member.role as ManagedRole);
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
          role: editRole,
          businessId: editBusinessId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Gagal memperbarui");
        return;
      }
      toast.success("Anggota tim berhasil diperbarui!");
      setEditMember(null);
      invalidateStaffCaches();
      await fetchStaff({ force: true });
    } catch {
      toast.error("Gagal memperbarui anggota tim");
    } finally {
      setSaving(false);
    }
  }

  // ── Remove member ──
  async function handleRemove(memberId: number) {
    if (!confirm("Yakin ingin menghapus anggota tim ini? Mereka tidak bisa mengakses bisnis Anda lagi.")) return;
    setDeletingId(memberId);
    try {
      const res = await fetch("/api/staff", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ memberId }),
      });
      if (res.ok) {
        toast.success("Anggota tim berhasil dihapus");
        invalidateStaffCaches();
        await fetchStaff({ force: true });
      } else {
        toast.error("Gagal menghapus anggota tim");
      }
    } catch {
      toast.error("Gagal menghapus anggota tim");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Filtered members ──
  const filteredMembers =
    filterBusinessId === "all" ? members : members.filter((m) => m.businessId === filterBusinessId);

  const sortedMembers = useMemo(() => {
    const roleWeight: Record<ManagedRole, number> = {
      Admin: 0,
      Staff: 1,
      Cashier: 2,
    };

    return filteredMembers
      .slice()
      .sort((a, b) => {
        const weightA = roleWeight[(a.role as ManagedRole) ?? "Staff"] ?? 9;
        const weightB = roleWeight[(b.role as ManagedRole) ?? "Staff"] ?? 9;
        if (weightA !== weightB) return weightA - weightB;
        return a.name.localeCompare(b.name);
      });
  }, [filteredMembers]);

  const roleCounts = useMemo(() => {
    let admin = 0;
    let cashier = 0;
    let staff = 0;

    for (const member of filteredMembers) {
      if (member.role === "Admin") admin += 1;
      if (member.role === "Cashier") cashier += 1;
      if (member.role === "Staff") staff += 1;
    }

    return {
      owner: owner ? 1 : 0,
      admin,
      cashier,
      staff,
    };
  }, [filteredMembers, owner]);

  // ── Access denied for Cashier ──
  if (isRoleLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-5 text-sm text-gray-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat hak akses staff...
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Shield className="w-16 h-16 mb-4 opacity-40" />
        <h2 className="text-xl font-bold text-gray-600">Akses Ditolak</h2>
        <p className="text-sm mt-2">Hanya pemilik bisnis yang bisa mengelola staff.</p>
      </div>
    );
  }

  if (staffQuery.errorMessage && members.length === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
        {staffQuery.errorMessage}
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
    <div className="mx-auto max-w-7xl px-3 pb-10 pt-4 text-[#2f1e13] sm:px-4">
      <div className="space-y-5 rounded-[34px] border border-[#e4d2c4] bg-[#f8efe5] px-4 pb-6 pt-3 shadow-[0_26px_55px_-42px_rgba(94,53,30,0.6)] sm:px-5 xl:px-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-[28px]"
        >
          <GradientPageHeader
            title="Staff"
            description="Daftarkan admin, staff, dan kasir, lalu atur bisnis penempatan mereka."
            icon={Users}
          />
        </motion.div>

        {/* ═══ RBAC Explanation ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-[24px] border border-[#dcc8b8] bg-[#fffaf6] p-5 shadow-[0_16px_30px_-26px_rgba(52,31,20,0.28)]"
        >
          <h3 className="mb-3 text-sm font-bold text-[#2f1e13]">Perbedaan Hak Akses</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-[22px] border border-[#efd9b1] bg-[#fff3d9] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-bold text-amber-800">Owner (Bos)</span>
              </div>
              <ul className="space-y-1 text-xs text-amber-700">
                <li>✅ Akses semua fitur</li>
                <li>✅ Lihat margin & profit</li>
                <li>✅ Kelola produk & stok</li>
                <li>✅ Analytics & AI</li>
                <li>✅ Kelola staff</li>
                <li>✅ Export data</li>
              </ul>
            </div>
            <div className="rounded-[22px] border border-[#e8d7cd] bg-[#fff8f3] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#b15d2f]" />
                <span className="text-sm font-bold text-[#8a6047]">Admin</span>
              </div>
              <ul className="space-y-1 text-xs text-[#8a6047]">
                <li>✅ Kelola operasional harian</li>
                <li>✅ Akses penjualan & produksi</li>
                <li>✅ Lihat data tim sesuai bisnis</li>
                <li>❌ <s>Kelola owner & hak penuh bisnis</s></li>
                <li>❌ <s>Ubah kepemilikan bisnis</s></li>
              </ul>
            </div>
            <div className="rounded-[22px] border border-[#d8e6ef] bg-[#eef6fb] p-4">
              <div className="mb-2 flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-[#43639b]" />
                <span className="text-sm font-bold text-[#43639b]">Kasir</span>
              </div>
              <ul className="space-y-1 text-xs text-[#43639b]">
                <li>✅ POS (input transaksi)</li>
                <li>✅ Kasbon (catat piutang)</li>
                <li>✅ Riwayat penjualan</li>
                <li>❌ <s>Margin & profit</s></li>
                <li>❌ <s>Kelola produk/stok</s></li>
                <li>❌ <s>Analytics & AI</s></li>
              </ul>
            </div>
          </div>
        </motion.div>

      {/* ═══ Add Staff — Tabs ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="overflow-hidden rounded-[24px] border border-[#dcc8b8] bg-[#fffaf6] shadow-[0_16px_30px_-26px_rgba(52,31,20,0.28)]"
      >
        {/* Tab bar */}
        <div className="flex flex-col border-b border-[#ead9cc] sm:flex-row">
          <button
            onClick={() => {
              setTabMode("register");
              setNewCashierInfo(null);
            }}
            className={`flex-1 py-3.5 text-sm font-semibold text-center transition cursor-pointer ${
              tabMode === "register"
                ? "border-b-2 border-[#cb6837] bg-[#fff4ea] text-[#b15d2f]"
                : "text-[#8a6047] hover:bg-[#fbf1e8] hover:text-[#6f4933]"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <UserPlus className="w-4 h-4" />
              Daftarkan Anggota Baru
            </span>
          </button>
          <button
            onClick={() => {
              setTabMode("existing");
              setNewCashierInfo(null);
            }}
            className={`flex-1 py-3.5 text-sm font-semibold text-center transition cursor-pointer ${
              tabMode === "existing"
                ? "border-b-2 border-[#cb6837] bg-[#fff4ea] text-[#b15d2f]"
                : "text-[#8a6047] hover:bg-[#fbf1e8] hover:text-[#6f4933]"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <Link2 className="w-4 h-4" />
              Tambah yang Sudah Punya Akun
            </span>
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {/* ── Tab: Register new member ── */}
          {tabMode === "register" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                Buat akun baru untuk admin/staff/kasir. Pilih bisnis penempatan, lalu berikan email dan password ke anggota tim.
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
                        {newCashierInfo.isNewAccount
                          ? `Akun ${newCashierInfo.role.toLowerCase()} berhasil dibuat!`
                          : `${newCashierInfo.role} berhasil ditambahkan!`}
                      </p>
                    </div>
                    <p className="text-xs text-green-700">Berikan info berikut kepada anggota tim agar mereka bisa login:</p>
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
                          <p className="text-[10px] text-gray-400 font-medium">Role</p>
                          <p className="text-sm font-semibold text-gray-900">{newCashierInfo.role}</p>
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
                <div className="grid gap-3 lg:grid-cols-2">
                  {/* Business selector */}
                  {businesses.length > 1 && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">Penempatan Bisnis</label>
                      <BusinessSelect value={regBusinessId} onChange={(v) => setRegBusinessId(v)} />
                    </div>
                  )}
                  {/* Name */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Nama Anggota Tim</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Contoh: Siti Aisyah"
                        className="w-full rounded-xl border border-[#dcc7b8] bg-[#fbf4ed] py-2.5 pl-9 pr-4 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f0bf9f]"
                      />
                    </div>
                  </div>
                  {/* Email */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Email Anggota Tim</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="Contoh: siti@gmail.com"
                        className="w-full rounded-xl border border-[#dcc7b8] bg-[#fbf4ed] py-2.5 pl-9 pr-4 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f0bf9f]"
                      />
                    </div>
                  </div>
                  {/* Password */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Password Anggota Tim</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="w-full rounded-xl border border-[#dcc7b8] bg-[#fbf4ed] py-2.5 pl-9 pr-20 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f0bf9f]"
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
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Role</label>
                    <div className="relative">
                      <select
                        value={regRole}
                        onChange={(e) => setRegRole(e.target.value as ManagedRole)}
                        className="w-full appearance-none rounded-xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 py-2.5 pr-9 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f0bf9f]"
                      >
                        <option value="Admin">Admin Operasional</option>
                        <option value="Staff">Staff Produksi</option>
                        <option value="Cashier">Kasir</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-700" />
                    </div>
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#cb6837] py-3 text-sm font-bold text-white transition hover:bg-[#b95a2c] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Daftarkan {regRole}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Existing user invite ── */}
          {tabMode === "existing" && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                Tambahkan user yang <strong>sudah punya akun</strong> sebagai anggota tim. Pilih role dan bisnis penempatannya.
              </p>
              {businesses.length > 1 && (
                <BusinessSelect value={inviteBusinessId} onChange={(v) => setInviteBusinessId(v)} />
              )}
              <div className="relative">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as ManagedRole)}
                className="w-full appearance-none rounded-xl border border-[#dcc7b8] bg-[#fbf4ed] px-3 py-2.5 pr-9 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f0bf9f]"
                >
                  <option value="Admin">Admin Operasional</option>
                  <option value="Staff">Staff Produksi</option>
                  <option value="Cashier">Kasir</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-700" />
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    placeholder="email@staff.com"
                    className="w-full rounded-xl border border-[#dcc7b8] bg-[#fbf4ed] py-2.5 pl-9 pr-4 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f0bf9f]"
                  />
                </div>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim() || !inviteBusinessId}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#cb6837] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#b95a2c] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Tambahkan {inviteRole}
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
        className="overflow-hidden rounded-[24px] border border-[#dcc8b8] bg-[#fffaf6] shadow-[0_16px_30px_-26px_rgba(52,31,20,0.28)]"
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Daftar Anggota ({filteredMembers.length + 1})</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                <ShieldCheck className="h-3 w-3" /> Owner {roleCounts.owner}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                <Shield className="h-3 w-3" /> Admin {roleCounts.admin}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                <BadgeCheck className="h-3 w-3" /> Cashier {roleCounts.cashier}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <Users className="h-3 w-3" /> Staff {roleCounts.staff}
              </span>
            </div>
          </div>
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
              <div className="flex flex-col gap-3 bg-[#fff4de] px-5 py-4 md:flex-row md:items-center">
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
            {sortedMembers.map((member) => {
              const isAdmin = member.role === "Admin";
              const isCashier = member.role === "Cashier";
              const isStaff = member.role === "Staff";
              const avatarClass = isAdmin
                ? "bg-violet-100"
                : isCashier
                  ? "bg-blue-100"
                  : "bg-emerald-100";
              const iconClass = isAdmin
                ? "text-violet-600"
                : isCashier
                  ? "text-blue-600"
                  : "text-emerald-600";
              const roleBadgeClass = isAdmin
                ? "bg-violet-100 text-violet-700"
                : isCashier
                  ? "bg-blue-100 text-blue-700"
                  : "bg-emerald-100 text-emerald-700";
              const roleLabel = isAdmin ? "Admin" : isCashier ? "Cashier" : "Staff";

              return (
              <div key={member.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-[#fbf2ea] md:flex-row md:items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${avatarClass}`}>
                  {isAdmin ? (
                    <Shield className={`w-5 h-5 ${iconClass}`} />
                  ) : isCashier ? (
                    <BadgeCheck className={`w-5 h-5 ${iconClass}`} />
                  ) : isStaff ? (
                    <Users className={`w-5 h-5 ${iconClass}`} />
                  ) : (
                    <User className={`w-5 h-5 ${iconClass}`} />
                  )}
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
                <div className="flex flex-wrap items-center gap-2 md:ml-auto md:flex-nowrap">
                  <span className={`px-3 py-1 text-xs font-bold rounded-full shrink-0 ${roleBadgeClass}`}>
                    {roleLabel}
                  </span>
                  <button
                    onClick={() => openEditModal(member)}
                    className="rounded-lg p-2 text-indigo-400 transition hover:bg-indigo-50 hover:text-indigo-600 cursor-pointer"
                    title="Edit anggota tim"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemove(member.id)}
                    disabled={deletingId === member.id}
                    className="rounded-lg p-2 text-red-400 transition hover:bg-red-50 hover:text-red-600 cursor-pointer disabled:opacity-50"
                    title="Hapus anggota tim"
                  >
                    {deletingId === member.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
            })}

            {filteredMembers.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {members.length === 0
                    ? "Belum ada anggota tim. Daftarkan anggota pertama Anda!"
                    : "Tidak ada anggota tim di bisnis ini."}
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
                  Edit Anggota Tim
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
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Role</label>
                  <div className="relative">
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as ManagedRole)}
                      className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 pr-9 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="Admin">Admin Operasional</option>
                      <option value="Staff">Staff Produksi</option>
                      <option value="Cashier">Kasir</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-700" />
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
                        ⚠️ Anggota tim akan dipindahkan dari <strong>{editMember.businessName}</strong> ke{" "}
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
    </div>
  );
}
