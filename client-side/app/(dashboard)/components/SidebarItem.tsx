"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

interface SidebarItemProps {
  href: string;
  icon: ReactNode;
  label: string;
}

export default function SidebarItem({ href, icon, label }: SidebarItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link href={href} legacyBehavior>
      <a
        className={`flex items-center gap-3 px-4 py-2 rounded-lg font-medium transition-colors duration-200 hover:bg-blue-100/60 hover:text-blue-700 ${
          isActive ? "bg-blue-200/80 text-blue-800" : "text-gray-600"
        }`}
      >
        <span className="text-xl">{icon}</span>
        <span>{label}</span>
      </a>
    </Link>
  );
}
