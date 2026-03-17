"use client";

import React from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

const TILE_MAP: Record<string, string> = {
  indigo: "from-indigo-50 to-indigo-100/50 border-indigo-100",
  emerald: "from-emerald-50 to-emerald-100/50 border-emerald-100",
  blue: "from-blue-50 to-blue-100/50 border-blue-100",
  purple: "from-purple-50 to-purple-100/50 border-purple-100",
  amber: "from-amber-50 to-amber-100/50 border-amber-100",
  red: "from-red-50 to-red-100/50 border-red-100",
  green: "from-green-50 to-green-100/50 border-green-100",
  yellow: "from-yellow-50 to-yellow-100/50 border-yellow-100",
  pink: "from-pink-50 to-pink-100/50 border-pink-100",
  teal: "from-teal-50 to-teal-100/50 border-teal-100",
};

const ICON_MAP: Record<string, string> = {
  indigo: "bg-indigo-100 text-indigo-600",
  emerald: "bg-emerald-100 text-emerald-600",
  blue: "bg-blue-100 text-blue-600",
  purple: "bg-purple-100 text-purple-600",
  amber: "bg-amber-100 text-amber-600",
  red: "bg-red-100 text-red-600",
  green: "bg-green-100 text-green-600",
  yellow: "bg-yellow-100 text-yellow-600",
  pink: "bg-pink-100 text-pink-600",
  teal: "bg-teal-100 text-teal-600",
};

export interface StatTileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
  subtext?: string;
  trend?: number;
}

export default function StatTile({
  icon: Icon,
  label,
  value,
  color,
  subtext,
  trend,
}: StatTileProps) {
  const tile = TILE_MAP[color] ?? TILE_MAP.indigo;
  const iconStyle = ICON_MAP[color] ?? ICON_MAP.indigo;

  return (
    <div
      className={`p-3 sm:p-4 rounded-xl bg-linear-to-br border ${tile} hover:shadow-md transition`}
    >
      <div className="flex items-start justify-between mb-1.5 sm:mb-2">
        <div
          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center ${iconStyle}`}
        >
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>
        {trend !== undefined && (
          <div
            className={`flex items-center gap-0.5 text-[10px] sm:text-xs font-medium ${
              trend >= 0 ? "text-green-600" : "text-red-500"
            }`}
          >
            {trend >= 0 ? (
              <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            ) : (
              <ArrowDownRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            )}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm sm:text-lg font-bold text-gray-900 truncate">
        {value}
      </p>
      {subtext && (
        <p className="text-[10px] text-gray-400 mt-0.5 sm:mt-1 truncate">
          {subtext}
        </p>
      )}
    </div>
  );
}
