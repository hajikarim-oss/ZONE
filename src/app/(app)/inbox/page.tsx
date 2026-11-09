import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import InboxClient from "./InboxClient";

export default async function InboxPage() {
  const me = await requireTeamPage();
  const rawItems = await prisma.notification.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const items = rawItems.map((n) => ({
    id: n.id,
    userId: n.userId,
    title: n.title,
    body: n.body,
    href: n.href,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }));

  return <InboxClient initialItems={items} />;
}
