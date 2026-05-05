import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Image from "next/image";

import { authOptions } from "@/lib/auth";
import { verifyToken } from "@/lib/auth/jwt";
import prisma from "@/lib/prisma";
import { BusinessProvider } from "@/context/BusinessContext";

import SidebarUserInfo from "@/app/(dashboard)/components/sidebar_user_info";
import SidebarNav from "@/app/(dashboard)/components/SidebarNav";
import AIChatWidgetLoader from "./components/ai/AIChatWidgetLoader";
import MobileNavLoader from "./components/MobileNavLoader";
import DashboardClientLayout from "./DashboardClientLayout";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1) Check custom JWT (email/password) first
  const token = (await cookies()).get("token")?.value;
  const jwtDecoded = token ? verifyToken(token) : null;

  // 2) Check NextAuth session only if custom JWT is not present
  let session = null;
  if (!jwtDecoded) {
    session = await getServerSession(authOptions);
  }

  if (!session && !jwtDecoded) {
    console.warn("[DashboardLayout] No session found, redirecting to /login");
    redirect("/login");
  }

  // 3) Get userId from either auth system
  let userId: number | null = null;

  if (
    jwtDecoded &&
    typeof jwtDecoded === "object" &&
    "userId" in jwtDecoded
  ) {
    userId = Number((jwtDecoded as { userId: number }).userId);
  }

  if (!userId && session?.user?.id) {
    userId = Number(session.user.id);
  }

  if (!userId) {
    redirect("/login");
  }

  // 4) Check business (owner or member)
  const businesses = await prisma.business.findMany({
    where: { userId },
  });

  if (!businesses.length) {
    const membership = await prisma.businessMember.findFirst({
      where: { userId },
      include: { business: true },
    });

    if (!membership) {
      redirect("/onboarding");
    }
  }

  const jwtUserName =
    jwtDecoded && typeof jwtDecoded === "object" && "name" in jwtDecoded
      ? String((jwtDecoded as { name?: unknown }).name ?? "")
      : undefined;

  const jwtUserEmail =
    jwtDecoded && typeof jwtDecoded === "object" && "email" in jwtDecoded
      ? String((jwtDecoded as { email?: unknown }).email ?? "")
      : undefined;

  return (
    <BusinessProvider>
      <DashboardClientLayout>
        <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#f8efe6_0%,#f2eae1_42%,#eadfd4_100%)] md:h-screen md:overflow-hidden">
          <div className="relative z-10 flex min-h-screen gap-2 px-2 py-2 md:h-full md:min-h-0 md:gap-3 md:px-3 md:py-3">
            <aside
              className="custom-scrollbar sticky top-4 hidden h-[calc(100vh-2rem)] min-h-[calc(100vh-2rem)] w-64 shrink-0 self-start flex-col overflow-y-auto rounded-[30px] border border-[var(--crumbella-border)] bg-[var(--background)] px-4 py-5 shadow-[0_18px_38px_-28px_rgba(30,18,10,0.42)] md:flex lg:w-72 lg:px-5 xl:w-80 xl:px-6"
            >
              <div className="mb-7 rounded-2xl border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] px-3 py-4">
                <Image
                  src="/branding/Copy%20of%20logofont%20transparant.png"
                  alt="Crumbella Logo"
                  width={560}
                  height={144}
                  className="mx-auto h-32 w-auto object-contain lg:h-40"
                  priority
                />
              </div>

              <div className="mb-5 h-px w-full bg-[var(--crumbella-border)]" />

              <div className="flex-1 pr-1">
                <SidebarNav />
              </div>

              <div className="pt-4">
                <SidebarUserInfo
                  jwtUserName={jwtUserName}
                  jwtUserEmail={jwtUserEmail}
                />
              </div>
            </aside>

            <div className="hidden w-px self-stretch bg-[var(--crumbella-border)] md:block" />

            <main className="min-h-0 min-w-0 flex-1 overflow-visible pb-24 md:custom-scrollbar md:h-[calc(100vh-2rem)] md:overflow-y-auto md:overscroll-contain md:pb-0">
              <div className="mx-auto w-full max-w-[440px] px-1 py-2 sm:px-3 sm:py-4 md:max-w-[96rem] lg:px-5">
                <div className="relative overflow-hidden rounded-[34px] border border-[var(--crumbella-border)] bg-[var(--background)] p-2 text-[0.95rem] shadow-[0_24px_44px_-30px_rgba(30,18,10,0.5)] sm:p-3 md:rounded-[24px] md:bg-[var(--crumbella-surface)] md:p-4 md:shadow-[0_16px_34px_-26px_rgba(30,18,10,0.45)]">
                  <div className="relative">{children}</div>
                </div>
              </div>
            </main>
          </div>

          <AIChatWidgetLoader />

          <MobileNavLoader
            jwtUserName={jwtUserName}
            jwtUserEmail={jwtUserEmail}
          />
        </div>
      </DashboardClientLayout>
    </BusinessProvider>
  );
}
