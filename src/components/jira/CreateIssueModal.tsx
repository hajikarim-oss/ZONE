"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Sparkles, X } from "lucide-react";
import { createTask } from "@/lib/actions";
import { PRIORITIES, TYPES, WORK_TYPES } from "@/lib/constants";
import type { BrandDTO, PersonDTO } from "@/lib/dto";
import { JiraIssueTypeIcon, JiraPriorityIcon } from "./JiraBits";
import CreateBrandModal from "../brands/CreateBrandModal";
import CreateCampaignModal from "../brands/CreateCampaignModal";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  brands: BrandDTO[];
  people: PersonDTO[];
  defaultBrandId?: string;
  defaultCampaignId?: string;
};

export default function CreateIssueModal({
  isOpen,
  onClose,
  brands,
  people,
  defaultBrandId,
  defaultCampaignId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createBrandOpen, setCreateBrandOpen] = useState(false);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [brandsState, setBrandsState] = useState(brands);

  useEffect(() => {
    setBrandsState(brands);
  }, [brands]);

  const [selectedBrandId, setSelectedBrandId] = useState(defaultBrandId || brands[0]?.id || "");
  const [selectedCampaignId, setSelectedCampaignId] = useState(defaultCampaignId || "");
  const [issueType, setIssueType] = useState<string>("Reel");
  const [title, setTitle] = useState("");
  const [workType, setWorkType] = useState<string>(WORK_TYPES[0]);
  const [priority, setPriority] = useState<string>("Medium");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [clientDate, setClientDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [version, setVersion] = useState<number>(1);

  const currentBrand = brandsState.find((b) => b.id === selectedBrandId) || brandsState[0];
  const campaigns = currentBrand?.campaigns || [];

  useEffect(() => {
    if (defaultBrandId) setSelectedBrandId(defaultBrandId);
  }, [defaultBrandId]);

  useEffect(() => {
    if (campaigns.length > 0 && (!selectedCampaignId || !campaigns.some((c) => c.id === selectedCampaignId))) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleAutoTitle() {
    const brandName = currentBrand?.name || "Brand";
    const campName = campaigns.find((c) => c.id === selectedCampaignId)?.name || "Campaign";
    const raw = title.replace(/^.* - v\d+$/i, "").trim() || issueType || "Deliverable";
    setTitle(`${brandName} - ${campName} - ${raw} - v${version}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Please enter a summary / deliverable title.");
      return;
    }
    if (!selectedBrandId) {
      setError("A brand is required to create an issue.");
      return;
    }
    if (!selectedCampaignId) {
      setError("A campaign is mandatory for every deliverable.");
      return;
    }

    startTransition(async () => {
      try {
        await createTask({
          title: title.trim(),
          brandId: selectedBrandId,
          campaignId: selectedCampaignId,
          type: issueType,
          workType: workType || undefined,
          version: version || 1,
          priority,
          assigneeId: assigneeId || null,
          internalDeadline: dueDate || null,
          externalDeadline: clientDate || null,
          context: notes.trim() || undefined,
        });

        onClose();
        setTitle("");
        setNotes("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create issue");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl rounded-lg border border-line bg-surface shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Jira Modal Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-canvas/40">
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-bold text-ink">Create issue</h2>
            <span className="rounded bg-[#0052CC]/10 text-[#0052CC] font-semibold text-[11px] px-2 py-0.5 uppercase tracking-wide">
              Post-Production
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-side-hover hover:text-ink transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-h-[75vh] overflow-y-auto px-6 py-4 space-y-4 scroll-thin">
          {/* Project & Issue Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[12px] font-bold text-ink">
                  Project / Brand <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setCreateBrandOpen(true)}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="size-3" /> Add brand
                </button>
              </div>
              <select
                value={selectedBrandId}
                onChange={(e) => {
                  setSelectedBrandId(e.target.value);
                  setSelectedCampaignId("");
                }}
                className="field-input font-medium"
                required
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">
                Issue Type <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <JiraIssueTypeIcon type={issueType} className="h-6 w-6 rounded" />
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  className="field-input font-medium flex-1"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Campaign / Epic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[12px] font-bold text-ink">
                  Campaign / Epic <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setCreateCampaignOpen(true)}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="size-3" /> Add campaign
                </button>
              </div>
              <select
                value={selectedCampaignId}
                onChange={(e) => {
                  if (e.target.value === "__create_campaign__") {
                    setCreateCampaignOpen(true);
                  } else {
                    setSelectedCampaignId(e.target.value);
                  }
                }}
                className="field-input font-medium"
                required
              >
                <option value="">Select Campaign...</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__create_campaign__" className="font-semibold text-blue-600 dark:text-blue-400">
                  + Add new campaign...
                </option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">Work Type</label>
              <select
                value={workType}
                onChange={(e) => setWorkType(e.target.value)}
                className="field-input font-medium"
              >
                {WORK_TYPES.map((wt) => (
                  <option key={wt} value={wt}>
                    {wt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary / Deliverable Title */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] font-bold text-ink">
                Summary / Title <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleAutoTitle}
                className="inline-flex items-center gap-1 rounded bg-[#0052CC]/10 text-[#0052CC] px-2 py-0.5 text-[11px] font-semibold hover:bg-[#0052CC]/20 transition"
                title="Format title automatically"
              >
                <Sparkles className="h-3 w-3" /> Auto-format
              </button>
            </div>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Wedding Reel 01"
              className="field-input font-semibold"
              required
            />
          </div>

          {/* Priority & Assignee */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">Priority</label>
              <div className="flex items-center gap-2">
                <JiraPriorityIcon priority={priority} />
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="field-input font-medium flex-1"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="field-input font-medium"
              >
                <option value="">Unassigned</option>
                {people
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.department || "Editor"})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Deadlines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">Internal Due Date (Team)</label>
              <div className="relative">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="field-input font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-ink mb-1">Client Deadline (External)</label>
              <div className="relative">
                <input
                  type="date"
                  value={clientDate}
                  onChange={(e) => setClientDate(e.target.value)}
                  className="field-input font-medium"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[12px] font-bold text-ink mb-1">Description / Brief Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add details, editing guidelines, or requirements for this deliverable..."
              className="field-input resize-y font-normal"
            />
          </div>

          {/* Jira Modal Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="jira-btn-subtle px-4"
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="jira-btn-primary px-5 font-semibold"
              disabled={isPending || !title.trim()}
            >
              {isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>

      {/* Nested Create Brand Modal */}
      <CreateBrandModal
        isOpen={createBrandOpen}
        onClose={() => setCreateBrandOpen(false)}
        onCreated={(newId) => {
          setSelectedBrandId(newId);
          router.refresh();
        }}
      />

      {/* Nested Create Campaign Modal */}
      <CreateCampaignModal
        isOpen={createCampaignOpen}
        onClose={() => setCreateCampaignOpen(false)}
        brandId={currentBrand?.id || selectedBrandId}
        brandName={currentBrand?.name || "Brand"}
        brands={brandsState.map((b) => ({ id: b.id, name: b.name }))}
        onCreated={(campaign) => {
          setBrandsState((prev) =>
            prev.map((b) =>
              b.id === campaign.brandId
                ? {
                    ...b,
                    campaigns: [
                      ...(b.campaigns || []).filter((c) => c.id !== campaign.id),
                      campaign,
                    ],
                  }
                : b
            )
          );
          setSelectedCampaignId(campaign.id);
          router.refresh();
        }}
      />
    </div>
  );
}
