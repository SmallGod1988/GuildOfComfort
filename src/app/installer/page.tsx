import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SITE_STATUS_LABEL } from "@/lib/labels";

export default async function InstallerSitesPage() {
  const session = await requireRole("INSTALLER");
  const assignments = await prisma.siteInstaller.findMany({
    where: { installerId: session.userId },
    include: {
      site: {
        include: { subProjects: { include: { tasks: { select: { status: true, installerId: true } } } } },
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  return (
    <>
      <h1>Мои объекты</h1>
      {assignments.length === 0 ? (
        <p className="empty">Вы пока не назначены ни на один объект.</p>
      ) : (
        assignments.map(({ site }) => {
          const tasks = site.subProjects.flatMap((sp) => sp.tasks);
          const mine = tasks.filter((t) => t.installerId === session.userId).length;
          const free = tasks.filter((t) => t.status === "FREE").length;
          return (
            <div key={site.id} className="card">
              <h2>
                <Link href={`/installer/sites/${site.id}`}>{site.name}</Link>
              </h2>
              <p className="hint">
                {site.address} · Статус: {SITE_STATUS_LABEL[site.status]}
              </p>
              <p>
                Свободных задач: {free} · Закреплено за мной: {mine}
              </p>
            </div>
          );
        })
      )}
    </>
  );
}
