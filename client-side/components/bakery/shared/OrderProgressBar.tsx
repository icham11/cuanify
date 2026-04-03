const steps = ["Booking", "In Production", "Ready", "Delivered"] as const;

function resolveIndex(status: string) {
  switch (status) {
    case "Confirmed":
    case "In Production":
      return 1;
    case "Ready":
      return 2;
    case "Delivered":
    case "Completed":
      return 3;
    case "Cancelled":
      return 0;
    default:
      return 0;
  }
}

export default function OrderProgressBar({ status }: { status: string }) {
  const currentIndex = resolveIndex(status);

  return (
    <div className="rounded-xl border border-gray-100 bg-white px-6 py-4 shadow-sm">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-400">
        {steps.map((step, index) => (
          <span
            key={step}
            className={
              index <= currentIndex ? "text-indigo-600" : "text-gray-400"
            }
          >
            {step}
          </span>
        ))}
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
