"use client"

import { usePathname } from "next/navigation"
import { SessionProvider } from "next-auth/react"
import { BusinessProvider } from "./BusinessContext"
import { RoleProvider } from "./RoleContext"

function isPublicRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/offline")
  )
}

export default function AppProviders({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const shouldLoadSessionProvider = !isPublicRoute(pathname)
  const shouldLoadWorkspaceProviders = !isPublicRoute(pathname)

  if (!shouldLoadSessionProvider) {
    return children
  }

  return (
    <SessionProvider>
      {shouldLoadWorkspaceProviders ? (
        <BusinessProvider>
          <RoleProvider>{children}</RoleProvider>
        </BusinessProvider>
      ) : (
        children
      )}
    </SessionProvider>
  )
}
