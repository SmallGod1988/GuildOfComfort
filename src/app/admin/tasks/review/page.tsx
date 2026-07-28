import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import { acceptTaskAction, rejectTaskAction } from "@/app/actions/tasks";

export default async function AdminTaskReviewPage() {
  const tasks = await prisma.task.findMany({
    where: { status: "IN_REVIEW" },
    include: {
      operation: true,
      installer: true,
      subProject: { include: { site: true } },
      statusEvents: { orderBy: { createdAt: "desc" }, take: 1, include: { createdBy: true } },
    },
    orderBy: { completedAt: "asc" },
  });

  return (
    <>
      <h1>Проверка выполненных задач</h1>
      {tasks.length === 0 ? (
        <p className="empty">Сейчас нет задач, ожидающих проверки.</p>
      ) : (
        tasks.map((task) => (
          <div key={task.id} className="card">
            <h2>{task.title}</h2>
            <p className="hint">
              {task.subProject.site.name} · {task.subProject.name} · Операция: {task.operation.name}
            </p>
            <p>Монтажник: {task.installer?.fullName ?? "—"}</p>
            {task.description && <p>{task.description}</p>}

            <div className="btn-row">
              <ActionForm action={acceptTaskAction.bind(null, task.id)} submitLabel="Принять" />
            </div>
            <div className="section" style={{ marginTop: 12 }}>
              <ActionForm action={rejectTaskAction.bind(null, task.id)} submitLabel="Вернуть в работу" buttonClassName="secondary">
                <div className="field">
                  <label htmlFor={`reason-${task.id}`}>Комментарий (что нужно исправить)</label>
                  <textarea id={`reason-${task.id}`} name="reason" required />
                </div>
              </ActionForm>
            </div>
          </div>
        ))
      )}
    </>
  );
}
