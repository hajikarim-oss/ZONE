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
      className="btn-ghost border border-line px-2 py-1"
      title={on ? "Remove from favorites" : "Add to favorites"}
    >
      <Star className={cn("h-4 w-4", on ? "fill-amber-400 text-amber-400" : "text-muted")} />
    </button>
  );
}
