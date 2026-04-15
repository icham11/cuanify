import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import Image from "next/image";

interface GradientPageHeaderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children?: ReactNode;
}

export default function GradientPageHeader({
  title,
  description,
  icon: Icon,
  actions,
  children,
}: GradientPageHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#f3d7b6] bg-[#fffdf7] px-6 py-5 shadow-[0_20px_44px_-32px_rgba(23,58,122,0.28)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#d7e3f8] bg-[#eef3ff] text-[#173a7a] shadow-inner">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-tight text-[#173a7a]">{title}</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
            {children}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-[#ffd9b8] bg-white px-3 py-1.5 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.35)]">
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
