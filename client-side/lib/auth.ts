import { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      // Find or create user in Prisma DB on every sign-in
      if (user.email) {
        await prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name || "" },
          create: {
            email: user.email,
            name: user.name || "",
            password: "", // OAuth users don't have a password
          },
        });
      }
      return true;
    },
    async session({ session }) {
      // Attach Prisma user ID to the session
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true },
        });
        if (dbUser) {
          session.user.id = dbUser.id;
        }
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // If the callback already specifies post-login, use it
      if (url.includes("/api/auth/post-login")) return url;
      // After sign in, redirect through post-login for role-aware routing
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return `${baseUrl}/api/auth/post-login`;
    },
  },
};
