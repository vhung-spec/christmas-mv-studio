import { NextResponse } from "next/server";
import { UserError } from "@/lib/errors";
import { errorResponse, readJsonBody } from "@/lib/http";
import { monitorStatus, setMonitorPassword, syncMonitor } from "@/lib/monitor";
import { zSettings } from "@/lib/schemas";
import { readSettings, writeSettings } from "@/lib/store";

/** Trang theo dõi cho máy khác: trạng thái (địa chỉ Tailscale, đang mở ở đâu) — không bao giờ trả mật khẩu. */
export async function GET() {
  try {
    return NextResponse.json(await monitorStatus());
  } catch (err) {
    return errorResponse(err);
  }
}

/** { action: "config", enabled?, port? } · { action: "password", password } (đặt / đổi) · { action: "password", password: null } (xoá). */
export async function POST(req: Request) {
  try {
    const body = await readJsonBody<{ action: string; enabled?: unknown; port?: unknown; password?: unknown }>(req);
    if (body.action === "config") {
      const s = await readSettings();
      const next = {
        ...s,
        ...(typeof body.enabled === "boolean" ? { monitorEnabled: body.enabled } : {}),
        ...(typeof body.port === "number" ? { monitorPort: body.port } : {}),
      };
      await writeSettings(zSettings.parse(next));
    } else if (body.action === "password") {
      if (body.password !== null && typeof body.password !== "string") throw new UserError("Mật khẩu không hợp lệ.");
      await setMonitorPassword(body.password).catch((err) => {
        throw new UserError((err as Error).message);
      });
    } else {
      throw new UserError("action không hợp lệ.");
    }
    await syncMonitor();
    return NextResponse.json(await monitorStatus());
  } catch (err) {
    return errorResponse(err);
  }
}
