"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { BakeryAttendanceReconciliation, BakeryStaffSetting } from "@/lib/bakery/settings";

interface Props {
  reconciliationData: BakeryAttendanceReconciliation[];
  onUpdate: (data: BakeryAttendanceReconciliation[]) => void;
  staffSettings: BakeryStaffSetting[];
  currentMonthKey: string;
}

export default function AttendanceReconciliation({
  reconciliationData,
  onUpdate,
  staffSettings,
  currentMonthKey,
}: Props) {
  const [expandedMonth, setExpandedMonth] = useState(currentMonthKey);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [manualLateCountInput, setManualLateCountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");

  const monthsByKey = useMemo(() => {
    const months = new Set<string>();
    reconciliationData.forEach((item) => months.add(item.monthKey));
    months.add(currentMonthKey);
    return Array.from(months).sort().reverse();
  }, [reconciliationData, currentMonthKey]);

  const reconciliationByMonthAndStaff = useMemo(() => {
    const map = new Map<string, Map<number, BakeryAttendanceReconciliation>>();
    reconciliationData.forEach((item) => {
      const month = map.get(item.monthKey) ?? new Map();
      month.set(item.staffUserId, item);
      map.set(item.monthKey, month);
    });
    return map;
  }, [reconciliationData]);

  const handleAdd = () => {
    if (!selectedStaffId || !manualLateCountInput) {
      return;
    }

    const staff = staffSettings.find((s) => s.userId === selectedStaffId);
    if (!staff) return;

    const manualCount = Math.max(0, parseInt(manualLateCountInput, 10) || 0);
    const id = `${expandedMonth}-${selectedStaffId}`;

    const existing = reconciliationData.find((item) => item.id === id);
    if (existing) {
      const updated = reconciliationData.map((item) =>
        item.id === id
          ? { ...item, manualLateCount: manualCount, note: noteInput }
          : item,
      );
      onUpdate(updated);
    } else {
      const newItem: BakeryAttendanceReconciliation = {
        id,
        monthKey: expandedMonth,
        staffUserId: selectedStaffId,
        staffName: staff.name,
        manualLateCount: manualCount,
        note: noteInput,
      };
      onUpdate([...reconciliationData, newItem]);
    }

    setSelectedStaffId(null);
    setManualLateCountInput("");
    setNoteInput("");
  };

  const handleDelete = (id: string) => {
    onUpdate(reconciliationData.filter((item) => item.id !== id));
  };

  return (
    <div className="rounded-[24px] border border-[#ddcbbb] bg-[#f4e9dc] shadow-[0_16px_30px_-26px_rgba(52,31,20,0.35)] space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-[#f26a21]" />
        <h3 className="text-lg font-bold text-[#243b5a]">
          📋 Attendance Reconciliation
        </h3>
      </div>

      <p className="text-xs text-[#8a6047]">
        Input manual berapa kali karyawan telat menurut catatan owner untuk di-verifikasi dengan sistem.
      </p>

      {/* Month Tabs */}
      <div className="flex flex-wrap gap-2">
        {monthsByKey.map((monthKey) => (
          <button
            key={monthKey}
            onClick={() => setExpandedMonth(monthKey)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              expandedMonth === monthKey
                ? "bg-[#cb6837] text-white"
                : "border border-[#dcc7b8] bg-[#fbf4ed] text-[#8a6047] hover:border-[#cb6837]"
            }`}
          >
            {formatMonthLabel(monthKey)}
          </button>
        ))}
      </div>

      {/* Input Section */}
      <div className="rounded-[18px] border border-[#e2d1c3] bg-[#fbf4ed] p-3 space-y-2">
        <label className="block text-xs font-semibold text-[#8a6047]">
          Pilih Karyawan
        </label>
        <select
          value={selectedStaffId ?? ""}
          onChange={(e) => setSelectedStaffId(e.target.value ? parseInt(e.target.value, 10) : null)}
          className="w-full rounded-lg border border-[#dcc7b8] px-2.5 py-2 text-sm bg-white text-[#2f1e13] outline-none focus:ring-2 focus:ring-[#cb6837]/30"
        >
          <option value="">Pilih...</option>
          {staffSettings.filter(s => s.isActive).map((staff) => (
            <option key={staff.userId} value={staff.userId}>
              {staff.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-[#8a6047] mb-1">
              Jumlah Telat
            </label>
            <input
              type="number"
              min="0"
              value={manualLateCountInput}
              onChange={(e) => setManualLateCountInput(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-[#dcc7b8] px-2.5 py-2 text-sm bg-white text-[#2f1e13] outline-none focus:ring-2 focus:ring-[#cb6837]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#8a6047] mb-1">
              Catatan
            </label>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-lg border border-[#dcc7b8] px-2.5 py-2 text-sm bg-white text-[#2f1e13] outline-none focus:ring-2 focus:ring-[#cb6837]/30"
            />
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={!selectedStaffId || !manualLateCountInput}
          className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-[#cb6837] px-3 py-2 text-xs font-semibold text-white hover:bg-[#b15a31] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <Plus size={14} />
          Tambah / Update
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {reconciliationByMonthAndStaff.get(expandedMonth) &&
        reconciliationByMonthAndStaff.get(expandedMonth)!.size > 0 ? (
          Array.from(reconciliationByMonthAndStaff.get(expandedMonth)!.values())
            .sort((a, b) => a.staffName.localeCompare(b.staffName, "id"))
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-[#e2d1c3] bg-white p-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#2f1e13]">{item.staffName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1 text-xs text-[#8a6047]">
                      <span className="font-semibold">{item.manualLateCount}x</span>
                      telat
                    </span>
                    {item.note && (
                      <span className="text-xs italic text-[#b58872]">
                        "{item.note}"
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition flex-shrink-0"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
        ) : (
          <p className="text-xs text-[#b58872] italic text-center py-2">
            Belum ada data reconciliation untuk {formatMonthLabel(expandedMonth)}.
          </p>
        )}
      </div>
    </div>
  );
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat("id-ID", {
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}
