"use client";

import dynamic from "next/dynamic";

const MobileNav = dynamic(() => import("./MobileNav"), { ssr: false });

interface MobileNavLoaderProps {
  jwtUserName?: string;
  jwtUserEmail?: string;
}

export default function MobileNavLoader({ jwtUserName, jwtUserEmail }: MobileNavLoaderProps) {
  return <MobileNav jwtUserName={jwtUserName} jwtUserEmail={jwtUserEmail} />;
}

