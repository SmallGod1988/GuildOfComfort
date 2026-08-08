import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TaskForm from "@/components/TaskForm";
import { TASK_STATUS_LABEL, TASK_STATUS_BADGE_CLASS } from "@/lib/labels";

export default async function AdminSubProjectPage({
  params,
}: {
  params: Promise<{ siteId: string; subProjectId: string }>;
}) {
  const { siteId, subProjectId } = await params;
  const [subProject, operations] = await Promise.all([
    prisma.subProject.findUnique({
      where: { id: subProjectId },
      include: {
        site: true,
        tasks: {
          include: { operation: true, installer: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.operation.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!subProject || subProject.siteId !== siteId) notFound();

  return (
    <>
      <p>
        <Link href={`/admin/sites/${siteId}`}>&larr; {subProject.site.name}</Link>
      </p>
      <h1>{subProject.name}</h1>

      <div className="section">
        {subProject.tasks.length === 0 ? (
          <p className="empty">Задач пока нет.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Задача</th>
                <th>Операция</th>
                <th>Объём</th>
                <th>Статус</th>
                <th>Монтажник</th>
              </tr>
            </thead>
            <tbody>
              {subProject.tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.operation.name}</td>
                  <td>
                    {task.volume.toString()} {task.operation.unit}
                    {task.operation.laborNorm && (
                      <div className="hint">
                        {(Number(task.operation.laborNorm) * Number(task.volume)).toFixed(2)} чел.-ч
                        по норме
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${TASK_STATUS_BADGE_CLASS[task.status]}`}>
                      {TASK_STATUS_LABEL[task.status]}
                    </span>
                  </td>
                  <td>{task.installer?.fullName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section card">
        <h2>Новая задача</h2>
        {operations.length === 0 ? (
          <p className="hint">
            Сначала добавьте хотя бы одну операцию в{" "}
            <Link href="/admin/operations">справочнике операций</Link>.
          </p>
        ) : (
          <TaskForm
            subProjectId={subProject.id}
            operations={operations.map((op) => ({
              id: op.id,
              name: op.name,
              unit: op.unit,
              laborNorm: op.laborNorm?.toString() ?? null,
            }))}
          />
        )}
      </div>
    </>
  );
}
