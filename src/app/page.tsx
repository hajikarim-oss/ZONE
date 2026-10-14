import { redirect } from "next/navigation";
import { validSession } from "@/lib/auth";

export default async function RootPage() {
  const valid = await validSession();
  if (!valid) redirect("/login");
  redirect(valid === "CLIENT" ? "/portal" : "/home");
}
