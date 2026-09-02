import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import { createOperationAction } from "@/app/actions/operations";

export default async function AdminOperationsPage() {
  const operations = await prisma.operation.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { techCardMaterials: true, tasks: true } } },
  });

  return (
    <>
      <h1>Справочник операций</h1>
      <p className="hint">
        Каждая задача монтажника базируется на операции из этого справочника.
        У операции есть технологическая карта: инструменты и нормы расхода
        материалов на одну единицу работ. Фактический расход по задаче
        считается как норма × объём работ.
      </p>

      <div className="section card">
        <h2>Новая операция</h2>
        <ActionForm action={createOperationAction} submitLabel="Создать операцию">
          <div className="field">
            <label htmlFor="name">Название</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="unit">Единица измерения работ</label>
            <input id="unit" name="unit" defaultValue="компл." placeholder="м / м² / шт / компл." required />
            <p className="hint">
              В этих единицах задаются нормы техкарты и объём каждой задачи.
              Не путать с единицей самого материала.
            </p>
          </div>
          <div className="field">
            <label htmlFor="laborNorm">Норма трудозатрат, чел.-ч на единицу (необязательно)</label>
            <input id="laborNorm" name="laborNorm" type="number" step="0.001" min="0.001" placeholder="0.4" />
          </div>
          <div className="field">
            <label htmlFor="category">Категория (необязательно)</label>
            <input id="category" name="category" placeholder="Вентиляция / Электрика / Кондиционирование" />
          </div>
          <div className="field">
            <label htmlFor="description">Описание (необязательно)</label>
            <textarea id="description" name="description" />
          </div>
          <div className="field">
            <label htmlFor="tools">Инструменты (через запятую, необязательно)</label>
            <input id="tools" name="tools" placeholder="Перфоратор, шуруповёрт, уровень" />
          </div>
        </ActionForm>
      </div>

      <div className="section">
        {operations.length === 0 ? (
          <p className="empty">Операций пока нет.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Операция</th>
                <th>Категория</th>
                <th>Единица работ</th>
                <th>Трудозатраты</th>
                <th>Материалов в техкарте</th>
                <th>Используется в задачах</th>
              </tr>
            </thead>
            <tbody>
              {operations.map((op) => (
                <tr key={op.id}>
                  <td>
                    <Link href={`/admin/operations/${op.id}`}>{op.name}</Link>
                  </td>
                  <td>{op.category ?? "—"}</td>
                  <td>{op.unit}</td>
                  <td>
                    {op.laborNorm ? `${op.laborNorm.toString()} чел.-ч / ${op.unit}` : "—"}
                  </td>
                  <td>{op._count.techCardMaterials}</td>
                  <td>{op._count.tasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
