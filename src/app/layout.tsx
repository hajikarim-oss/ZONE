import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Post Prod Panel — TheBoredMonkey",
  description: "Projects, team and brand tracking for The Bored Monkey post-production.",
};

// The light/dark choice lives in a "theme" cookie (written by ThemeProvider),
// so the server renders <html class="dark"> directly — no inline script needed
// (Next 16 warns about <script> tags rendered from components).
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  const dark = theme === "dark";
  return (
    <html lang="en" className={`${inter.variable}${dark ? " dark" : ""}`} suppressHydrationWarning>
      <body className="font-sans">
        <Providers initialTheme={theme === "dark" || theme === "light" ? theme : "system"}>{children}</Providers>
      </body>
    </html>
  );
}
