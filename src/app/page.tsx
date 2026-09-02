import { redirect } from "next/navigation";
import { getSession, homeForRole } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  redirect(session ? homeForRole(session.role) : "/login");
}
