"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { saveAnimeImage, deleteAnimeImage } from "@/lib/uploads";

export type UploadState = { error?: string; success?: boolean };

export async function uploadHeroineAction(
  _prevState: UploadState,
  formData: FormData
): Promise<UploadState> {
  await requireRole("ADMIN");

  const file = formData.get("image");
  if (!file || !(file instanceof File)) {
    return { error: "Выберите файл" };
  }

  if (file.size === 0) {
    return { error: "Файл пуст" };
  }

  try {
    await saveAnimeImage(file, file.name);
    revalidatePath("/admin/appearance");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Ошибка при загрузке" };
  }
}

export async function deleteHeroineAction(fileName: string) {
  await requireRole("ADMIN");

  deleteAnimeImage(fileName);
  revalidatePath("/admin/appearance");
}
