import { requireRole } from "@/lib/session";
import TopBar from "@/components/TopBar";

const LINKS = [
  { href: "/installer", label: "Мои объекты" },
  { href: "/installer/timesheet", label: "Табель" },
];

export default async function InstallerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("INSTALLER");
  return (
    <>
      <TopBar fullName={session.fullName} role={session.role} links={LINKS} />
      <div className="container">{children}</div>
    </>
  );
}
