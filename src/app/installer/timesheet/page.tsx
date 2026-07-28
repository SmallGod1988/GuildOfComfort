import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ActionForm from "@/components/ActionForm";
import { addTimesheetEntryAction } from "@/app/actions/timesheet";

export default async function InstallerTimesheetPage() {
  const session = await requireRole("INSTALLER");
  const [entries, assignments] = await Promise.all([
    prisma.timesheetEntry.findMany({
      where: { installerId: session.userId },
      include: { site: true },
      orderBy: { date: "desc" },
    }),
    prisma.siteInstaller.findMany({
      where: { installerId: session.userId },
      include: { site: true },
    }),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <h1>Мой табель</h1>

      <div className="section card">
        <h2>Внести часы</h2>
        <ActionForm action={addTimesheetEntryAction} submitLabel="Сохранить">
          <div className="field">
            <label htmlFor="date">Дата</label>
            <input id="date" name="date" type="date" defaultValue={today} required />
          </div>
          <div className="field">
            <label htmlFor="hours">Часы</label>
            <input id="hours" name="hours" type="number" step="0.5" min="0.5" max="24" required />
          </div>
          <div className="field">
            <label htmlFor="siteId">Объект (необязательно)</label>
            <select id="siteId" name="siteId" defaultValue="">
              <option value="">—</option>
              {assignments.map((a) => (
                <option key={a.siteId} value={a.siteId}>
                  {a.site.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="note">Комментарий (необязательно)</label>
            <input id="note" name="note" />
          </div>
        </ActionForm>
      </div>

      <div className="section">
        {entries.length === 0 ? (
          <p className="empty">Записей пока нет.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Часы</th>
                <th>Объект</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.date.toLocaleDateString("ru-RU")}</td>
                  <td>{e.hours.toString()}</td>
                  <td>{e.site?.name ?? "—"}</td>
                  <td>{e.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
