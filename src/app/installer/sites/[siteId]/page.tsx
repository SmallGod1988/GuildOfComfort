import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { TASK_STATUS_LABEL, TASK_STATUS_BADGE_CLASS } from "@/lib/labels";
import { takeTaskAction } from "@/app/actions/tasks";
import ActionForm from "@/components/ActionForm";

export default async function InstallerSiteDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await requireRole("INSTALLER");
  const { siteId } = await params;

  const onSite = await prisma.siteInstaller.findUnique({
    where: { siteId_installerId: { siteId, installerId: session.userId } },
  });
  if (!onSite) notFound();

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      subProjects: {
        include: { tasks: { include: { operation: true, installer: true }, orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!site) notFound();

  return (
    <>
      <p>
        <Link href="/installer">&larr; Мои объекты</Link>
      </p>
      <h1>{site.name}</h1>
      <p className="hint">{site.address}</p>

      {site.subProjects.length === 0 ? (
        <p className="empty">Подпроектов пока нет.</p>
      ) : (
        site.subProjects.map((sp) => (
          <div key={sp.id} className="card">
            <h2>{sp.name}</h2>
            {sp.tasks.length === 0 ? (
              <p className="empty">Задач пока нет.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Задача</th>
                    <th>Операция</th>
                    <th>Статус</th>
                    <th>Монтажник</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sp.tasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        {task.installerId === session.userId ? (
                          <Link href={`/installer/tasks/${task.id}`}>{task.title}</Link>
                        ) : (
                          task.title
                        )}
                      </td>
                      <td>{task.operation?.name ?? "—"}</td>
                      <td>
                        <span className={`badge ${TASK_STATUS_BADGE_CLASS[task.status]}`}>
                          {TASK_STATUS_LABEL[task.status]}
                        </span>
                      </td>
                      <td>{task.installer?.fullName ?? "—"}</td>
                      <td>
                        {task.status === "FREE" && (
                          <ActionForm action={takeTaskAction.bind(null, task.id)} submitLabel="Взять в работу" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))
      )}
    </>
  );
}
