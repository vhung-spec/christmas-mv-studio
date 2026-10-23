import { NextResponse } from "next/server";
import { UserError } from "@/lib/errors";
import { assertSameOrigin, errorResponse, readJsonBody } from "@/lib/http";
import { zSettings } from "@/lib/schemas";
import { readSettings, writeSettings } from "@/lib/store";
import { checkUpdate, setUpdateToken, stageUpload, updateStatus, wantInstall } from "@/lib/updater";

/** Tình trạng tự cập nhật: bản đang chạy, bản mới trên GitHub, bản đã tải chờ cài, kết quả lần cài gần nhất (không có token). */
export async function GET() {
  try {
    return NextResponse.json(await updateStatus());
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * JSON: { action: "check" } (kiểm tra ngay) · { action: "install" } (cài khi app rảnh) · { action: "config", repo?, branch?, auto? }
 * · { action: "token", token } (null = xoá). Thân là file .zip (Content-Type: application/zip, X-File-Name) = gói tải lên để cài.
 */
export async function POST(req: Request) {
  try {
    const type = req.headers.get("content-type") ?? "";
    if (/application\/(zip|x-zip-compressed|octet-stream)/.test(type)) {
      assertSameOrigin(req);
      await stageUpload(Buffer.from(await req.arrayBuffer()), decodeURIComponent(req.headers.get("x-file-name") ?? "goi.zip"));
      return NextResponse.json({ ...(await updateStatus()), install: await wantInstall() });
    }
    const body = await readJsonBody<{ action: string; repo?: unknown; branch?: unknown; auto?: unknown; token?: unknown }>(req);
    let install: { started: boolean; reason?: string } | undefined;
    switch (body.action) {
      case "check":
        await checkUpdate(true);
        break;
      case "install":
        install = await wantInstall();
        break;
      case "config": {
        const s = await readSettings();
        await writeSettings(
          zSettings.parse({
            ...s,
            ...(typeof body.repo === "string" ? { updateRepo: body.repo.trim() } : {}),
            ...(typeof body.branch === "string" ? { updateBranch: body.branch.trim() } : {}),
            ...(typeof body.auto === "boolean" ? { autoUpdate: body.auto } : {}),
          }),
        );
        break;
      }
      case "token":
        if (body.token !== null && typeof body.token !== "string") throw new UserError("Token không hợp lệ.");
        await setUpdateToken(body.token).catch((e) => {
          throw new UserError((e as Error).message);
        });
        break;
      default:
        throw new UserError("action không hợp lệ.");
    }
    return NextResponse.json({ ...(await updateStatus()), ...(install ? { install } : {}) });
  } catch (err) {
    return errorResponse(err);
  }
}
