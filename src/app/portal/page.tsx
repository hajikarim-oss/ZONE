import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientStatus, computeStage, isDone } from "@/lib/status";
import { cn, fmtDate } from "@/lib/utils";

// Brand POC view (replaces the per-brand Google Sheet). Only this brand's
// projects, client-friendly status, revision round and delivery date — no
// assignees, internal deadlines or notes.
export default async function PortalPage() {
  const s = await currentUser();
  if (!s) redirect("/login");
  if (s.role !== "CLIENT") redirect("/home");
  const client = await prisma.client.findUnique({ where: { id: s.id }, include: { brand: true } });
  if (!client) redirect("/login?error=Inactive");

  const projects = await prisma.project.findMany({
    where: { brandId: client.brandId, archived: false },
    orderBy: [{ externalDeadline: "asc" }, { code: "asc" }],
  });

  const review = projects.filter((p) => computeStage(p).key === "review");
  const progress = projects.filter((p) => !isDone(p) && computeStage(p).key !== "review");
  const done = projects.filter((p) => isDone(p));
  const brand = client.brand;

  const Section = ({ title, items, hint }: { title: string; items: typeof projects; hint?: string }) =>
    items.length ? (
      <section className="mt-8">
        <h2 className="text-[15px] font-semibold">
          {title} <span className="ml-1 text-[13px] font-normal text-muted">{items.length}</span>
        </h2>
        {hint && <p className="text-[12px] text-muted">{hint}</p>}
        <div className="mt-2 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-canvas text-left text-[12px] text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Content</th>
                <th className="px-2 py-2 font-medium">Format</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 text-center font-medium">Revision round</th>
                <th className="px-4 py-2 font-medium">Delivery date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-line/70">
                  <td className="px-4 py-2.5">{p.title}</td>
                  <td className="px-2 text-muted">{[p.type, p.platform].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[12px] font-medium",
                        computeStage(p).key === "review" ? "bg-rose-50 text-rose-700" : isDone(p) ? "bg-emerald-50 text-emerald-700" : "bg-canvas text-ink",
                      )}
                    >
                      {clientStatus(p)}
                    </span>
                  </td>
                  <td className="px-2 text-center tabular-nums">{p.revisionRound || "—"}</td>
                  <td className="px-4 text-muted">{fmtDate(p.externalDeadline, true) || "To be confirmed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ) : null;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <span className="h-8 w-8 rounded-md" style={{ background: brand.color }} />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold">{brand.name} × TBM</div>
            <div className="text-[12px] text-muted">Live content tracker</div>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[12px] text-muted">
            <Logo className="h-6 w-auto opacity-80" />
            {client.name}
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-16">
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            ["Awaiting your review", review.length],
            ["In progress", progress.length],
            ["Delivered", done.length],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-lg border border-line px-4 py-3">
              <div className="text-[12px] text-muted">{l}</div>
              <div className="text-[24px] font-semibold tabular-nums">{v as number}</div>
            </div>
          ))}
        </div>
        {projects.length === 0 && <p className="mt-16 text-center text-[13px] text-muted">No content in production yet.</p>}
        <Section title="Ready for your review" items={review} hint="Please share feedback with your TBM point of contact." />
        <Section title="In progress" items={progress} />
        <Section title="Delivered" items={done} />
      </main>
    </div>
  );
}
