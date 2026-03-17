export default function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-100 ${className ?? ""}`} />
  );
}
