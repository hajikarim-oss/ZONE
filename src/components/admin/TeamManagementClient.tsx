"use client";

import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import { createTeamUser, deleteTeamUser, setTeamUserPassword, updateTeamUser } from "@/lib/actions";
import { DEPARTMENTS, ROLE_LABEL, ROLES } from "@/lib/constants";
import { cn, fmtDate } from "@/lib/utils";

type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  active: boolean;
  openTasks: number;
  createdAt: string;
};

function PasswordControl({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink">
        <KeyRound className="h-3 w-3" /> Password
      </button>
    );
  return (
    <div className="flex items-center gap-1.5">
      <input type="password" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="New password" className="field-input w-32 py-1" />
      <button
        className="btn-primary px-2 py-1"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await setTeamUserPassword(userId, value);
              setOpen(false);
              setValue("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed");
            }
          })
        }
      >
        Save
      </button>
      <button
        className="text-[12px] text-muted hover:text-ink"
        onClick={() => {
          if (!confirm("Remove this password? They'll go back to Google sign-in only.")) return;
          start(async () => { await setTeamUserPassword(userId, null); setOpen(false); });
        }}
      >
        Remove
      </button>
      <button className="text-[12px] text-muted hover:text-ink" onClick={() => { setOpen(false); setError(null); }}>
        Cancel
      </button>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}

function AddForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [department, setDepartment] = useState("Editor");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Add person
      </button>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createTeamUser({ name, email, role, department });
          if (r && "error" in r && r.error) return setError(r.error);
          window.location.reload();
        });
      }}
      className="rounded-lg border border-line bg-canvas p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="field-input" />
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@theboredmonkey.com" className="field-input" />
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className="field-input">
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="field-input">
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>
      <p className="mt-2 text-[12px] text-muted">
        They sign in with this Google account (company or personal Gmail for freelancers). You can also give them a password after adding.
      </p>
      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary">{pending ? "Adding…" : "Add & send welcome email"}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export default function TeamManagementClient({ users, currentUserId }: { users: TeamUser[]; currentUserId: string }) {
  const [rows, setRows] = useState(users);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function patch(id: string, p: Partial<TeamUser>) {
    const prev = rows;
    setRows((r) => r.map((u) => (u.id === id ? { ...u, ...p } : u)));
    setError(null);
    start(async () => {
      try {
        await updateTeamUser(id, { role: p.role, department: p.department, active: p.active });
      } catch (e) {
        setRows(prev);
        setError(e instanceof Error ? e.message : "Couldn't save");
      }
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <AddForm />
      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-canvas text-left text-[12px] text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">Department</th>
              <th className="px-2 py-2 font-medium">Role</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 text-right font-medium">Open tasks</th>
              <th className="px-2 py-2 font-medium">Login</th>
              <th className="px-2 py-2 font-medium">Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className={cn("border-t border-line/70", !u.active && "bg-canvas/70")}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.name} size={26} />
                    <div className="min-w-0 leading-tight">
                      <div className={cn("font-medium", !u.active && "text-muted line-through")}>
                        {u.name} {u.id === currentUserId && <span className="text-[11px] font-normal text-muted">(you)</span>}
                      </div>
                      <div className="truncate text-[12px] text-muted">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-1">
                  <select value={u.department} onChange={(e) => patch(u.id, { department: e.target.value })} className="cell-select">
                    {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </td>
                <td className="px-1">
                  <select value={u.role} disabled={u.id === currentUserId} onChange={(e) => patch(u.id, { role: e.target.value })} className="cell-select">
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td className="px-2">
                  <button
                    disabled={u.id === currentUserId}
                    onClick={() => patch(u.id, { active: !u.active })}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium disabled:cursor-default",
                      u.active ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-rose-50 text-rose-700 hover:bg-rose-100",
                    )}
                    title={u.active ? "Click to set Inactive (locks them out)" : "Click to reactivate"}
                  >
                    {u.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-2 text-right tabular-nums">{u.openTasks}</td>
                <td className="px-2"><PasswordControl userId={u.id} /></td>
                <td className="px-2 text-[12px] text-muted">{fmtDate(u.createdAt, true)}</td>
                <td className="px-2 text-right">
                  {u.id !== currentUserId && (
                    <button
                      className="rounded p-1.5 text-muted/60 hover:bg-rose-50 hover:text-rose-600"
                      title="Remove"
                      onClick={() => {
                        if (!confirm(`Remove ${u.name}? Their tasks become unassigned. Set them Inactive instead to keep the assignment.`)) return;
                        const prev = rows;
                        setRows((r) => r.filter((x) => x.id !== u.id));
                        start(async () => {
                          try { await deleteTeamUser(u.id); } catch (e) { setRows(prev); setError(e instanceof Error ? e.message : "Couldn't remove"); }
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
