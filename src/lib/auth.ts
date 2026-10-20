import { type NextAuthOptions, getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";

// Same login logic as the Campaign Panel (src/lib/auth.ts there):
//  - Team signs in with Google. Google only proves who someone is; they get
//    in only if an admin already added them on the Team page (User row).
//  - Clients (brand POCs) sign in with email + password, created by an admin
//    on the Brands page.
//  - A team member can optionally be given a password too (testing, or no
//    Google access).
// One difference: the post-production team includes freelancers on personal
// Gmail (e.g. Umesh, Ayush Shukla, Hafsa), so Google sign-in is accepted for
// any address an admin has added — not only @theboredmonkey.com. The User
// table is still the gate. Inactive users are refused (old "tab locked").
const COMPANY_DOMAIN = "theboredmonkey.com";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  brandId?: string | null;
};

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { prompt: "select_account" } },
    }),
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.toLowerCase().trim();

        const client = await prisma.client.findUnique({ where: { email } });
        if (client) {
          const ok = await bcrypt.compare(credentials.password, client.passwordHash);
          if (!ok) return null;
          return { id: client.id, name: client.name, email: client.email, role: "CLIENT", brandId: client.brandId } as any;
        }

        // Team members created on the Team page get a random password hash,
        // so this only matches someone deliberately given a password.
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role } as any;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.toLowerCase() ?? "";
      if (!email) return false;
      const existing = await prisma.user.findUnique({ where: { email } });
      return Boolean(existing?.active);
    },
    async jwt({ token, user, account }) {
      if (user && account?.provider === "google" && user.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email.toLowerCase() } });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name;
        }
      } else if (user && account?.provider === "credentials") {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.brandId = (user as any).brandId ?? null;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role as Role;
        (session.user as any).brandId = (token as any).brandId ?? null;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
};

export async function currentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  return ((session?.user as SessionUser | undefined) ?? null) as SessionUser | null;
}

// For server actions. Re-reads the User row on every call so a role change or
// "Inactive" takes effect immediately, not only after the JWT expires.
// Looks the person up by id, falling back to email (the id inside an old
// login cookie goes stale if the database is recreated or re-imported).
// Also loads the brand workspaces the person is a member of (brandIds).
async function findTeamUser(s: SessionUser) {
  const withBrands = { brands: { select: { id: true } } } as const;
  const u =
    (s.id ? await prisma.user.findUnique({ where: { id: s.id }, include: withBrands }) : null) ??
    (s.email ? await prisma.user.findUnique({ where: { email: s.email.toLowerCase() }, include: withBrands }) : null);
  if (!u) return null;
  const { brands, ...user } = u;
  return { ...user, brandIds: brands.map((b) => b.id) };
}

// Is this session still valid against the database? Used by /login and / so
// a stale cookie doesn't bounce between /home and /login forever.
export async function validSession(): Promise<"TEAM" | "CLIENT" | null> {
  const s = await currentUser();
  if (!s) return null;
  if (s.role === "CLIENT") {
    const c = await prisma.client.findUnique({ where: { id: s.id } });
    return c ? "CLIENT" : null;
  }
  const u = await findTeamUser(s);
  return u?.active ? "TEAM" : null;
}

export async function requireTeamUser() {
  const s = await currentUser();
  if (!s || s.role === "CLIENT") throw new Error("UNAUTHENTICATED");
  const user = await findTeamUser(s);
  if (!user || !user.active) throw new Error("Your account is inactive. Contact your admin.");
  return user;
}

// For pages inside the team app shell.
export async function requireTeamPage() {
  const s = await currentUser();
  if (!s) redirect("/login");
  if (s.role === "CLIENT") redirect("/portal");
  const user = await findTeamUser(s);
  if (!user || !user.active) redirect("/login?error=Inactive");
  return user;
}

export { COMPANY_DOMAIN };
