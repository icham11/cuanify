import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import BookingForm from "@/components/bakery/bookings/BookingForm";
import { PlusCircle } from "lucide-react";

export default function NewBookingPage() {
  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="New Booking"
        description="Capture customer details, pricing, and delivery notes in one view."
        icon={PlusCircle}
      />
      <BookingForm />
    </div>
  );
}
