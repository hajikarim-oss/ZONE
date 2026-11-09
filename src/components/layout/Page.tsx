"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Page — outer frame inspired by Email-System / Brae dashboard chrome.
 * Dense, edge-to-edge work surface that fills the parent content panel without clutter.
 */
export function Page({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col min-h-full bg-white dark:bg-[#0F141C]", className)}>
      {children}
    </div>
  );
}

/**
 * PageTopbar — 48px sticky topbar with editorial headline, vertical hairline divider,
 * context subtitle, and right-aligned actions cluster.
 */
export function PageTopbar({
  eyebrow,
  subtitle,
  children,
  className,
}: {
  eyebrow: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-14 px-5 md:px-6 border-b border-stone-200/90 dark:border-[#2C3B53] flex items-center justify-between gap-4 shrink-0 bg-white dark:bg-[#0F141C] sticky top-0 z-10 select-none",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="font-editorial text-[20px] md:text-[22px] font-normal tracking-tight text-slate-950 dark:text-white shrink-0 whitespace-nowrap leading-none">
          {eyebrow}
        </span>
        {subtitle && (
          <>
            <div className="h-4 w-px bg-stone-300 dark:bg-stone-700 shrink-0" />
            <span className="text-[12px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[200px] lg:max-w-md">
              {subtitle}
            </span>
          </>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * TopbarAction — pill action button inspired by Email-System (primary yellow or ghost).
 */
export function TopbarAction({
  children,
  onClick,
  href,
  icon,
  variant = "primary",
  disabled = false,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  icon?: React.ReactNode;
  variant?: "primary" | "ghost" | "jira";
  disabled?: boolean;
  className?: string;
}) {
  let cls =
    "border border-slate-300 hover:border-slate-900 text-slate-800 hover:text-black bg-white font-medium shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-200 dark:hover:border-slate-400";

  if (variant === "primary") {
    cls = "bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 font-bold border border-black/10 shadow-xs dark:border-black/20";
  } else if (variant === "jira") {
    cls = "bg-[#0052CC] hover:bg-[#0747A6] text-white font-bold border border-transparent shadow-xs";
  }

  const actionCls = cn(
    "h-7 px-3 rounded-md inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0 whitespace-nowrap select-none",
    cls,
    className
  );

  if (href) {
    return (
      <Link href={href} className={actionCls}>
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} disabled={disabled} className={actionCls}>
      {icon}
      {children}
    </button>
  );
}

/**
 * StatStrip — edge-to-edge grid of stats with vertical-rule dividers and a bottom hairline.
 */
export function StatStrip({
  children,
  cols = 4,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4 | 5 | 6 | 7;
}) {
  const gridCls = {
    2: "grid-cols-2",
    3: "grid-cols-2 md:grid-cols-3 max-md:[&>*:last-child]:col-span-2",
    4: "grid-cols-2 md:grid-cols-4",
    5: "grid-cols-2 md:grid-cols-5 max-md:[&>*:last-child]:col-span-2",
    6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6 max-md:[&>*:last-child]:col-span-2",
    7: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7",
  }[cols];

  return (
    <div
      className={cn(
        "grid border-b border-slate-200 dark:border-[#2C3B53] shrink-0 bg-white dark:bg-[#0F141C] overflow-x-auto scroll-thin",
        "max-md:[&>*:nth-child(2n)]:border-r-0 max-md:[&>*:last-child]:border-r-0",
        gridCls
      )}
    >
      {children}
    </div>
  );
}

/**
 * Stat — individual cell of StatStrip with uppercase tracked label and tabular numbers.
 */
export function Stat({
  label,
  value,
  sub,
  accent = false,
  href,
  onClick,
  last = false,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: boolean;
  href?: string;
  onClick?: () => void;
  last?: boolean;
  tone?: "red" | "amber" | "green" | "blue" | "yellow";
}) {
  const inner = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[9.5px] lg:text-[10px] uppercase tracking-[0.06em] xl:tracking-[0.09em] text-slate-500 dark:text-[#8C9BAB] font-semibold truncate whitespace-nowrap">
          {label}
        </span>
        {accent && (
          <span className="size-2 shrink-0 rounded-full bg-[#FFE600] ring-2 ring-[#FFE600]/30 shadow-xs" />
        )}
        {(href || onClick) && (
          <span className="ml-auto shrink-0 text-[11px] text-slate-400 group-hover:text-slate-600 transition-colors">
            →
          </span>
        )}
      </div>
      <div
        className={cn(
          "text-[22px] font-bold tracking-tight leading-none mt-2 tabular-nums text-slate-900 dark:text-white",
          tone === "red" && "text-rose-600 dark:text-rose-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "green" && "text-emerald-600 dark:text-emerald-400",
          tone === "blue" && "text-blue-600 dark:text-blue-400",
          tone === "yellow" && "text-amber-500"
        )}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && (
        <div className="text-[10.5px] text-slate-400 dark:text-slate-500 mt-1 font-mono truncate">
          {sub}
        </div>
      )}
    </>
  );

  const cls = cn(
    "group px-5 py-3 md:py-4 transition-colors min-w-[130px]",
    !last && "border-r border-slate-200 dark:border-[#2C3B53]",
    (href || onClick) && "hover:bg-slate-50/80 dark:hover:bg-[#161B22] cursor-pointer"
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button onClick={onClick} className={cn(cls, "text-left w-full")}>
        {inner}
      </button>
    );
  }

  return <div className={cls}>{inner}</div>;
}

/**
 * SectionBar — 36px secondary toolbar inside a Page.
 */
export function SectionBar({
  label,
  count,
  children,
  className,
}: {
  label: string;
  count?: number | string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-9 md:h-9 px-5 py-1.5 md:py-0 border-b border-slate-200/60 dark:border-[#2C3B53]/60 flex flex-wrap md:flex-nowrap items-center gap-x-2.5 gap-y-1.5 shrink-0 bg-[#FAF9F5]/40 dark:bg-[#0F141C]",
        className
      )}
    >
      <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-[#8C9BAB] font-semibold">
        {label}
      </span>
      {count !== undefined && (
        <span className="font-mono text-[10.5px] text-slate-400 tabular-nums">
          {count}
        </span>
      )}
      {children && (
        <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end min-w-0">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * PageBody — scrollable content area below the topbar/strip.
 */
export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex-1 min-h-0 overflow-auto overscroll-x-contain", className)}>
      {children}
    </div>
  );
}

