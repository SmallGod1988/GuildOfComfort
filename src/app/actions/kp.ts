"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { parseKpWorkbook } from "@/lib/kp-import";
import { persistWorkbook, type PersistTarget } from "@/lib/kp-persist";

export type ImportState = {
  error?: string;
  /** Заполняется при успешном импорте — показывается на странице. */
  result?: {
    siteId: string;
    siteName: string;
    subProjectName: string;
    tasks: number;
    sections: number;
    flexible: number;
    blocks: number;
    dependencies: number;
    total: number;
    warnings: string[];
  };
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const schema = z
  .object({
    siteId: z.string().trim().optional(),
    siteName: z.string().trim().optional(),
    siteAddress: z.string().trim().optional(),
    subProjectName: z.string().trim().min(2, "Укажите название состава работ"),
  })
  .refine((v) => v.siteId || (v.siteName && v.siteAddress), {
    message: "Выберите объект или укажите название и адрес нового",
  });

/**
 * Заводит объект по рабочей книге: дерево задач из листа «Задачи монтажа» и
 * граф очерёдности из «Зависимостей».
 */
export async function importKpWorkbookAction(
  _prevState: ImportState,
  formData: FormData
): Promise<ImportState> {
  await requireRole("ADMIN");

  const parsedForm = schema.safeParse({
    siteId: formData.get("siteId") || undefined,
    siteName: formData.get("siteName") || undefined,
    siteAddress: formData.get("siteAddress") || undefined,
    subProjectName: formData.get("subProjectName"),
  });
  if (!parsedForm.success) {
    return { error: parsedForm.error.issues[0]?.message ?? "Некорректные данные" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Выберите файл рабочей книги (.xlsx)" };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: `Файл больше ${MAX_FILE_SIZE / 1024 / 1024} МБ` };
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return { error: "Нужен файл .xlsx — книга Excel" };
  }

  let workbook;
  try {
    workbook = await parseKpWorkbook(await file.arrayBuffer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось прочитать книгу" };
  }

  const { siteId, siteName, siteAddress, subProjectName } = parsedForm.data;
  const target: PersistTarget = siteId
    ? { kind: "existing", siteId }
    : { kind: "new", name: siteName!, address: siteAddress! };

  let saved;
  try {
    saved = await persistWorkbook(workbook, target, subProjectName);
  } catch (e) {
    return {
      error: e instanceof Error ? `Не удалось сохранить: ${e.message}` : "Не удалось сохранить",
    };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/sites/${saved.siteId}`);

  return {
    result: {
      siteId: saved.siteId,
      siteName: saved.siteName,
      subProjectName,
      tasks: saved.tasks,
      sections: saved.sections,
      flexible: saved.flexible,
      blocks: saved.blocks,
      dependencies: saved.dependencies,
      total: workbook.total,
      warnings: workbook.warnings,
    },
  };
}
