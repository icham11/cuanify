import {
  CheckCircle2,
  Clock,
  Factory,
  PackageCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { OrderStatusLog } from "@/components/bakery/store";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import {
  parseSafeDate,
  toIsoDateString,
} from "@/lib/helpers/date-normalization";

const timelineSteps = [
  { key: "Created", label: "Booking Created", icon: CheckCircle2, offset: -2 },
  { key: "In Production", label: "In Production", icon: Factory, offset: -1 },
  { key: "Ready", label: "Ready for Delivery", icon: PackageCheck, offset: 0 },
  { key: "Completed", label: "Completed", icon: Truck, offset: 1 },
  { key: "Cancelled", label: "Cancelled", icon: XCircle, offset: 0 },
];

function resolveIndex(status: string) {
  const normalizedStatus = normalizeOrderStatus(status);

  switch (normalizedStatus) {
    case "Ready":
      return 2;
    case "Completed":
    case "Delivery":
    case "Delivered":
      return 3;
    case "Cancelled":
      return 4;
    default:
      return 1;
  }
}

function formatDate(baseDate: string, offset: number) {
  const date = parseSafeDate(baseDate);
  if (!date) return `${baseDate} 09:00`;
  date.setDate(date.getDate() + offset);
  return `${toIsoDateString(date)} 09:00`;
}

function formatActor(entry: OrderStatusLog): string {
  if (entry.actorName && entry.userId) {
    return `${entry.actorName} (#${entry.userId})`;
  }
  if (entry.actorName) return entry.actorName;
  if (entry.userId) return `User #${entry.userId}`;
  return "System";
}

export default function OrderTimeline({
  status,
  deliveryDate,
  history,
}: {
  status: string;
  deliveryDate: string;
  history?: OrderStatusLog[];
}) {
  const sortedHistory = (history ?? [])
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const currentIndex = resolveIndex(status);
  const normalizedStatus = normalizeOrderStatus(status);

  return (
    <div className="rounded-xl border border-gray-100 bg-white px-6 py-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          Activity Timeline
        </h3>
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Latest updates
        </span>
      </div>
      <div className="space-y-4">
        {sortedHistory.length > 0
          ? sortedHistory.map((entry, index) => {
              const isPrimary = index === sortedHistory.length - 1;
              return (
                <div key={entry.id} className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                      isPrimary
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 bg-gray-50 text-gray-500"
                    }`}
                  >
                    <Clock size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {entry.note}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(entry.timestamp).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      · {formatActor(entry)}
                    </p>
                  </div>
                </div>
              );
            })
          : timelineSteps.map((step, index) => {
              const Icon = step.icon;
              const isDone =
                normalizedStatus === "Cancelled"
                  ? step.key === "Created" || step.key === "Cancelled"
                  : index <= currentIndex;
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
                    <p className="text-sm font-medium text-gray-900">
                      {step.label}
                    </p>
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
