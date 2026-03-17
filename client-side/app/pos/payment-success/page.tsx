"use client";

import dynamic from "next/dynamic";

const PaymentSuccessContent = dynamic(() => import("./PaymentSuccessContent"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
        <p className="text-lg font-semibold text-gray-900 mb-2">Memproses Transaksi...</p>
        <p className="text-gray-600">⏳ Mohon tunggu sebentar</p>
      </div>
    </div>
  ),
});

export default function PaymentSuccessPage() {
  return <PaymentSuccessContent />;
}
