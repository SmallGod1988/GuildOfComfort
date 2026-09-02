import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import { createSiteAction } from "@/app/actions/sites";
import { SITE_STATUS_LABEL } from "@/lib/labels";

export default async function AdminSitesPage() {
  const [sites, customers] = await Promise.all([
    prisma.site.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        subProjects: { include: { tasks: { select: { status: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { role: "CUSTOMER", deactivatedAt: null },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <>
      <h1>Объекты</h1>

      <div className="section card">
        <h2>Новый объект</h2>
        <ActionForm action={createSiteAction} submitLabel="Создать объект">
          <div className="field">
            <label htmlFor="name">Название объекта</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="address">Адрес</label>
            <input id="address" name="address" required />
          </div>
          <div className="field">
            <label htmlFor="customerId">Заказчик</label>
            <select id="customerId" name="customerId" defaultValue="">
              <option value="">— без заказчика (можно прикрепить позже) —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.email})
                </option>
              ))}
            </select>
            {customers.length === 0 && (
              <p className="hint">
                Пока нет ни одного зарегистрированного заказчика — можно создать
                объект без него и прикрепить заказчика позже со страницы объекта.
              </p>
            )}
          </div>
        </ActionForm>
      </div>

      <div className="section">
        <h2>Все объекты</h2>
        {sites.length === 0 ? (
          <p className="empty">Объектов пока нет.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Объект</th>
                <th>Заказчик</th>
                <th>Статус</th>
                <th>Прогресс</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const tasks = site.subProjects.flatMap((sp) => sp.tasks);
                const done = tasks.filter((t) => t.status === "DONE").length;
                const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
                return (
                  <tr key={site.id}>
                    <td>
                      <Link href={`/admin/sites/${site.id}`}>{site.name}</Link>
                      <div className="hint">{site.address}</div>
                    </td>
                    <td>{site.customer?.fullName ?? <span className="hint">не назначен</span>}</td>
                    <td>
                      <span className="badge">{SITE_STATUS_LABEL[site.status]}</span>
                    </td>
                    <td>
                      {tasks.length === 0 ? (
                        <span className="hint">нет задач</span>
                      ) : (
                        <>
                          <div className="progress-bar">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                          <div className="hint">
                            {done} из {tasks.length} задач ({pct}%)
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
