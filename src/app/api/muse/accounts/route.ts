import { NextResponse } from "next/server";
import { UserError } from "@/lib/errors";
import { errorResponse, readJsonBody } from "@/lib/http";
import { deleteMuseAccount, museAccounts, renameMuseAccount, setMuseBackup, setMuseFailover, switchMuseAccount } from "@/lib/museEngine/accounts";
import { ensureMuseWatch } from "@/lib/museJobs";
import { readSettings } from "@/lib/store";

/** Tài khoản Muse (Muse trong app): tài khoản đang dùng, các tài khoản đã lưu, số cảnh đang làm. */
export async function GET() {
  try {
    if ((await readSettings()).museMode !== "gateway") throw new UserError("Chỉ dùng khi tạo clip bằng Muse trong app.");
    return NextResponse.json(await museAccounts());
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * { action: "switch", to, force? } · { action: "add", name, force? } (hồ sơ trống → mở cửa sổ đăng nhập) · { action: "rename", id, name }
 * · { action: "failover", enabled } (tự đổi khi tài khoản lỗi) · { action: "backup", id, on } (dùng làm dự phòng)
 * · { action: "delete", id } (bỏ tài khoản không dùng nữa; hồ sơ Chrome vào Thùng rác).
 * Có cảnh đang làm mà chưa force → { needsConfirm, inflight } để hỏi lại người dùng.
 */
export async function POST(req: Request) {
  try {
    if ((await readSettings()).museMode !== "gateway") throw new UserError("Chỉ dùng khi tạo clip bằng Muse trong app.");
    const body = await readJsonBody<{ action: string; to?: unknown; name?: unknown; id?: unknown; force?: unknown; enabled?: unknown; on?: unknown }>(req);
    const force = body.force === true;
    let result: Record<string, unknown> = {};
    if (body.action === "switch") {
      result = await switchMuseAccount({ to: String(body.to ?? "") }, force).catch((err) => {
        throw new UserError((err as Error).message);
      });
    } else if (body.action === "add") {
      result = await switchMuseAccount({ add: String(body.name ?? "") }, force).catch((err) => {
        throw new UserError((err as Error).message);
      });
    } else if (body.action === "rename") {
      await renameMuseAccount(String(body.id ?? ""), String(body.name ?? ""));
    } else if (body.action === "delete") {
      await deleteMuseAccount(String(body.id ?? "")).catch((err) => {
        throw new UserError((err as Error).message);
      });
    } else if (body.action === "failover") {
      await setMuseFailover(body.enabled === true);
    } else if (body.action === "backup") {
      await setMuseBackup(String(body.id ?? ""), body.on === true).catch((err) => {
        throw new UserError((err as Error).message);
      });
    } else {
      throw new UserError("action không hợp lệ.");
    }
    ensureMuseWatch();
    return NextResponse.json({ ...result, view: await museAccounts() });
  } catch (err) {
    return errorResponse(err);
  }
}
