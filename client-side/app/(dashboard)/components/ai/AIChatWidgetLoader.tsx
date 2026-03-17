"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const AIChatWidget = dynamic(() => import("./AIChatWidget"), { ssr: false });

export default function AIChatWidgetLoader() {
  const pathname = usePathname();
  const hideWidget =
    pathname === "/dashboard/ai-analysis" ||
    (pathname ? pathname.startsWith("/dashboard/ai-analysis/") : false);

  if (hideWidget) {
    return null;
  }

  return <AIChatWidget />;
}
