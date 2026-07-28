import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { TASK_STATUS_LABEL, TASK_STATUS_BADGE_CLASS, SITE_STATUS_LABEL } from "@/lib/labels";

export default async function CustomerSiteDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await requireRole("CUSTOMER");
  const { siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      subProjects: {
        include: { tasks: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!site || site.customerId !== session.userId) notFound();

  return (
    <>
      <p>
        <Link href="/customer">&larr; Мои объекты</Link>
      </p>
      <h1>{site.name}</h1>
      <p className="hint">
        {site.address} · Статус: {SITE_STATUS_LABEL[site.status]}
      </p>

      {site.subProjects.length === 0 ? (
        <p className="empty">Работы по объекту ещё не начаты.</p>
      ) : (
        site.subProjects.map((sp) => {
          const done = sp.tasks.filter((t) => t.status === "DONE").length;
          const pct = sp.tasks.length ? Math.round((done / sp.tasks.length) * 100) : 0;
          return (
            <div key={sp.id} className="card">
              <h2>{sp.name}</h2>
              {sp.tasks.length > 0 && (
                <>
                  <div className="progress-bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <p className="hint">
                    {done} из {sp.tasks.length} задач выполнено ({pct}%)
                  </p>
                </>
              )}
              {sp.tasks.length === 0 ? (
                <p className="empty">Задач пока нет.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Задача</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sp.tasks.map((task) => (
                      <tr key={task.id}>
                        <td>{task.title}</td>
                        <td>
                          <span className={`badge ${TASK_STATUS_BADGE_CLASS[task.status]}`}>
                            {TASK_STATUS_LABEL[task.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
