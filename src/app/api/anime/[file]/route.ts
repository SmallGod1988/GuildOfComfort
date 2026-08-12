import { readFileSync } from "fs";
import { join } from "path";
import { isSafeFileName, getContentType } from "@/lib/uploads";

export const dynamic = "force-static";
export const revalidate = 86400; // 1 day

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;

  if (!isSafeFileName(file)) {
    return new Response("Bad request", { status: 400 });
  }

  try {
    const filePath = join(process.cwd(), "uploads", "anime", file);
    const normalizedPath = join(process.cwd(), "uploads", "anime");

    if (!filePath.startsWith(normalizedPath)) {
      return new Response("Not found", { status: 404 });
    }

    const buffer = readFileSync(filePath);
    const ext = file.split(".").pop() || "";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": getContentType(ext),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
