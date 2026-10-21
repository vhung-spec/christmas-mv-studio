import { NextResponse } from "next/server";
import { driveSyncStatus, startDriveSync } from "@/lib/driveSync";
import { UserError } from "@/lib/errors";
import { errorResponse, readJsonBody } from "@/lib/http";
import { ensurePipelineWatch } from "@/lib/pipeline";
import { zSettings } from "@/lib/schemas";
import { usedSongRows } from "@/lib/songsUsed";
import { readSettings, writeSettings } from "@/lib/store";

/**
 * Đồng bộ kho nhạc từ Google Drive: trạng thái + các cài đặt liên quan (link Drive, tự đồng bộ, Thư mục nhạc) + sổ bài đã dùng
 * (bài app đã ghép vào MV, để bạn ghi "đã dùng" trên Drive).
 */
async function view() {
  const s = await readSettings();
  return { ...(await driveSyncStatus()), driveFolder: s.driveFolder, driveAutoSync: s.driveAutoSync, songDir: s.songDir, used: await usedSongRows(s.songDir) };
}

export async function GET() {
  try {
    return NextResponse.json(await view());
  } catch (err) {
    return errorResponse(err);
  }
}

/** { action: "config", driveFolder?, driveAutoSync?, songDir? } · { action: "sync" } (chạy nền — xem tiến độ ở GET). */
export async function POST(req: Request) {
  try {
    const body = await readJsonBody<{ action: string; driveFolder?: unknown; driveAutoSync?: unknown; songDir?: unknown }>(req);
    if (body.action === "config") {
      const s = await readSettings();
      const next = {
        ...s,
        ...(typeof body.driveFolder === "string" ? { driveFolder: body.driveFolder } : {}),
        ...(typeof body.driveAutoSync === "boolean" ? { driveAutoSync: body.driveAutoSync } : {}),
        ...(typeof body.songDir === "string" ? { songDir: body.songDir } : {}),
      };
      await writeSettings(zSettings.parse(next));
    } else if (body.action === "sync") {
      if (!startDriveSync(() => ensurePipelineWatch())) throw new UserError("Đang đồng bộ — chờ lần này xong.");
    } else {
      throw new UserError("action không hợp lệ.");
    }
    return NextResponse.json(await view());
  } catch (err) {
    return errorResponse(err);
  }
}
