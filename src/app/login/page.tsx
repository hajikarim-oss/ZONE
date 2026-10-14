import { redirect } from "next/navigation";
import { validSession } from "@/lib/auth";
import LoginForm from "./login-form";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default async function LoginPage() {
  const valid = await validSession();
  if (valid) redirect(valid === "CLIENT" ? "/portal" : "/home");

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="mx-auto h-auto w-[260px]" />
          <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">Post Prod Panel</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
