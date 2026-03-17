"use client"

import { SessionProvider } from "next-auth/react"
import { BusinessProvider } from "./BusinessContext"
import { RoleProvider } from "./RoleContext"

export default function AppProviders({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <BusinessProvider>
        <RoleProvider>
          {children}
        </RoleProvider>
      </BusinessProvider>
    </SessionProvider>
  )
}