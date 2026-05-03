"use client";

import { ReactNode } from "react";
import { LucideIcon, Menu } from "lucide-react";
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
  const openMobileNav = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("crumbella:open-mobile-nav"));
  };

  return (
    <div className="rounded-[28px] border border-[var(--crumbella-border)] bg-[linear-gradient(180deg,rgba(253,250,247,0.98)_0%,rgba(250,241,233,0.94)_100%)] px-4 py-4 shadow-[0_16px_34px_-26px_rgba(30,18,10,0.42)] sm:px-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <button
              type="button"
              data-mobile-nav-trigger="inline"
              aria-label="Open menu"
              onClick={openMobileNav}
              className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] text-[var(--crumbella-primary)] shadow-[0_8px_16px_-14px_rgba(30,18,10,0.7)] md:hidden"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>

            <div className="mt-0.5 hidden h-10 w-10 items-center justify-center rounded-2xl border border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)] md:flex">
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 md:hidden">
                <Icon className="h-4 w-4 text-[var(--crumbella-primary)]" />
                <h1 className="truncate text-[1.35rem] font-bold leading-tight text-[var(--foreground)] sm:text-[1.45rem]">{title}</h1>
              </div>
              <h1 className="hidden text-xl font-semibold leading-tight text-[var(--foreground)] md:block">{title}</h1>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--crumbella-muted)] sm:text-xs">{description}</p>
              {children}
            </div>
          </div>

          <div className="shrink-0">
            {actions ? <div className="hidden items-center gap-2 md:flex">{actions}</div> : null}
            <div className="rounded-full border border-[var(--crumbella-border)] bg-white/90 px-2 py-1 shadow-[0_8px_18px_-18px_rgba(30,18,10,0.8)] md:hidden">
              <Image
                src="/branding/Copy%20of%20naik%20payung.png"
                alt="Crumbella Mascot"
                width={150}
                height={150}
                className="h-8 w-auto object-contain"
                priority
              />
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <div className="rounded-full border border-[var(--crumbella-border)] bg-white/90 px-2 py-1 shadow-[0_8px_18px_-18px_rgba(30,18,10,0.8)]">
              <Image
                src="/branding/Copy%20of%20naik%20payung.png"
                alt="Crumbella Mascot"
                width={150}
                height={150}
                className="h-10 w-auto object-contain"
                priority
              />
            </div>
          </div>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2 md:hidden">{actions}</div> : null}
      </div>
    </div>
  );
}
