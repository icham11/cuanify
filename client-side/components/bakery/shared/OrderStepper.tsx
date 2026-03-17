import { CheckCircle2, Circle, Clock, Factory, Truck } from "lucide-react";

const steps = [
  { key: "Booking Created", label: "Booking Created", icon: Circle },
  { key: "Confirmed", label: "Confirmed", icon: CheckCircle2 },
  { key: "In Production", label: "In Production", icon: Factory },
  { key: "Ready", label: "Ready", icon: Clock },
  { key: "Delivered", label: "Delivered", icon: Truck },
];

function resolveStepIndex(status: string) {
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

export default function OrderStepper({ status }: { status: string }) {
  const currentIndex = resolveStepIndex(status);

  return (
    <div className="rounded-xl border border-gray-100 bg-white px-6 py-5 shadow-sm">
      <div className="grid gap-3 md:grid-cols-5">
        {steps.map((step, index) => {
          const isActive = index <= currentIndex;
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
