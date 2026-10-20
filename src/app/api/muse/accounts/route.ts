import { NextResponse } from "next/server";
import { UserError } from "@/lib/errors";
import { errorResponse, readJsonBody } from "@/lib/http";
import { museAccounts, renameMuseAccount, switchMuseAccount } from "@/lib/museEngine/accounts";
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
 * { action: "switch", to, force? } · { action: "add", name, force? } (hồ sơ trống → mở cửa sổ đăng nhập) · { action: "rename", id, name }.
 * Có cảnh đang làm mà chưa force → { needsConfirm, inflight } để hỏi lại người dùng.
 */
export async function POST(req: Request) {
  try {
    if ((await readSettings()).museMode !== "gateway") throw new UserError("Chỉ dùng khi tạo clip bằng Muse trong app.");
    const body = await readJsonBody<{ action: string; to?: unknown; name?: unknown; id?: unknown; force?: unknown }>(req);
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
    } else {
      throw new UserError("action không hợp lệ.");
    }
    ensureMuseWatch();
    return NextResponse.json({ ...result, view: await museAccounts() });
  } catch (err) {
    return errorResponse(err);
  }
}
