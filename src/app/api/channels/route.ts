import { NextResponse } from "next/server";
import { addChannel, setPosted, updateChannel } from "@/lib/channels";
import { channelsView, usedSongsView } from "@/lib/channelsView";
import { UserError } from "@/lib/errors";
import { errorResponse, readJsonBody } from "@/lib/http";
import { ensurePipelineWatch } from "@/lib/pipeline";

/**
 * Các kênh (cài đặt xếp bài, số video, bài mới còn lại) + tình trạng kho nhạc (Kho bài hát.xlsx, số bài theo mức, lỗi trong tệp).
 * ?used=<mã kênh>: nhạc đã dùng của kênh đó — từng video (bài theo thứ tự + giờ bắt đầu), từng bài, bài chưa dùng.
 */
export async function GET(req: Request) {
  try {
    const used = new URL(req.url).searchParams.get("used");
    if (used) return NextResponse.json(await usedSongsView(used));
    return NextResponse.json(await channelsView());
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * { action: "add", name } · { action: "update", id, name?, active?, oldPercent?, newOrder?, mvPerRound?, stock? }
 * · { action: "posted", id, video, posted } — đánh dấu video của kênh đã đăng lên YouTube (hoặc bỏ đánh dấu).
 */
export async function POST(req: Request) {
  try {
    const body = await readJsonBody<{
      action: string;
      id?: unknown;
      name?: unknown;
      active?: unknown;
      oldPercent?: unknown;
      newOrder?: unknown;
      mvPerRound?: unknown;
      stock?: unknown;
      video?: unknown;
      posted?: unknown;
    }>(req);
    if (body.action === "add") {
      await addChannel(typeof body.name === "string" ? body.name : "");
    } else if (body.action === "update") {
      await updateChannel(String(body.id ?? ""), {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(typeof body.active === "boolean" ? { active: body.active } : {}),
        ...(body.oldPercent !== undefined ? { oldPercent: Number(body.oldPercent) } : {}),
        ...(body.newOrder === "balanced" || body.newOrder === "best_first" ? { newOrder: body.newOrder } : {}),
        ...(body.mvPerRound !== undefined ? { mvPerRound: Number(body.mvPerRound) } : {}),
        ...(body.stock !== undefined ? { stock: Number(body.stock) } : {}),
      });
    } else if (body.action === "posted") {
      await setPosted(String(body.id ?? ""), String(body.video ?? ""), body.posted !== false);
    } else {
      throw new UserError("action không hợp lệ.");
    }
    // Bật lại một kênh / thêm kênh / tăng số làm sẵn / vừa đăng một video → dây chuyền có thể lấy thêm ý tưởng.
    ensurePipelineWatch();
    return NextResponse.json(await channelsView());
  } catch (err) {
    return errorResponse(err);
  }
}
