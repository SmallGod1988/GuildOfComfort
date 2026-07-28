import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import { createMaterialAction } from "@/app/actions/materials";

export default async function AdminMaterialsPage() {
  const materials = await prisma.material.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <h1>Справочник материалов</h1>

      <div className="section card">
        <h2>Новый материал</h2>
        <ActionForm action={createMaterialAction} submitLabel="Добавить материал">
          <div className="field">
            <label htmlFor="name">Название</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="unit">Единица измерения</label>
            <input id="unit" name="unit" placeholder="шт, м, кг" required />
          </div>
        </ActionForm>
      </div>

      <div className="section">
        {materials.length === 0 ? (
          <p className="empty">Материалов пока нет.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Название</th>
                <th>Ед. изм.</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
