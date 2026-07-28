import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import { addTechCardMaterialAction, removeTechCardMaterialAction } from "@/app/actions/operations";

export default async function AdminOperationDetailPage({
  params,
}: {
  params: Promise<{ operationId: string }>;
}) {
  const { operationId } = await params;
  const [operation, materials] = await Promise.all([
    prisma.operation.findUnique({
      where: { id: operationId },
      include: { techCardMaterials: { include: { material: true } } },
    }),
    prisma.material.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!operation) notFound();

  return (
    <>
      <p>
        <Link href="/admin/operations">&larr; Справочник операций</Link>
      </p>
      <h1>{operation.name}</h1>
      {operation.category && <p className="hint">Категория: {operation.category}</p>}
      {operation.description && <p>{operation.description}</p>}

      <div className="section card">
        <h2>Инструменты</h2>
        {operation.tools.length === 0 ? (
          <p className="empty">Не указаны.</p>
        ) : (
          <ul>
            {operation.tools.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="section card">
        <h2>Технологическая карта: материалы</h2>
        {operation.techCardMaterials.length === 0 ? (
          <p className="empty">Материалы пока не заданы.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Материал</th>
                <th>Количество на операцию</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {operation.techCardMaterials.map((tcm) => (
                <tr key={tcm.id}>
                  <td>{tcm.material.name}</td>
                  <td>
                    {tcm.quantity.toString()} {tcm.material.unit}
                  </td>
                  <td>
                    <form
                      action={removeTechCardMaterialAction.bind(null, operation.id, tcm.materialId)}
                    >
                      <button type="submit" className="danger">
                        Удалить
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {materials.length > 0 && (
          <ActionForm action={addTechCardMaterialAction} submitLabel="Добавить материал">
            <input type="hidden" name="operationId" value={operation.id} />
            <div className="field">
              <label htmlFor="materialId">Материал</label>
              <select id="materialId" name="materialId" required defaultValue="">
                <option value="" disabled>
                  Выберите материал
                </option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quantity">Количество на операцию</label>
              <input id="quantity" name="quantity" type="number" step="0.001" min="0.001" required />
            </div>
          </ActionForm>
        )}
        {materials.length === 0 && (
          <p className="hint">
            Сначала добавьте материалы в <Link href="/admin/materials">справочнике материалов</Link>.
          </p>
        )}
      </div>
    </>
  );
}
