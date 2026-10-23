import { NextResponse } from "next/server";
import { errorResponse, readJsonBody } from "@/lib/http";
import { zSettings } from "@/lib/schemas";
import { readSettings, writeSettings } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await readSettings());
}

/** Các mục do thẻ riêng quản lý (Kho nhạc trên Google Drive, Điều khiển từ xa, Cập nhật app): nút Lưu của trang Cài đặt không ghi đè. */
const OWN_CARDS = ["driveFolder", "driveAutoSync", "monitorEnabled", "monitorPort", "remoteControl", "updateRepo", "updateBranch", "autoUpdate"] as const;

export async function PUT(req: Request) {
  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const current = await readSettings();
    const settings = zSettings.parse({ ...body, ...Object.fromEntries(OWN_CARDS.map((k) => [k, current[k]])) });
    await writeSettings(settings);
    return NextResponse.json(await readSettings());
  } catch (err) {
    return errorResponse(err);
  }
}
