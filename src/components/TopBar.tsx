import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Администратор",
  INSTALLER: "Монтажник",
  CUSTOMER: "Заказчик",
};

export default function TopBar({
  fullName,
  role,
  links,
}: {
  fullName: string;
  role: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="topbar">
      <div className="topbar-brand">Гильдия Комфорта</div>
      <nav className="topbar-nav">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="topbar-user">
        <span>
          {fullName} · {ROLE_LABEL[role] ?? role}
        </span>
        {/* Видно прямо на работающем сервере, какая версия там развёрнута. */}
        <span className="topbar-version" title="Версия приложения">
          v{process.env.APP_VERSION}
        </span>
        <form action={logoutAction}>
          <button type="submit" className="secondary">
            Выйти
          </button>
        </form>
      </div>
    </div>
  );
}
