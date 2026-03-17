type CardProps = {
  title: string;
  value: number | string;
};

export function Card({ title, value }: CardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-100 hover:shadow-md transition">
      <p className="text-xs sm:text-sm text-gray-500">{title}</p>
      <h3 className="text-xl sm:text-2xl md:text-3xl font-semibold mt-2 sm:mt-3 text-gray-900 wrap-break-word">
        {typeof value === "number"
          ? `Rp ${value.toLocaleString("id-ID")}`
          : value}
      </h3>
    </div>
  );
}
