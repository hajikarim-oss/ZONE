"use client";

import { useTransition } from "react";
import { markAllNotificationsRead } from "@/lib/actions";

export default function MarkReadButton() {
  const [pending, start] = useTransition();
  return (
    <button className="btn-outline" disabled={pending} onClick={() => start(() => markAllNotificationsRead())}>
      Mark all as read
    </button>
  );
}
