import { redirect } from "next/navigation";
import BrandRegistryClient from "@/components/admin/BrandRegistryClient";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageBrands } from "@/lib/rbac";
import { isDone } from "@/lib/status";

// Old BRAND REGISTRY tab. Adding a brand no longer creates a Google Sheet:
// the brand appears in every Brand dropdown at once, and its POC gets a
// client login that shows only that brand's projects.
export default async function BrandsPage() {
  const me = await requireTeamPage();
  if (!canManageBrands(me)) redirect("/home");
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: { clients: { orderBy: { createdAt: "asc" } }, projects: { where: { archived: false } } },
  });
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight">Brands & clients</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-muted">
          Add a brand and it shows up in every Brand dropdown straight away. Give the brand's POC a client login and they
          get an email; they'll see only their brand's content, in client-friendly language, with the current revision round
          and delivery date.
        </p>
        <BrandRegistryClient
          brands={brands.map((b) => ({
            id: b.id,
            name: b.name,
            pocName: b.pocName ?? "",
            pocEmail: b.pocEmail ?? "",
            color: b.color,
            repositoryUrl: b.repositoryUrl ?? "",
            guidelines: b.guidelines ?? "",
            open: b.projects.filter((p) => !isDone(p as any)).length,
            total: b.projects.length,
            clients: b.clients.map((c) => ({ id: c.id, name: c.name, email: c.email })),
          }))}
        />
      </div>
    </div>
  );
}
