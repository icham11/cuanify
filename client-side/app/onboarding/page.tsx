"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBusiness } from "@/lib/api/business";
import { useBusiness } from "@/context/BusinessContext";
import Image from "next/image";
import { Building2, MapPin } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const { refreshBusiness } = useBusiness();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!businessName || !location) {
      alert("Lengkapi semua field terlebih dahulu");
      return;
    }
    try {
      setLoading(true);
      await createBusiness({ name: businessName, location });
      await refreshBusiness();
      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      alert("Gagal membuat bisnis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-purple-200/30 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/90 backdrop-blur-sm p-8 sm:p-10 rounded-2xl shadow-xl border border-white/60">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Image
              src="/cuanify-logo.svg"
              alt="Cuanify"
              width={180}
              height={44}
              className="h-10 w-auto"
              priority
            />
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
              1
            </div>
            <div className="w-12 h-0.5 bg-gray-200" />
            <div className="w-8 h-8 bg-gray-200 text-gray-400 rounded-full flex items-center justify-center text-xs font-bold">
              2
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-900 mb-1">
            Setup Bisnis Anda
          </h1>
          <p className="text-center text-gray-500 mb-7 text-sm">
            Satu langkah lagi sebelum Anda bisa mulai pakai Cuanify
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Building2 className="w-3.5 h-3.5 inline mr-1 text-indigo-500" />
                Nama Usaha
              </label>
              <input
                type="text"
                placeholder="Contoh: Warung Kopi Pak Budi"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <MapPin className="w-3.5 h-3.5 inline mr-1 text-indigo-500" />
                Lokasi Usaha
              </label>
              <input
                type="text"
                placeholder="Contoh: Jakarta Selatan"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !businessName || !location}
            className="w-full mt-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loading ? "Membuat bisnis..." : "Lanjutkan ke Dashboard"}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          &copy; 2026 Cuanify. All rights reserved.
        </p>
      </div>
    </div>
  );
}
