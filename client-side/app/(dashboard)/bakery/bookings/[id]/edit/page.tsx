"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import BookingForm from "@/components/bakery/bookings/BookingForm";
import { useOrdersActions, type BakeryOrder } from "@/components/bakery/store";

export default function EditBookingPage() {
  const params = useParams<{ id: string }>();
  const orderId = Array.isArray(params?.id) ? params.id[0] : params?.id || "";
  const hasValidOrderId = orderId.length > 0;
  // Gunakan useOrdersActions — halaman edit hanya butuh fetchOrderById,
  // tidak pernah membaca list orders[], sehingga tidak perlu re-render saat polling.
  const { fetchOrderById } = useOrdersActions();
  const [order, setOrder] = useState<BakeryOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasValidOrderId) return;

    let cancelled = false;

    void fetchOrderById(orderId)
      .then((payload) => {
        if (cancelled) return;
        setOrder(payload);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Gagal memuat booking order.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchOrderById, hasValidOrderId, orderId]);

  if (!hasValidOrderId) {
    return (
      <div className="space-y-4 pb-10">
        <div className="rounded-3xl border border-[#f0d5cf] bg-[#fff7f5] px-5 py-4 text-sm text-[#9c4c3b]">
          Order ID tidak valid.
        </div>
        <Link
          href="/bakery/bookings"
          className="inline-flex rounded-2xl border border-[var(--crumbella-border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
        >
          Kembali ke daftar booking
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 pb-10">
        <div className="rounded-3xl border border-[var(--crumbella-border)] bg-white px-5 py-4 text-sm text-[var(--crumbella-muted)]">
          Memuat full editor booking...
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4 pb-10">
        <div className="rounded-3xl border border-[#f0d5cf] bg-[#fff7f5] px-5 py-4 text-sm text-[#9c4c3b]">
          {error || "Booking order tidak ditemukan."}
        </div>
        <Link
          href={orderId ? `/bakery/bookings/${orderId}` : "/bakery/bookings"}
          className="inline-flex rounded-2xl border border-[var(--crumbella-border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
        >
          Kembali ke detail booking
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <BookingForm mode="edit" orderId={orderId} initialOrder={order} />
    </div>
  );
}
