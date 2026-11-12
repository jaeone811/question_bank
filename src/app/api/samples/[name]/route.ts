import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "@/lib/config";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = path.basename((await params).name);
  if (!/^[\w.-]+\.pdf$/.test(name)) return new NextResponse("not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(paths.samples(), name));
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
