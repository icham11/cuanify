import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface GradientPageHeaderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: ReactNode;
}

export default function GradientPageHeader({
  title,
  description,
  icon: Icon,
  actions,
}: GradientPageHeaderProps) {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-linear-to-r from-blue-600 via-indigo-600 to-indigo-700 px-6 py-5 shadow-lg shadow-indigo-200/30">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white shadow-inner">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-tight text-white">{title}</h1>
            <p className="mt-1 text-sm leading-relaxed text-blue-50/90">{description}</p>
          </div>
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
