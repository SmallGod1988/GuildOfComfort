import { requireRole } from "@/lib/session";
import TopBar from "@/components/TopBar";

const LINKS = [{ href: "/customer", label: "Мои объекты" }];

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("CUSTOMER");
  return (
    <>
      <TopBar fullName={session.fullName} role={session.role} links={LINKS} />
      <div className="container">{children}</div>
    </>
  );
}
