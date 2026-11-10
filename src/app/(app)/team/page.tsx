import { redirect } from "next/navigation";
import TeamManagementClient from "@/components/admin/TeamManagementClient";
import { requireTeamPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/rbac";
import { isDone } from "@/lib/status";

// Same Team page as the Campaign Panel (add person, role, password, remove)
// plus what the TEAM REGISTRY tab did here: department and Active/Inactive.
export default async function TeamPage() {
  const me = await requireTeamPage();
  if (!canManageTeam(me)) redirect("/home");
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { department: "asc" }, { name: "asc" }],
    include: { assigned: { where: { archived: false } } },
  });
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight">Team</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-muted">
          Add someone here and they get a welcome email and can sign in with that Google account straight away. Set someone
          Inactive to lock them out; their tasks stay as they are. Admins see everything, managers see and edit all projects,
          team members only see their own tasks.
        </p>
        <TeamManagementClient
          currentUserId={me.id}
          users={users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            department: u.department,
            active: u.active,
            hourlyRate: u.hourlyRate ?? 300,
            openTasks: u.assigned.filter((p) => !isDone(p as any)).length,
            createdAt: u.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
