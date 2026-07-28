import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import { createTaskAction } from "@/app/actions/tasks";
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
          <ActionForm action={createTaskAction} submitLabel="Создать задачу">
            <input type="hidden" name="subProjectId" value={subProject.id} />
            <div className="field">
              <label htmlFor="operationId">Операция</label>
              <select id="operationId" name="operationId" required defaultValue="">
                <option value="" disabled>
                  Выберите операцию
                </option>
                {operations.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="title">Название задачи</label>
              <input id="title" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="description">Описание (необязательно)</label>
              <textarea id="description" name="description" />
            </div>
          </ActionForm>
        )}
      </div>
    </>
  );
}
