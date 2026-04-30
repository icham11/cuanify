import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-linear-to-br from-[#f6f8fc] via-[#fffaf5] to-[#fef3ea] p-4">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#dbe2ea]/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[#ffd6bf]/50 blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        {/* Card */}
        <div className="rounded-2xl border border-[#e5e7eb] bg-white/95 p-8 shadow-xl shadow-slate-200/70 backdrop-blur-sm sm:p-10">
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400 text-center mt-6">
          &copy; {new Date().getFullYear()} Crumbella Admin. All rights reserved.
        </p>
      </div>
    </div>
  );
}
