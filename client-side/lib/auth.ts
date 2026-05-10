import { AuthOptions } from "next-auth";

export const authOptions: AuthOptions = {
  providers: [],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.includes("/api/auth/post-login")) return url;
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return `${baseUrl}/api/auth/post-login`;
    },
  },
};
