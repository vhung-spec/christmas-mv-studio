import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { hasCredentials, testConnection } from "@/lib/llm";
import { readSettings } from "@/lib/store";

/** Kiểm tra API key + quyền dùng model đang chọn (không tốn token). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
  } catch (err) {
    return errorResponse(err);
  }
  if (!hasCredentials()) return NextResponse.json({ ok: false, error: "Chưa có API key." });
  const settings = await readSettings();
  return NextResponse.json(await testConnection(settings.model));
}
