import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import {
  assignInstallerAction,
  unassignInstallerAction,
  updateSiteStatusAction,
} from "@/app/actions/sites";
import { createSubProjectAction } from "@/app/actions/subprojects";
import { addStockAction } from "@/app/actions/warehouse";
import { SITE_STATUS_LABEL as STATUS_LABEL } from "@/lib/labels";

export default async function AdminSiteDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      customer: true,
      subProjects: {
        include: { tasks: { select: { status: true } } },
        orderBy: { createdAt: "asc" },
      },
      installers: { include: { installer: true } },
      warehouse: { include: { stock: { include: { material: true } } } },
    },
  });
  if (!site) notFound();

  const [allInstallers, materials] = await Promise.all([
    prisma.user.findMany({ where: { role: "INSTALLER" }, orderBy: { fullName: "asc" } }),
    prisma.material.findMany({ orderBy: { name: "asc" } }),
  ]);
  const assignedIds = new Set(site.installers.map((i) => i.installerId));
  const availableInstallers = allInstallers.filter((i) => !assignedIds.has(i.id));

  return (
    <>
      <p>
        <Link href="/admin">&larr; Все объекты</Link>
      </p>
      <h1>{site.name}</h1>
      <p className="hint">
        {site.address} · Заказчик: {site.customer.fullName}
      </p>

      <div className="section card">
        <h2>Статус объекта: {STATUS_LABEL[site.status]}</h2>
        <div className="btn-row">
          {(["ACTIVE", "ON_HOLD", "COMPLETED"] as const).map((status) => (
            <form key={status} action={updateSiteStatusAction.bind(null, site.id, status)}>
              <button
                type="submit"
                className={status === site.status ? "" : "secondary"}
                disabled={status === site.status}
              >
                {STATUS_LABEL[status]}
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="section card">
        <h2>Подпроекты</h2>
        {site.subProjects.length === 0 ? (
          <p className="empty">Подпроектов пока нет.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Подпроект</th>
                <th>Задачи</th>
              </tr>
            </thead>
            <tbody>
              {site.subProjects.map((sp) => {
                const done = sp.tasks.filter((t) => t.status === "DONE").length;
                return (
                  <tr key={sp.id}>
                    <td>
                      <Link href={`/admin/sites/${site.id}/sub-projects/${sp.id}`}>{sp.name}</Link>
                    </td>
                    <td>
                      {done} из {sp.tasks.length} выполнено
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <ActionForm action={createSubProjectAction} submitLabel="Добавить подпроект">
          <input type="hidden" name="siteId" value={site.id} />
          <div className="field">
            <label htmlFor="sp-name">Название подпроекта</label>
            <input id="sp-name" name="name" placeholder="Например: Вентиляция" required />
          </div>
        </ActionForm>
      </div>

      <div className="grid-2">
        <div className="section card">
          <h2>Монтажники на объекте</h2>
          {site.installers.length === 0 ? (
            <p className="empty">Никто не назначен.</p>
          ) : (
            <table>
              <tbody>
                {site.installers.map((si) => (
                  <tr key={si.id}>
                    <td>{si.installer.fullName}</td>
                    <td>
                      <form action={unassignInstallerAction.bind(null, site.id, si.installerId)}>
                        <button type="submit" className="danger">
                          Снять
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {availableInstallers.length > 0 && (
            <ActionForm action={assignInstallerAction} submitLabel="Назначить">
              <input type="hidden" name="siteId" value={site.id} />
              <div className="field">
                <label htmlFor="installerId">Монтажник</label>
                <select id="installerId" name="installerId" required defaultValue="">
                  <option value="" disabled>
                    Выберите монтажника
                  </option>
                  {availableInstallers.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.fullName} ({i.email})
                    </option>
                  ))}
                </select>
              </div>
            </ActionForm>
          )}
        </div>

        <div className="section card">
          <h2>Склад объекта</h2>
          {!site.warehouse || site.warehouse.stock.length === 0 ? (
            <p className="empty">Остатков пока нет.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Материал</th>
                  <th>Остаток</th>
                </tr>
              </thead>
              <tbody>
                {site.warehouse.stock.map((s) => (
                  <tr key={s.id}>
                    <td>{s.material.name}</td>
                    <td>
                      {s.quantity.toString()} {s.material.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {materials.length > 0 && (
            <ActionForm action={addStockAction} submitLabel="Оприходовать">
              <input type="hidden" name="siteId" value={site.id} />
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
                <label htmlFor="quantity">Количество</label>
                <input id="quantity" name="quantity" type="number" step="0.001" min="0.001" required />
              </div>
              <div className="field">
                <label htmlFor="note">Комментарий (необязательно)</label>
                <input id="note" name="note" />
              </div>
            </ActionForm>
          )}
        </div>
      </div>
    </>
  );
}
