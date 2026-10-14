/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

// TheBoredMonkey wordmark: black version in light mode, white in dark mode.
export default function Logo({ className }: { className?: string }) {
  return (
    <>
      <img src="/logo-black.png" alt="TheBoredMonkey" className={cn("block dark:hidden", className)} />
      <img src="/logo-white.png" alt="TheBoredMonkey" className={cn("hidden dark:block", className)} />
    </>
  );
}
