import { prisma } from "@/lib/prisma";

export default async function AdminTimesheetPage() {
  const entries = await prisma.timesheetEntry.findMany({
    include: { installer: true, site: true },
    orderBy: { date: "desc" },
    take: 200,
  });

  return (
    <>
      <h1>Табель рабочего времени</h1>
      <p className="hint">Только для администратора — записи вносят сами монтажники.</p>
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
