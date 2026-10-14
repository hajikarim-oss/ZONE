"use client";

import { Play, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { runAutomationsNow, sendTestEmail } from "@/lib/actions";

export default function RunNowButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() => {
          if (!confirm("Run the daily automations now? This sends the real reminder emails and notifications.")) return;
          setMsg(null);
          start(async () => {
            try {
              const r = await runAutomationsNow();
              setMsg(`Done: ${r.reminders} reminders, ${r.deadlineAlerts} deadline alerts, ${r.brandNudges} brand nudges, ${r.archived} archived`);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Failed");
            }
          });
        }}
      >
        <Play className="h-3.5 w-3.5" /> {pending ? "Running…" : "Run now"}
      </button>
    </div>
  );
}

export function TestEmailButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="btn-outline py-1 text-[12px]"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await sendTestEmail();
              setMsg({ ok: r.ok, text: r.message });
            } catch (e) {
              setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
            }
          })
        }
      >
        <Send className="h-3 w-3" /> {pending ? "Sending…" : "Send test email"}
      </button>
      {msg && <span className={msg.ok ? "text-emerald-700" : "text-rose-600"}>{msg.text}</span>}
    </span>
  );
}
