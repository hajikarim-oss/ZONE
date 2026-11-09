"use client";

import { ExternalLink, FolderGit2, Info, Plus, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createBrand, createClientLogin, deleteBrand, deleteClientLogin, updateBrand, updateBrandDetails } from "@/lib/actions";

type BrandRow = {
  id: string;
  name: string;
  pocName: string;
  pocEmail: string;
  color: string;
  repositoryUrl?: string | null;
  guidelines?: string | null;
  open: number;
  total: number;
  clients: { id: string; name: string; email: string }[];
};

function AddBrand() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pocName, setPocName] = useState("");
  const [pocEmail, setPocEmail] = useState("");
  const [color, setColor] = useState("#5b3fd1");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add brand
      </button>
    );

  return (
    <form
      className="rounded-lg border border-line bg-canvas p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createBrand({ name, pocName, pocEmail, color, repositoryUrl, guidelines });
          if (r && "error" in r && r.error) return setError(r.error);
          window.location.reload();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand name" className="field-input" />
        <input value={pocName} onChange={(e) => setPocName(e.target.value)} placeholder="POC name (internal or client)" className="field-input" />
        <input type="email" value={pocEmail} onChange={(e) => setPocEmail(e.target.value)} placeholder="POC email" className="field-input" />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-[34px] w-12 cursor-pointer rounded-md border border-line bg-surface p-1" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="url"
          value={repositoryUrl}
          onChange={(e) => setRepositoryUrl(e.target.value)}
          placeholder="Master Google Drive repository URL (assets, raw files)..."
          className="field-input"
        />
        <input
          value={guidelines}
          onChange={(e) => setGuidelines(e.target.value)}
          placeholder="New joiner guidelines / onboarding notes..."
          className="field-input"
        />
      </div>
      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button disabled={pending} className="btn-primary">{pending ? "Adding…" : "Add brand"}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function ClientLoginForm({ brandId, onDone }: { brandId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createClientLogin({ brandId, name, email, password });
          if (r && "error" in r && r.error) return setError(r.error);
          window.location.reload();
        });
      }}
    >
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="field-input w-36 py-1" />
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="field-input w-52 py-1" />
      <input required type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ chars)" className="field-input w-44 py-1" />
      <button disabled={pending} className="btn-primary py-1">Create login</button>
      <button type="button" className="btn-ghost py-1" onClick={onDone}>Cancel</button>
      {error && <span className="text-[12px] text-rose-600">{error}</span>}
    </form>
  );
}

function BrandCard({ b }: { b: BrandRow }) {
  const [form, setForm] = useState(b);
  const [addingClient, setAddingClient] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const save = (patch: Partial<BrandRow>) =>
    start(async () => {
      try {
        await updateBrand(b.id, patch);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save");
      }
    });

  const saveDetails = (patch: { repositoryUrl?: string | null; guidelines?: string | null }) =>
    start(async () => {
      try {
        await updateBrandDetails(b.id, patch);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save details");
      }
    });

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          onBlur={() => form.color !== b.color && save({ color: form.color })}
          className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
          title="Brand colour"
        />
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onBlur={() => form.name.trim() && form.name !== b.name && save({ name: form.name })}
          className="cell-select w-48 text-[15px] font-semibold"
        />
        <Link href={`/brands/${b.id}`} className="text-[12px] text-accent hover:underline">
          {b.open} open · {b.total} total →
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={form.pocName}
            onChange={(e) => setForm({ ...form, pocName: e.target.value })}
            onBlur={() => form.pocName !== b.pocName && save({ pocName: form.pocName })}
            placeholder="POC name"
            className="field-input w-36 py-1"
          />
          <input
            value={form.pocEmail}
            onChange={(e) => setForm({ ...form, pocEmail: e.target.value })}
            onBlur={() => form.pocEmail !== b.pocEmail && save({ pocEmail: form.pocEmail })}
            placeholder="POC email"
            className="field-input w-56 py-1"
          />
          <button
            className="rounded p-1.5 text-muted/60 hover:bg-rose-50 hover:text-rose-600"
            title="Delete brand"
            onClick={() => {
              if (!confirm(`Delete ${b.name}?`)) return;
              start(async () => {
                try {
                  await deleteBrand(b.id);
                  window.location.reload();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't delete");
                }
              });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Master Drive Repository */}
      <div className="mt-3 flex items-center gap-2 text-[12px]">
        <FolderGit2 className="h-4 w-4 text-muted shrink-0" />
        <input
          type="url"
          value={form.repositoryUrl ?? ""}
          onChange={(e) => setForm({ ...form, repositoryUrl: e.target.value })}
          onBlur={() => form.repositoryUrl !== b.repositoryUrl && saveDetails({ repositoryUrl: form.repositoryUrl })}
          placeholder="Master Google Drive repository link (raw files, final exports, assets)..."
          className="field-input flex-1 py-1 text-[12px]"
        />
        {form.repositoryUrl && (
          <a
            href={form.repositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[12px] text-accent hover:underline shrink-0"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </a>
        )}
      </div>

      {/* Guidelines / Notes for New Joiners */}
      <div className="mt-2 text-[12px]">
        <textarea
          value={form.guidelines ?? ""}
          onChange={(e) => setForm({ ...form, guidelines: e.target.value })}
          onBlur={() => form.guidelines !== b.guidelines && saveDetails({ guidelines: form.guidelines })}
          placeholder="Brand guidelines & onboarding notes for new editors (e.g. fonts, aspect ratios, style references, dos & don'ts)..."
          rows={2}
          className="field-input w-full py-1 text-[12px] resize-y"
        />
      </div>

      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}

      <div className="mt-3 border-t border-line/70 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted">Client logins:</span>
          {b.clients.length === 0 && <span className="text-[12px] text-muted/70">none yet</span>}
          {b.clients.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[12px]">
              {c.name} <span className="text-muted">{c.email}</span>
              <button
                className="text-muted hover:text-rose-600"
                title="Remove login"
                onClick={() => {
                  if (!confirm(`Remove ${c.email}'s login?`)) return;
                  start(async () => {
                    await deleteClientLogin(c.id);
                    window.location.reload();
                  });
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {!addingClient && (
            <button className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline" onClick={() => setAddingClient(true)}>
              <UserPlus className="h-3 w-3" /> Add client login
            </button>
          )}
        </div>
        {addingClient && <ClientLoginForm brandId={b.id} onDone={() => setAddingClient(false)} />}
      </div>
    </div>
  );
}

export default function BrandRegistryClient({ brands }: { brands: BrandRow[] }) {
  return (
    <div className="mt-6 space-y-3">
      <AddBrand />
      {brands.map((b) => <BrandCard key={b.id} b={b} />)}
    </div>
  );
}
