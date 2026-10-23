import { NextResponse } from "next/server";
import { addChannel, updateChannel } from "@/lib/channels";
import { channelsView } from "@/lib/channelsView";
import { UserError } from "@/lib/errors";
import { errorResponse, readJsonBody } from "@/lib/http";
import { ensurePipelineWatch } from "@/lib/pipeline";

/** Các kênh (cài đặt xếp bài, số video, bài mới còn lại) + tình trạng kho nhạc (Kho bài hát.xlsx, số bài theo mức, lỗi trong tệp). */
export async function GET() {
  try {
    return NextResponse.json(await channelsView());
  } catch (err) {
    return errorResponse(err);
  }
}

/** { action: "add", name } · { action: "update", id, name?, active?, oldPercent?, newOrder? } */
export async function POST(req: Request) {
  try {
    const body = await readJsonBody<{ action: string; id?: unknown; name?: unknown; active?: unknown; oldPercent?: unknown; newOrder?: unknown }>(req);
    if (body.action === "add") {
      await addChannel(typeof body.name === "string" ? body.name : "");
    } else if (body.action === "update") {
      await updateChannel(String(body.id ?? ""), {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(typeof body.active === "boolean" ? { active: body.active } : {}),
        ...(body.oldPercent !== undefined ? { oldPercent: Number(body.oldPercent) } : {}),
        ...(body.newOrder === "balanced" || body.newOrder === "best_first" ? { newOrder: body.newOrder } : {}),
      });
    } else {
      throw new UserError("action không hợp lệ.");
    }
    // Bật lại một kênh / thêm kênh → dây chuyền có thể lấy thêm ý tưởng.
    ensurePipelineWatch();
    return NextResponse.json(await channelsView());
  } catch (err) {
    return errorResponse(err);
  }
}
