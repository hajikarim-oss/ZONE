"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider, type Theme } from "@/lib/theme-context";

export default function Providers({ children, initialTheme }: { children: React.ReactNode; initialTheme: Theme }) {
  return (
    <SessionProvider>
      <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
    </SessionProvider>
  );
}
