import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/90 backdrop-blur-sm p-8 sm:p-10 rounded-2xl shadow-xl border border-white/60">
          <RegisterForm />
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          &copy; {new Date().getFullYear()} Crumbella Admin. All rights reserved.
        </p>
      </div>
    </div>
  );
}
