"use client";
import { ReactNode } from "react";
import { Tooltip } from "react-tooltip";
import AnimatedNumber from "./AnimatedNumber";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  tooltip?: string;
  colorClass?: string;
}

export default function StatCard({
  title,
  value,
  icon,
  tooltip,
  colorClass = "from-blue-500 to-indigo-400",
}: StatCardProps) {
  return (
    <div
      className={`relative group bg-white/70 backdrop-blur-md border border-white bg-clip-padding rounded-2xl px-6 py-5 flex flex-col items-center justify-center shadow-lg transition-all duration-200 hover:shadow-blue-300/60 hover:scale-105 ${colorClass}`}
      style={{ boxShadow: "0 4px 32px 0 rgba(59,130,246,0.10)" }}
      data-tooltip-id={tooltip ? `statcard-tooltip-${title}` : undefined}
      data-tooltip-content={tooltip}
    >
      <div className="flex items-center justify-center mb-2">
        <span className="rounded-full bg-linear-to-br from-blue-100 to-indigo-100 p-2 shadow-md group-hover:shadow-blue-300/40 transition-all duration-200">
          {icon}
        </span>
      </div>
      <p className="text-xs sm:text-sm font-medium text-blue-600 tracking-wide mb-1 text-center">
        {title}
      </p>
      <h2 className="text-lg sm:text-2xl md:text-3xl font-extrabold mt-1 text-blue-800 text-center drop-shadow bg-linear-to-r from-blue-600 via-indigo-500 to-blue-400 bg-clip-text wrap-break-word">
        {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
      </h2>
      {tooltip && (
        <Tooltip
          id={`statcard-tooltip-${title}`}
          place="top"
          className="z-50"
        />
      )}
      {/* Glow effect */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition duration-300"
        style={{ boxShadow: "0 0 32px 8px #3b82f6, 0 0 64px 16px #6366f1" }}
      />
    </div>
  );
}
