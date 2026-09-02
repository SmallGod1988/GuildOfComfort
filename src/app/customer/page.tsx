import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SITE_STATUS_LABEL } from "@/lib/labels";

export default async function CustomerSitesPage() {
  const session = await requireRole("CUSTOMER");
  const sites = await prisma.site.findMany({
    where: { customerId: session.userId },
    include: { subProjects: { include: { tasks: { select: { status: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <h1>Мои объекты</h1>
      {sites.length === 0 ? (
        <p className="empty">Пока нет объектов.</p>
      ) : (
        sites.map((site) => {
          const tasks = site.subProjects.flatMap((sp) => sp.tasks);
          const done = tasks.filter((t) => t.status === "DONE").length;
          const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
          return (
            <div key={site.id} className="card">
              <h2>
                <Link href={`/customer/sites/${site.id}`}>{site.name}</Link>
              </h2>
              <p className="hint">
                {site.address} · Статус: {SITE_STATUS_LABEL[site.status]}
              </p>
              {tasks.length > 0 && (
                <>
                  <div className="progress-bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <p className="hint">
                    {done} из {tasks.length} задач выполнено ({pct}%)
                  </p>
                </>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
