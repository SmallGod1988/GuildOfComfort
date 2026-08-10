import { prisma } from "@/lib/prisma";

export default async function AdminTimesheetPage() {
  const entries = await prisma.timesheetEntry.findMany({
    include: { installer: true, site: true },
    orderBy: { date: "desc" },
    take: 200,
  });

  // Период выгрузки по умолчанию — текущий месяц целиком.
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const monthStart = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const monthEnd = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));

  return (
    <>
      <h1>Табель рабочего времени</h1>
      <p className="hint">
        Только для администратора — записи вносят монтажники, а на своих
        объектах ещё и бригадиры за бригаду.
      </p>

      <div className="section card">
        <h2>Выгрузка в Excel</h2>
        <p className="hint">
          Книга из семи листов с живыми формулами: табель, сводки и отчёты.
          Дописанные вручную строки пересчитываются автоматически.
        </p>
        <form method="get" action="/api/export/timesheet">
          <div className="grid-2">
            <div className="field">
              <label htmlFor="from">Период с</label>
              <input id="from" name="from" type="date" defaultValue={monthStart} required />
            </div>
            <div className="field">
              <label htmlFor="to">по</label>
              <input id="to" name="to" type="date" defaultValue={monthEnd} required />
            </div>
          </div>
          <button type="submit">Выгрузить в Excel</button>
        </form>
      </div>
      {entries.length === 0 ? (
        <p className="empty">Записей пока нет.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Монтажник</th>
              <th>Объект</th>
              <th>Часы</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{e.date.toLocaleDateString("ru-RU")}</td>
                <td>{e.installer.fullName}</td>
                <td>{e.site?.name ?? "—"}</td>
                <td>{e.hours.toString()}</td>
                <td>{e.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
