import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { TASK_STATUS_LABEL, TASK_STATUS_BADGE_CLASS } from "@/lib/labels";
import ActionForm from "@/components/ActionForm";
import {
  startTaskAction,
  resumeTaskAction,
  pauseTaskAction,
  blockTaskAction,
  finishTaskAction,
} from "@/app/actions/tasks";

export default async function InstallerTaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const session = await requireRole("INSTALLER");
  const { taskId } = await params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      operation: { include: { techCardMaterials: { include: { material: true } } } },
      subProject: { include: { site: true } },
      statusEvents: { orderBy: { createdAt: "desc" }, include: { createdBy: true } },
    },
  });
  if (!task || task.installerId !== session.userId) notFound();

  return (
    <>
      <p>
        <Link href={`/installer/sites/${task.subProject.siteId}`}>&larr; {task.subProject.site.name}</Link>
      </p>
      <h1>{task.title}</h1>
      <p className="hint">
        {task.subProject.name} · Операция: {task.operation.name}
      </p>
      <p>
        <span className={`badge ${TASK_STATUS_BADGE_CLASS[task.status]}`}>
          {TASK_STATUS_LABEL[task.status]}
        </span>
      </p>
      {task.description && <p>{task.description}</p>}

      {task.operation.tools.length > 0 && (
        <div className="section card">
          <h2>Инструменты</h2>
          <ul>
            {task.operation.tools.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        </div>
      )}

      {task.status === "ASSIGNED" && (
        <div className="section card">
          <ActionForm action={startTaskAction.bind(null, task.id)} submitLabel="Выполнить (начать работу)" />
        </div>
      )}

      {(task.status === "PAUSED" || task.status === "BLOCKED") && (
        <div className="section card">
          <p className="hint">Причина: {task.statusEvents[0]?.reason ?? "—"}</p>
          <ActionForm action={resumeTaskAction.bind(null, task.id)} submitLabel="Возобновить" />
        </div>
      )}

      {task.status === "IN_PROGRESS" && (
        <>
          <div className="grid-2 section">
            <div className="card">
              <h2>Поставить на паузу</h2>
              <ActionForm action={pauseTaskAction.bind(null, task.id)} submitLabel="На паузу" buttonClassName="secondary">
                <div className="field">
                  <label htmlFor="pause-reason">Причина</label>
                  <textarea id="pause-reason" name="reason" placeholder="Например: конец рабочего дня" required />
                </div>
              </ActionForm>
            </div>
            <div className="card">
              <h2>Заблокировать</h2>
              <ActionForm action={blockTaskAction.bind(null, task.id)} submitLabel="Заблокировать" buttonClassName="danger">
                <div className="field">
                  <label htmlFor="block-reason">Причина</label>
                  <textarea id="block-reason" name="reason" placeholder="Например: закончился материал" required />
                </div>
              </ActionForm>
            </div>
          </div>

          <div className="section card">
            <h2>Завершить задачу</h2>
            <p className="hint">
              Укажите фактически использованное количество материалов (подсказка — из
              технологической карты). Оставьте 0, если материал не расходовался.
            </p>
            <ActionForm action={finishTaskAction.bind(null, task.id)} submitLabel="Завершить и отправить на проверку">
              {task.operation.techCardMaterials.length === 0 ? (
                <p className="empty">В техкарте операции материалы не заданы.</p>
              ) : (
                task.operation.techCardMaterials.map((tcm) => (
                  <div className="field" key={tcm.id}>
                    <label htmlFor={`qty-${tcm.id}`}>
                      {tcm.material.name} ({tcm.material.unit}) — по техкарте: {tcm.quantity.toString()}
                    </label>
                    <input type="hidden" name="materialId" value={tcm.materialId} />
                    <input
                      id={`qty-${tcm.id}`}
                      name="quantity"
                      type="number"
                      step="0.001"
                      min="0"
                      defaultValue={tcm.quantity.toString()}
                    />
                  </div>
                ))
              )}
            </ActionForm>
          </div>
        </>
      )}

      {task.status === "IN_REVIEW" && (
        <p className="hint">Задача отправлена на проверку администратору.</p>
      )}
      {task.status === "DONE" && <p className="hint">Задача принята.</p>}

      <div className="section">
        <h2>История</h2>
        {task.statusEvents.length === 0 ? (
          <p className="empty">Пока пусто.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Когда</th>
                <th>Переход</th>
                <th>Причина</th>
                <th>Кто</th>
              </tr>
            </thead>
            <tbody>
              {task.statusEvents.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.createdAt.toLocaleString("ru-RU")}</td>
                  <td>
                    {TASK_STATUS_LABEL[ev.fromStatus]} → {TASK_STATUS_LABEL[ev.toStatus]}
                  </td>
                  <td>{ev.reason ?? "—"}</td>
                  <td>{ev.createdBy.fullName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
