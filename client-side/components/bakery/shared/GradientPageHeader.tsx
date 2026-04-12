import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import Image from "next/image";

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
    <div className="relative overflow-hidden rounded-3xl border border-[#ffd8b7] bg-linear-to-r from-[#173a7a] via-[#f26a21] to-[#25b4c8] px-6 py-5 shadow-[0_20px_44px_-30px_rgba(23,58,122,0.95)]">
      <div className="pointer-events-none absolute -left-10 top-0 h-24 w-24 rounded-full bg-white/12 blur-xl" />
      <div className="pointer-events-none absolute right-4 top-4 h-16 w-16 rounded-full bg-[#f9bd1f]/25 blur-lg" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/20 text-white shadow-inner">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-tight text-white">{title}</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-100/95">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-[#ffdfc3] bg-white/92 px-3 py-1.5 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.9)]">
            <Image
              src="/branding/Copy%20of%20naik%20payung.png"
              alt="Crumbella Mascot"
              width={150}
              height={150}
              className="h-12 w-auto object-contain sm:h-14"
              priority
            />
          </div>
          {actions}
        </div>
      </div>
    </div>
  );
}
