import { requireRole } from "@/lib/session";
import TopBar from "@/components/TopBar";

const LINKS = [
  { href: "/admin", label: "Объекты" },
  { href: "/admin/operations", label: "Операции" },
  { href: "/admin/materials", label: "Материалы" },
  { href: "/admin/tasks/review", label: "Проверка задач" },
  { href: "/admin/timesheet", label: "Табель" },
  { href: "/admin/finance", label: "Финансы" },
  { href: "/admin/users", label: "Пользователи" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("ADMIN");
  return (
    <>
      <TopBar fullName={session.fullName} role={session.role} links={LINKS} />
      <div className="container">{children}</div>
    </>
  );
}
