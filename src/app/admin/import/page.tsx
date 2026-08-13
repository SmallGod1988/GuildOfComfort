import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ImportForm from "./ImportForm";

export default async function ImportPage() {
  await requireRole("ADMIN");

  const sites = await prisma.site.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, address: true },
  });

  return (
    <>
      <h1>Загрузка книги по объекту</h1>
      <p className="hint">
        Из книги создаются дерево задач с весами по стоимости позиций КП и блоки работ с их
        очерёдностью. Вес позиции — её доля в сумме КП, поэтому готовность по объекту показывает
        реальное освоение, а не долю закрытых строк.
      </p>

      <ImportForm sites={sites} />
    </>
  );
}
