"use client";

import { Calendar, CalendarCheck, CalendarPlus, Check, Copy, ExternalLink, Loader2, RefreshCw, Unlink } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { disconnectMyGoogleCalendar, getMyGoogleCalendarStatus, syncMyGoogleCalendar } from "@/lib/actions";

export default function CalendarLink({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [showManualFeed, setShowManualFeed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // Load calendar connection status when opened
  useEffect(() => {
    if (open) {
      getMyGoogleCalendarStatus()
        .then((res) => {
          setConnected(res.connected);
          setUserEmail(res.email);
        })
        .catch(() => setConnected(false));
    }
  }, [open]);

  const handleConnect = () => {
    // Re-authenticate with Google requesting offline Calendar scope
    signIn("google", { callbackUrl: window.location.href });
  };

  const handleSyncNow = () => {
    setSyncing(true);
    setSyncMsg(null);
    startTransition(async () => {
      const res = await syncMyGoogleCalendar();
      setSyncing(false);
      if (res.ok) {
        if (res.total === 0) {
          setSyncMsg("Connected! You currently have 0 tasks assigned in My tasks. Click '+ Add task' to add a deliverable and it will automatically sync to your Google Calendar.");
        } else {
          setSyncMsg(`Successfully synced ${res.synced} of ${res.total} task${res.total === 1 ? "" : "s"} to your Google Calendar!`);
        }
      } else {
        setSyncMsg(res.message || "Sync failed. Please ensure Google Calendar API is enabled in Google Cloud Console.");
      }
    });
  };

  const handleDisconnect = () => {
    if (!confirm("Disconnect Google Calendar? Automatic sync will pause.")) return;
    startTransition(async () => {
      await disconnectMyGoogleCalendar();
      setConnected(false);
      setSyncMsg(null);
    });
  };

  return (
    <div className="relative shrink-0" ref={popoverRef}>
      <button
        onClick={() => setOpen((x) => !x)}
        className="h-7 px-2.5 rounded-md border border-stone-200 bg-white hover:bg-slate-50 text-[11.5px] font-medium text-slate-800 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-200 inline-flex items-center gap-1.5 transition shadow-2xs shrink-0 whitespace-nowrap select-none"
      >
        {connected ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline text-emerald-700 whitespace-nowrap font-semibold">Calendar Synced</span>
          </>
        ) : (
          <>
            <CalendarPlus className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline whitespace-nowrap font-medium">Sync Google Calendar</span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-88 rounded-xl border border-line bg-surface p-4 text-[12px] shadow-pop">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-line/60">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-accent" />
              <span className="font-semibold text-ink text-[13px]">Google Calendar Sync</span>
            </div>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
              </span>
            )}
          </div>

          {connected === null ? (
            <div className="flex items-center justify-center py-6 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : connected ? (
            /* Connected state */
            <div className="mt-3 space-y-3">
              <p className="text-muted leading-relaxed">
                Direct sync is active for <b className="text-ink">{userEmail}</b>. Tasks automatically appear on your Google Calendar with start-end times, due dates, priority colors, and direct links.
              </p>

              {syncMsg && (
                <div className="rounded-lg bg-accent-soft/70 px-3 py-2 text-[11px] text-accent font-medium leading-relaxed">
                  {syncMsg}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSyncNow}
                  disabled={syncing || isPending}
                  className="btn-primary flex-1 justify-center gap-1.5 py-1.5 text-[12px]"
                >
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  <span>{syncing ? "Syncing Tasks…" : "Sync All Tasks Now"}</span>
                </button>

                <a
                  href="https://calendar.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-outline px-2.5 py-1.5 text-[12px]"
                  title="Open Google Calendar"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-line/60 text-[11px]">
                <button
                  type="button"
                  onClick={() => setShowManualFeed((s) => !s)}
                  className="text-muted hover:text-ink underline"
                >
                  {showManualFeed ? "Hide private iCal feed" : "Need private iCal URL?"}
                </button>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isPending}
                  className="flex items-center gap-1 text-rose-600 hover:text-rose-700"
                >
                  <Unlink className="h-3 w-3" /> Disconnect
                </button>
              </div>
            </div>
          ) : (
            /* Not Connected state */
            <div className="mt-3 space-y-3">
              <p className="text-muted leading-relaxed">
                Connect your Google account to automatically push your tasks, deadlines, and schedule blocks straight into your personal Google Calendar.
              </p>

              <button
                onClick={handleConnect}
                className="btn-primary w-full justify-center gap-2 py-2 text-[13px] font-medium"
              >
                <CalendarPlus className="h-4 w-4" />
                <span>Connect with Google Calendar</span>
              </button>

              <p className="text-[11px] text-muted">
                Requires standard Calendar permission to create and update your TBM task events.
              </p>

              <div className="pt-2 border-t border-line/60">
                <button
                  type="button"
                  onClick={() => setShowManualFeed((s) => !s)}
                  className="text-[11px] text-muted hover:text-ink underline"
                >
                  {showManualFeed ? "Hide manual URL feed" : "Alternative: Subscribe via URL"}
                </button>
              </div>
            </div>
          )}

          {/* Fallback iCal URL Box */}
          {showManualFeed && (
            <div className="mt-3 rounded-lg border border-line bg-canvas/70 p-2.5">
              <div className="text-[11px] font-medium text-ink">Personal iCal Feed Link</div>
              <p className="mt-0.5 text-[10px] text-muted">For Outlook, Apple Calendar, or manual URL subscription:</p>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  className="field-input min-w-0 flex-1 py-0.5 text-[10px]"
                />
                <button
                  className="btn-primary h-7 px-2"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {}
                  }}
                  title="Copy link"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
