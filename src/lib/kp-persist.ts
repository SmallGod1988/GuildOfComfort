/**
 * Запись разобранной книги в базу.
 *
 * Отделено от серверного экшена: экшен занимается сессией и формой, а сюда
 * приходит уже разобранная книга. Такую функцию можно прогнать тестом на
 * настоящей базе, не подделывая сессию.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ParsedTask, ParsedWorkbook } from "@/lib/kp-import";

export type PersistTarget =
  | { kind: "existing"; siteId: string }
  | { kind: "new"; name: string; address: string };

export type PersistResult = {
  siteId: string;
  siteName: string;
  subProjectId: string;
  tasks: number;
  sections: number;
  flexible: number;
  blocks: number;
  dependencies: number;
};

/** Родитель должен существовать раньше ребёнка: разделы, затем по глубине номера. */
function depthOf(task: ParsedTask): number {
  return task.isSection ? -1 : task.code.split(".").length;
}

/**
 * Создаёт подпроект, блоки работ и дерево задач.
 *
 * Всегда добавляет новый подпроект и ничего не переписывает: повторная
 * загрузка книги — ещё один состав работ рядом, а не молчаливая замена уже
 * отмеченных монтажниками объёмов.
 */
export async function persistWorkbook(
  workbook: ParsedWorkbook,
  target: PersistTarget,
  subProjectName: string
): Promise<PersistResult> {
  let site: { id: string; name: string };
  if (target.kind === "existing") {
    const existing = await prisma.site.findUnique({
      where: { id: target.siteId },
      select: { id: true, name: true },
    });
    if (!existing) throw new Error("Объект не найден");
    site = existing;
  } else {
    site = await prisma.site.create({
      // Склад заводится вместе с объектом, как в createSiteAction: без него
      // монтажник не сможет завершить задачу — списание упрётся в его отсутствие.
      data: { name: target.name, address: target.address, warehouse: { create: {} } },
      select: { id: true, name: true },
    });
  }

  // Идентификаторы генерируются заранее, чтобы разложить всё пакетными
  // вставками: иначе 90 задач пришлось бы создавать по одной ради их id.
  const blockIdByCode = new Map<string, string>(
    workbook.blocks.map((b) => [b.code, randomUUID()])
  );
  const taskIdByCode = new Map<string, string>(workbook.tasks.map((t) => [t.code, randomUUID()]));

  const ordered = [...workbook.tasks].sort(
    (a, b) => depthOf(a) - depthOf(b) || a.sortOrder - b.sortOrder
  );

  const edges = workbook.blocks.flatMap((b) =>
    b.predecessorCodes
      .map((code) => ({
        blockId: blockIdByCode.get(b.code)!,
        predecessorId: blockIdByCode.get(code),
      }))
      // Предшественник, которого нет в книге, пропускается — о таких ссылках
      // парсер уже предупредил.
      .filter((e): e is { blockId: string; predecessorId: string } => !!e.predecessorId)
  );

  const subProjectId = randomUUID();
  const siteId = site.id;

  await prisma.$transaction(async (tx) => {
    await tx.subProject.create({ data: { id: subProjectId, siteId, name: subProjectName } });

    if (workbook.blocks.length > 0) {
      await tx.workBlock.createMany({
        data: workbook.blocks.map((b) => ({
          id: blockIdByCode.get(b.code)!,
          siteId,
          code: b.code,
          name: b.name,
          kpPositions: b.kpPositions,
          sortOrder: b.sortOrder,
          threshold: b.threshold,
          customerNote: b.customerNote,
        })),
        skipDuplicates: true,
      });

      if (edges.length > 0) {
        await tx.workBlockDependency.createMany({
          data: edges.map((e) => ({ id: randomUUID(), ...e })),
          skipDuplicates: true,
        });
      }
    }

    await tx.task.createMany({
      data: ordered.map((t) => ({
        id: taskIdByCode.get(t.code)!,
        subProjectId,
        operationId: null,
        parentId: t.parentCode ? taskIdByCode.get(t.parentCode) ?? null : null,
        blockId: t.blockCode ? blockIdByCode.get(t.blockCode) ?? null : null,
        title: t.title,
        description: t.note,
        code: t.code,
        sortOrder: t.sortOrder,
        isSection: t.isSection,
        isFlexible: t.isFlexible,
        system: t.system,
        unit: t.unit,
        volume: t.volume ?? 0,
        weight: t.weight,
        amount: t.amount,
        unitPrice: t.unitPrice,
      })),
    });
  });

  return {
    siteId,
    siteName: site.name,
    subProjectId,
    tasks: workbook.tasks.filter((t) => !t.isSection).length,
    sections: workbook.tasks.filter((t) => t.isSection).length,
    flexible: workbook.tasks.filter((t) => t.isFlexible).length,
    blocks: workbook.blocks.length,
    dependencies: edges.length,
  };
}
