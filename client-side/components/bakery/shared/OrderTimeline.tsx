import { CheckCircle2, Clock, Factory, PackageCheck, Truck } from "lucide-react";

const timelineSteps = [
  { label: "Booking Created", icon: Clock, offset: -4 },
  { label: "Order Approved", icon: CheckCircle2, offset: -3 },
  { label: "Sent to Production", icon: Factory, offset: -2 },
  { label: "Ready for Delivery", icon: PackageCheck, offset: -1 },
  { label: "Delivered", icon: Truck, offset: 0 },
];

function resolveIndex(status: string) {
  switch (status) {
    case "Confirmed":
      return 1;
    case "In Production":
      return 2;
    case "Ready":
      return 3;
    case "Delivered":
      return 4;
    default:
      return 0;
  }
}

function formatDate(baseDate: string, offset: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + offset);
  return `${date.toISOString().slice(0, 10)} 09:00`;
}

export default function OrderTimeline({
  status,
  deliveryDate,
}: {
  status: string;
  deliveryDate: string;
}) {
  const currentIndex = resolveIndex(status);

  return (
    <div className="rounded-xl border border-gray-100 bg-white px-6 py-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Activity Timeline</h3>
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Latest updates
        </span>
      </div>
      <div className="space-y-4">
        {timelineSteps.map((step, index) => {
          const Icon = step.icon;
          const isDone = index <= currentIndex;
          return (
            <div key={step.label} className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                  isDone
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-gray-50 text-gray-400"
                }`}
              >
                <Icon size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{step.label}</p>
                <p className="text-xs text-gray-500">
                  {formatDate(deliveryDate, step.offset)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
