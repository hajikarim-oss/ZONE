"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FolderGit2, BookOpen, X, Sparkles } from "lucide-react";

type Props = {
  brandName: string;
  repositoryUrl?: string | null;
  guidelines?: string | null;
};

export default function BrandHeaderDetails({ brandName, repositoryUrl, guidelines }: Props) {
  const [showGuidelines, setShowGuidelines] = useState(false);

  useEffect(() => {
    if (!showGuidelines) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowGuidelines(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showGuidelines]);

  return (
    <div className="flex items-center gap-1.5">
      {repositoryUrl && (
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noreferrer"
          className="h-7 px-2.5 rounded-md border border-stone-200 bg-white hover:bg-slate-50 text-[11.5px] font-medium text-slate-800 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-200 inline-flex items-center gap-1.5 transition shadow-2xs"
          title="Open Master Google Drive Repository"
        >
          <FolderGit2 className="size-3.5 text-blue-600 dark:text-blue-400" />
          <span className="hidden sm:inline font-semibold">Drive Repo</span>
          <ExternalLink className="size-2.5 text-slate-400" />
        </a>
      )}

      {guidelines && (
        <>
          <button
            type="button"
            onClick={() => setShowGuidelines(true)}
            className="h-7 px-2.5 rounded-md border border-stone-200 bg-white hover:bg-slate-50 text-[11.5px] font-medium text-slate-800 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-200 inline-flex items-center gap-1.5 transition shadow-2xs"
            title="Read Brand Guidelines & Onboarding Notes"
          >
            <BookOpen className="size-3.5 text-amber-600" />
            <span className="hidden sm:inline font-semibold">Guidelines</span>
          </button>

          {showGuidelines && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
              onClick={() => setShowGuidelines(false)}
            >
              <div
                className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-pop"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-amber-600" />
                    <h3 className="text-[16px] font-semibold text-ink">{brandName} · Guidelines & Onboarding</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGuidelines(false)}
                    className="rounded p-1 text-muted hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-ink/90 scroll-thin">
                  {guidelines}
                </div>

                {repositoryUrl && (
                  <div className="mt-4 rounded-lg bg-canvas p-3 text-[12px]">
                    <span className="font-semibold text-ink block mb-1">Master Files & Assets:</span>
                    <a
                      href={repositoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline flex items-center gap-1 hover:text-accent/80 transition"
                    >
                      <span>Open Brand Drive Repository</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowGuidelines(false)}
                    className="btn-primary py-1 px-4 text-[12px]"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

