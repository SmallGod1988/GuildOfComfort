import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import { updateTimesheetEntryAction } from "@/app/actions/timesheet";

export default async function EditTimesheetEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const entry = await prisma.timesheetEntry.findUnique({
    where: { id: entryId },
    include: { installer: true, site: true },
  });
  if (!entry) notFound();

  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <>
      <p>
        <Link href="/admin/timesheet">&larr; Табель</Link>
      </p>
      <h1>Редактирование записи</h1>
      <p className="hint">
        {entry.installer.fullName} · {entry.date.toLocaleDateString("ru-RU")}
      </p>

      <div className="section card">
        <ActionForm action={updateTimesheetEntryAction.bind(null, entryId)} submitLabel="Сохранить">
          <div className="field">
            <label htmlFor="date">Дата</label>
            <input id="date" name="date" type="date" defaultValue={iso(entry.date)} required />
          </div>
          <div className="field">
            <label htmlFor="siteId">Объект</label>
            <select id="siteId" name="siteId" defaultValue={entry.siteId || ""}>
              <option value="">Без объекта</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hours">Часы</label>
            <input
              id="hours"
              name="hours"
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              defaultValue={entry.hours.toString()}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="note">Комментарий</label>
            <input id="note" name="note" defaultValue={entry.note || ""} />
          </div>
        </ActionForm>
      </div>
    </>
  );
}
