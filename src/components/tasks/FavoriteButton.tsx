"use client";

import { Star } from "lucide-react";
import { useState, useTransition } from "react";
import { toggleFavorite } from "@/lib/actions";
import { cn } from "@/lib/utils";

export default function FavoriteButton({ brandId, initial }: { brandId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  return (
    <button
      onClick={() => {
        const v = !on;
        setOn(v);
        start(async () => {
          try { await toggleFavorite(brandId, v); } catch { setOn(!v); }
        });
      }}
      className="h-7 px-2 rounded-md border border-stone-200 bg-white hover:bg-slate-50 shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22] inline-flex items-center justify-center transition-all"
      title={on ? "Remove from favorites" : "Add to favorites"}
    >
      <Star className={cn("h-4 w-4", on ? "fill-amber-400 text-amber-400" : "text-muted")} />
    </button>
  );
}
