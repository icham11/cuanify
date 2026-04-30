import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Image from "next/image";

import { authOptions } from "@/lib/auth";
import { verifyToken } from "@/lib/auth/jwt";
import prisma from "@/lib/prisma";

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
  // 1) Check NextAuth session
  const session = await getServerSession(authOptions);

  // 2) Check custom JWT (email/password)
  const token = (await cookies()).get("token")?.value;
  const jwtDecoded = token ? verifyToken(token) : null;

  if (!session && !jwtDecoded) {
    console.warn("[DashboardLayout] No session found, redirecting to /login");
    redirect("/login");
  }

  // 3) Get userId from either auth system
  let userId: number | null = null;

  if (session?.user?.id) {
    userId = Number(session.user.id);
  }

  if (
    !userId &&
    jwtDecoded &&
    typeof jwtDecoded === "object" &&
    "userId" in jwtDecoded
  ) {
    userId = Number((jwtDecoded as { userId: number }).userId);
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
    <DashboardClientLayout>
      <div className="relative h-screen overflow-hidden bg-[linear-gradient(145deg,#fff8ec_0%,#eef9ff_50%,#f9f3ff_100%)]">
          <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 rounded-full bg-[#f26a21]/15 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-[#f9bd1f]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-20 h-72 w-72 rounded-full bg-[#25b4c8]/20 blur-3xl" />

          <div className="relative z-10 flex h-full gap-2 px-2 py-2 md:gap-3 md:px-3 md:py-3">
            <aside
              className="custom-scrollbar sticky top-4 hidden h-[calc(100vh-2rem)] min-h-[calc(100vh-2rem)] w-64 shrink-0 self-start flex-col overflow-y-auto rounded-4xl border border-white/70 px-4 py-5 shadow-[0_24px_45px_-32px_rgba(23,58,122,0.85)] backdrop-blur-md md:flex lg:w-72 lg:px-5 xl:w-80 xl:px-6"
              style={{
                background:
                  "linear-gradient(180deg, rgb(255 250 240 / 0.94) 0%, rgb(255 239 219 / 0.9) 44%, rgb(233 248 255 / 0.9) 100%)",
              }}
            >
              <div className="mb-7 rounded-[28px] border-2 border-[#ffc894] bg-[radial-gradient(circle_at_20%_20%,#fff9f0_0%,#ffe9d4_55%,#dff6ff_100%)] px-3 py-4 shadow-[0_16px_32px_-20px_rgba(242,106,33,0.6)]">
                <Image
                  src="/branding/Copy%20of%20logofont%20transparant.png"
                  alt="Crumbella Logo"
                  width={560}
                  height={144}
                  className="mx-auto h-32 w-auto object-contain lg:h-40"
                  priority
                />
              </div>

              <div className="mb-5 h-px w-full bg-linear-to-r from-transparent via-[#f26a21]/60 to-[#25b4c8]/60" />

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

            <div className="hidden w-1 self-stretch rounded-full bg-linear-to-b from-transparent via-[#f26a21]/50 to-[#25b4c8]/55 md:block" />

            <main className="custom-scrollbar h-[calc(100vh-2rem)] min-w-0 flex-1 overflow-y-auto overscroll-contain pb-20 md:pb-0">
              <div className="mx-auto max-w-[96rem] px-2 py-3 sm:px-4 sm:py-5 lg:px-5">
                <div className="relative overflow-hidden rounded-[30px] bg-white/58 p-2.5 text-[0.95rem] shadow-[0_28px_60px_-42px_rgba(23,58,122,0.95)] ring-1 ring-white/70 backdrop-blur-sm sm:p-4">
                  <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[#f26a21]/14 blur-2xl" />
                  <div className="pointer-events-none absolute -right-8 top-1/3 h-36 w-36 rounded-full bg-[#f9bd1f]/14 blur-2xl" />
                  <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-[#25b4c8]/14 blur-2xl" />
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
  );
}
