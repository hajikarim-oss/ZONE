"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Sparkles, FolderGit2, BookOpen, Building2, Layers, Mail, User } from "lucide-react";
import { createBrand } from "@/lib/actions";
import { cn } from "@/lib/utils";

const PRESET_COLORS = [
  "#0052CC", // Jira Blue
  "#6554C0", // Purple
  "#00875A", // Green
  "#FF8B00", // Orange
  "#DE350B", // Red
  "#4ecbc4", // Teal
  "#e362e3", // Magenta
  "#172B4D", // Navy
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (brandId: string, name: string) => void;
};

export default function CreateBrandModal({ isOpen, onClose, onCreated }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [campaignName, setCampaignName] = useState("General");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [pocName, setPocName] = useState("");
  const [pocEmail, setPocEmail] = useState("");
  const [guidelines, setGuidelines] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a brand name.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = await createBrand({
          name: name.trim(),
          color,
          repositoryUrl: repositoryUrl.trim() || undefined,
          pocName: pocName.trim() || undefined,
          pocEmail: pocEmail.trim().toLowerCase() || undefined,
          guidelines: guidelines.trim() || undefined,
        });

        if (res && "error" in res && res.error) {
          setError(res.error);
          return;
        }

        const brandId = (res as any)?.id;
        onClose();
        setName("");
        setRepositoryUrl("");
        setPocName("");
        setPocEmail("");
        setGuidelines("");

        if (onCreated && brandId) {
          onCreated(brandId, name.trim());
        } else if (brandId) {
          router.push(`/brands/${brandId}`);
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create brand");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-stone-200 bg-white shadow-pop dark:border-[#2C3B53] dark:bg-[#161B22] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5 dark:border-[#2C3B53] bg-[#FAF9F5] dark:bg-[#0F141C]">
          <div className="flex items-center gap-2">
            <span
              className="size-6 rounded-[4px] flex items-center justify-center text-white text-[11px] font-bold shadow-2xs"
              style={{ backgroundColor: color }}
            >
              {(name.trim() || "B").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h2 className="text-[14px] font-bold text-slate-900 dark:text-white">
                Create Brand Project
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Onboard a new client brand, repository, and initial campaign
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-[12.5px]">
          {error && (
            <div className="rounded-md bg-rose-50 border border-rose-200 p-2.5 text-[12px] text-rose-700 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Brand Name & Color */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1.5">
              Brand Name <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Noddmen, Atomberg, BSS"
                className="flex-1 h-8 rounded-md border border-stone-200 px-2.5 text-[12.5px] font-semibold text-slate-900 outline-none focus:border-[#0052CC] focus:ring-1 focus:ring-[#0052CC] dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-white"
              />
              {/* Color Presets */}
              <div className="flex items-center gap-1 shrink-0">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-5 rounded-full transition-transform",
                      color === c && "ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-110"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Drive Repository Link */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1.5">
              Master Google Drive Repository URL
            </label>
            <div className="relative">
              <FolderGit2 className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
              <input
                type="url"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full h-8 rounded-md border border-stone-200 pl-8 pr-2.5 text-[12px] text-slate-900 outline-none focus:border-[#0052CC] focus:ring-1 focus:ring-[#0052CC] dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-white"
              />
            </div>
            <p className="mt-1 text-[10.5px] text-slate-400">
              Editors and managers can open raw footage, project files, and final renders from this link.
            </p>
          </div>

          {/* POC Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1.5">
                Client POC Name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                <input
                  value={pocName}
                  onChange={(e) => setPocName(e.target.value)}
                  placeholder="e.g. Sachin"
                  className="w-full h-8 rounded-md border border-stone-200 pl-8 pr-2.5 text-[12px] text-slate-900 outline-none focus:border-[#0052CC] dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1.5">
                Client POC Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                <input
                  type="email"
                  value={pocEmail}
                  onChange={(e) => setPocEmail(e.target.value)}
                  placeholder="sachin@brand.com"
                  className="w-full h-8 rounded-md border border-stone-200 pl-8 pr-2.5 text-[12px] text-slate-900 outline-none focus:border-[#0052CC] dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Onboarding Notes / Guidelines */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1.5">
              Brand Guidelines & Onboarding Notes
            </label>
            <textarea
              rows={2}
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              placeholder="Fonts, color codes, aspect ratios, export formats, brand dos and don'ts..."
              className="w-full rounded-md border border-stone-200 p-2 text-[12px] text-slate-900 outline-none focus:border-[#0052CC] dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-white"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-4 dark:border-[#2C3B53]">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-8 px-3 rounded-md border border-stone-200 bg-white hover:bg-slate-50 text-[12px] font-medium text-slate-700 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="h-8 px-4 rounded-md bg-[#FFE600] hover:bg-[#F2DC00] text-slate-950 font-bold text-[12px] shadow-xs border border-black/10 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {pending ? "Creating..." : "Create Brand"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

