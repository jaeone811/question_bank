import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isAdmin } from "@/lib/auth";
import { paths } from "@/lib/config";

export const dynamic = "force-dynamic";

// 에이전트 브라우저 화면 캡처 (관리자만)
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await isAdmin())) return new NextResponse("unauthorized", { status: 401 });
  const name = path.basename((await params).name);
  if (!/^[\w.-]+\.(png|jpg)$/.test(name)) return new NextResponse("not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(paths.screenshots(), name));
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": name.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
