type CardProps = {
  title: string;
  value: number | string;
};

export function Card({ title, value }: CardProps) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
      <p className="text-xs sm:text-sm text-[#6b7280]">{title}</p>
      <h3 className="mt-2 wrap-break-word text-xl font-semibold text-[#243b5a] sm:mt-3 sm:text-2xl md:text-3xl">
        {typeof value === "number"
          ? `Rp ${value.toLocaleString("id-ID")}`
          : value}
      </h3>
    </div>
  );
}
