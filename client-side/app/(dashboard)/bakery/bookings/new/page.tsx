import BookingForm from "@/components/bakery/bookings/BookingForm";

export default function NewBookingPage() {
  return (
    <div className="space-y-4 pb-10">
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-full border border-[var(--crumbella-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(246,233,219,0.92)_100%)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--crumbella-primary)] shadow-[0_12px_24px_-22px_rgba(30,18,10,0.7)]">
          New Booking
        </div>
      </div>
      <BookingForm />
    </div>
  );
}
