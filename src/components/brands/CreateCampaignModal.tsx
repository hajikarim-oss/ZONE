"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Layers, Calendar, FolderGit2, Sparkles } from "lucide-react";
import { createCampaign } from "@/lib/actions";
import type { CampaignDTO } from "@/lib/dto";
import { cn } from "@/lib/utils";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  brandId: string;
  brandName: string;
  brands?: { id: string; name: string }[];
  onCreated?: (campaign: CampaignDTO) => void;
};

export default function CreateCampaignModal({
  isOpen,
  onClose,
  brandId,
  brandName,
  brands,
  onCreated,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedBrandId, setSelectedBrandId] = useState(brandId);
  const [name, setName] = useState("");
  const [internalDeadline, setInternalDeadline] = useState("");
  const [externalDeadline, setExternalDeadline] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");

  useEffect(() => {
    setSelectedBrandId(brandId);
  }, [brandId]);

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
      setError("Please enter a campaign name.");
      return;
    }
    const targetBrandId = selectedBrandId || brandId;
    if (!targetBrandId) {
      setError("Please select a brand.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const campaign = await createCampaign({
          brandId: targetBrandId,
          name: name.trim(),
          internalDeadline: internalDeadline || undefined,
          externalDeadline: externalDeadline || undefined,
          repositoryUrl: repositoryUrl.trim() || undefined,
        });

        setName("");
        setInternalDeadline("");
        setExternalDeadline("");
        setRepositoryUrl("");
        onClose();

        if (onCreated) {
          onCreated({
            id: campaign.id,
            name: campaign.name,
            brandId: targetBrandId,
            repositoryUrl: campaign.repositoryUrl ?? null,
            internalDeadline: campaign.internalDeadline ? new Date(campaign.internalDeadline).toISOString() : null,
            externalDeadline: campaign.externalDeadline ? new Date(campaign.externalDeadline).toISOString() : null,
            budget: campaign.budget ?? null,
            status: campaign.status,
          });
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create campaign");
      }
    });
  };

  const currentBrandDisplayName = brands?.find((b) => b.id === selectedBrandId)?.name || brandName;

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
        <div className="flex items-center justify-between border-b border-stone-200/90 px-5 py-4 dark:border-[#2C3B53] bg-[#FAF9F5] dark:bg-[#0B0E14]">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Layers className="size-4.5" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">
                Create Campaign
              </h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Add a new project campaign / epic under {currentBrandDisplayName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-[12px] text-rose-700 font-medium dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Brand Selector (if brands array provided) */}
          {brands && brands.length > 1 && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 mb-1.5">
                Brand / Project *
              </label>
              <select
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="w-full h-9 rounded-lg border border-stone-300 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-white"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Campaign Name */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 mb-1.5">
              Campaign Name *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Male Skin Launch, Festive Sale, YouTube Sprint"
              className="w-full h-9 rounded-lg border border-stone-300 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-white"
            />
          </div>

          {/* Dates: Internal Deadline & Client Air Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 mb-1.5">
                Internal Due Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={internalDeadline}
                  onChange={(e) => setInternalDeadline(e.target.value)}
                  className="w-full h-9 rounded-lg border border-stone-300 bg-white px-3 text-[12.5px] font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 mb-1.5">
                Client Air Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={externalDeadline}
                  onChange={(e) => setExternalDeadline(e.target.value)}
                  className="w-full h-9 rounded-lg border border-stone-300 bg-white px-3 text-[12.5px] font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Google Drive Repository URL */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 mb-1.5">
              Campaign Drive Link (Optional)
            </label>
            <div className="relative">
              <FolderGit2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="url"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full h-9 rounded-lg border border-stone-300 bg-white pl-9 pr-3 text-[12.5px] font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-[#2C3B53] dark:bg-[#0F141C] dark:text-white placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200/80 dark:border-[#2C3B53]">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-8 px-4 rounded-md border border-stone-300 bg-white text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="h-8 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-[12.5px] font-bold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {pending ? "Creating..." : "Create Campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
