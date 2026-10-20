"use client";

import { CalendarPlus, Check, Copy } from "lucide-react";
import { useState } from "react";

// "Add to Google Calendar": a personal, private feed of My tasks.
export default function CalendarLink({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((x) => !x)} className="btn-ghost gap-1.5 border border-line px-2 py-1 text-[12px]">
        <CalendarPlus className="h-4 w-4" /> <span className="hidden sm:inline">Add to Google Calendar</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-line bg-surface p-3 text-[12px] shadow-pop">
          <p className="font-medium text-ink">Your tasks in Google Calendar</p>
          <p className="mt-1 text-muted">
            Tasks show at their Start–End time and on their Due date, plus subtasks due for you. Updates every few hours. This link is
            private to you; don&apos;t share it.
          </p>
          <div className="mt-2 flex gap-1.5">
            <input readOnly value={url} onFocus={(e) => e.target.select()} className="field-input min-w-0 flex-1 py-1 text-[11px]" />
            <button
              className="btn-primary h-8 px-2"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
              title="Copy link"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-muted">
            <li>Copy the link.</li>
            <li>
              Open{" "}
              <a href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noreferrer" className="text-accent underline">
                Google Calendar → Add by URL
              </a>
              .
            </li>
            <li>Paste it and click <b>Add calendar</b>.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
