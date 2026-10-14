"use client";

import { PlayCircle } from "lucide-react";
import { startTour } from "@/components/Tour";

export default function TourButton() {
  return (
    <button className="btn-primary" onClick={() => startTour()}>
      <PlayCircle className="h-4 w-4" /> Take the tour
    </button>
  );
}
