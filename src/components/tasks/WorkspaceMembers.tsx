"use client";

import { UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import { addBrandMember, removeBrandMember } from "@/lib/actions";
import type { PersonDTO } from "@/lib/dto";

// Brand workspace members (like the members of an Asana project). Members see
// every task in the workspace and can add teammates.
export default function WorkspaceMembers({
  brandId,
  members,
  people,
  meId,
  canAdd,
  canRemoveOthers,
}: {
  brandId: string;
  members: { id: string; name: string }[];
  people: PersonDTO[];
  meId: string;
  canAdd: boolean;
  canRemoveOthers: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setErr(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  return (
    <div className="relative">
      <button onClick={() => setOpen((x) => !x)} className="h-7 px-2.5 rounded-md border border-stone-200 bg-white hover:bg-slate-50 text-[11.5px] font-medium text-slate-800 shadow-2xs dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-200 inline-flex items-center gap-2 transition-all whitespace-nowrap shrink-0 select-none cursor-pointer" title="Workspace members">
        <span className="flex -space-x-1.5">
          {members.slice(0, 4).map((m) => (
            <span key={m.id} className="rounded-full ring-2 ring-surface">
              <Avatar name={m.name} size={20} />
            </span>
          ))}
        </span>
        {members.length === 0 ? <Users className="h-4 w-4" /> : null}
        <span>{members.length} member{members.length === 1 ? "" : "s"}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-line bg-surface p-3.5 shadow-pop">
          <p className="mb-2 text-[12px] text-muted">Members see every task in this workspace and can add teammates.</p>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {members.length === 0 && <p className="text-[12px] text-muted">No members yet.</p>}
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-[13px]">
                <Avatar name={m.name} size={22} />
                <span className="flex-1 truncate">{m.name}</span>
                {(canRemoveOthers || m.id === meId) && (
                  <button
                    disabled={pending}
                    onClick={() => run(() => removeBrandMember(brandId, m.id))}
                    className="text-[11px] text-muted hover:text-rose-600"
                  >
                    {m.id === meId ? "Leave" : "Remove"}
                  </button>
                )}
              </div>
            ))}
          </div>
          {canAdd && (
            <label className="relative mt-3 flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-line px-2 py-1.5 text-[12px] text-muted hover:text-ink">
              <UserPlus className="h-3.5 w-3.5" /> Add a teammate
              <select
                value=""
                disabled={pending}
                onChange={(e) => e.target.value && run(() => addBrandMember(brandId, e.target.value))}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="">Add a teammate</option>
                {people
                  .filter((p) => p.active && !members.some((m) => m.id === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {p.department}</option>
                  ))}
              </select>
            </label>
          )}
          {err && <p className="mt-2 text-[12px] text-rose-600">{err}</p>}
        </div>
      )}
    </div>
  );
}
