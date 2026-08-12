import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import TimesheetForm, { type CrewOption, type SiteOption } from "@/components/TimesheetForm";

export default async function InstallerTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireRole("INSTALLER");
  const { tab } = await searchParams;
  const showData = tab === "data";

  const assignments = await prisma.siteInstaller.findMany({
    where: { installerId: session.userId },
    include: { site: true },
    orderBy: { site: { name: "asc" } },
  });

  const sites: SiteOption[] = assignments.map((a) => ({ id: a.siteId, name: a.site.name }));
  const foremanSiteIds = assignments.filter((a) => a.isForeman).map((a) => a.siteId);

  // Бригада: монтажники объектов, где текущий пользователь — бригадир.
  // Для каждого храним объекты, на которых право вносить за него действует.
  const crewLinks = foremanSiteIds.length
    ? await prisma.siteInstaller.findMany({
        where: {
          siteId: { in: foremanSiteIds },
          installerId: { not: session.userId },
          installer: { deactivatedAt: null },
        },
        include: { installer: true },
      })
    : [];

  const crewMap = new Map<string, CrewOption>();
  for (const link of crewLinks) {
    const existing = crewMap.get(link.installerId);
    if (existing) existing.siteIds.push(link.siteId);
    else
      crewMap.set(link.installerId, {
        id: link.installerId,
        fullName: link.installer.fullName,
        siteIds: [link.siteId],
      });
  }
  const crew = [...crewMap.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));

  // Записи: свои всегда; на объектах, где я бригадир, — ещё и записи бригады,
  // раз уж я их и вношу.
  const entries = await prisma.timesheetEntry.findMany({
    where: foremanSiteIds.length
      ? { OR: [{ installerId: session.userId }, { siteId: { in: foremanSiteIds } }] }
      : { installerId: session.userId },
    include: { site: true, installer: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  // Чипы быстрого выбора — объекты из моих последних записей.
  const recentSites: SiteOption[] = [];
  for (const entry of entries) {
    if (entry.installerId !== session.userId || !entry.site) continue;
    if (recentSites.some((s) => s.id === entry.site!.id)) continue;
    recentSites.push({ id: entry.site.id, name: entry.site.name });
    if (recentSites.length === 3) break;
  }

  return (
    <div className="ts-screen">
      <h1>Табель</h1>

      <nav className="ts-seg">
        <Link href="/installer/timesheet" aria-current={showData ? undefined : "page"}>
          Ввод
        </Link>
        <Link href="/installer/timesheet?tab=data" aria-current={showData ? "page" : undefined}>
          Данные
        </Link>
      </nav>

      {showData ? (
        entries.length === 0 ? (
          <p className="empty">Записей пока нет.</p>
        ) : (
          <div className="ts-form">
            {entries.map((e) => (
              <div className="ts-entry" key={e.id}>
                <span className="ts-date">
                  {e.date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                </span>
                <span className="ts-main">
                  <div>{e.site?.name ?? "Без объекта"}</div>
                  {e.installerId !== session.userId && (
                    <div className="ts-who">{e.installer.fullName}</div>
                  )}
                  {e.note && <div className="ts-caption">{e.note}</div>}
                </span>
                <span className="ts-hours">{e.hours.toString()} ч</span>
              </div>
            ))}
          </div>
        )
      ) : sites.length === 0 ? (
        <p className="empty">
          Вас пока не назначили ни на один объект — часы можно внести без объекта.
        </p>
      ) : null}

      {!showData && (
        <>
          {crew.length > 0 && (
            <p className="ts-caption">
              Вы бригадир — можно внести часы за монтажника своей бригады.
            </p>
          )}
          <TimesheetForm
            me={{ id: session.userId, fullName: session.fullName }}
            sites={sites}
            crew={crew}
            recentSites={recentSites}
          />
        </>
      )}
    </div>
  );
}
