import { Factory, PackageCheck, Truck, XCircle } from "lucide-react";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";

const steps = [
  { key: "In Production", label: "In Production", icon: Factory },
  { key: "Ready", label: "Ready", icon: PackageCheck },
  { key: "Completed", label: "Completed", icon: Truck },
  { key: "Cancelled", label: "Cancelled", icon: XCircle },
];

function resolveStepIndex(status: string) {
  const normalizedStatus = normalizeOrderStatus(status);

  switch (normalizedStatus) {
    case "Ready":
      return 1;
    case "Delivery":
    case "Delivered":
    case "Completed":
      return 2;
    case "Cancelled":
      return 3;
    default:
      return 0;
  }
}

export default function OrderStepper({ status }: { status: string }) {
  const normalizedStatus = normalizeOrderStatus(status);
  const currentIndex = resolveStepIndex(normalizedStatus);

  return (
    <div className="rounded-xl border border-gray-100 bg-white px-6 py-5 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const isActive =
            normalizedStatus === "Cancelled"
              ? step.key === "Cancelled"
              : index <= currentIndex;
          const Icon = step.icon;
          return (
            <div key={step.key} className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                  isActive
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-gray-50 text-gray-400"
                }`}
              >
                <Icon size={18} />
              </div>
              <div>
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    isActive ? "text-indigo-600" : "text-gray-400"
                  }`}
                >
                  Step {index + 1}
                </p>
                <p
                  className={`text-sm font-medium ${
                    isActive ? "text-gray-900" : "text-gray-500"
                  }`}
                >
                  {step.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
