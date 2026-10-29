import { NextResponse } from "next/server";
import { UserError } from "@/lib/errors";
import { generationMode } from "@/lib/generate";
import { errorResponse, readJsonBody } from "@/lib/http";
import { addToPipeline, clearFinishedPipeline, pipelineView, removeFromPipeline, retryPipeline } from "@/lib/pipeline";
import { zIdea } from "@/lib/schemas";
import { readSettings } from "@/lib/store";

/** Dây chuyền tự động + vài cài đặt liên quan (cách viết kịch bản, thư mục nhạc, cách gửi Muse). */
export async function GET() {
  try {
    const settings = await readSettings();
    return NextResponse.json({
      ...(await pipelineView()),
      settings: { mode: generationMode(settings), songDir: settings.songDir, museMode: settings.museMode, minShots: settings.minShots, maxShots: settings.maxShots, videoMinutes: settings.videoMinutes, mvPlays: settings.mvPlays },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * { action: "add", mvIds?, ideas?, channel? ("auto" / không ghi = phân luồng lần lượt các kênh) } · { action: "retry" | "remove", id }
 * · { action: "clear" } (bỏ các việc đã xong)
 */
export async function POST(req: Request) {
  try {
    const body = await readJsonBody<{ action: string; mvIds?: unknown; ideas?: unknown; id?: unknown; channel?: unknown }>(req);
    switch (body.action) {
      case "add": {
        const mvIds = Array.isArray(body.mvIds) ? body.mvIds.filter((x): x is string => typeof x === "string") : [];
        const ideas = Array.isArray(body.ideas) ? body.ideas.map((x) => zIdea.parse(x)) : [];
        const channel = typeof body.channel === "string" && body.channel ? body.channel : "auto";
        const { added, skipped } = await addToPipeline({ mvIds, ideas, channel });
        return NextResponse.json({ added, skipped, ...(await pipelineView()) });
      }
      case "retry":
        await retryPipeline(String(body.id ?? ""));
        break;
      case "remove":
        await removeFromPipeline(String(body.id ?? ""));
        break;
      case "clear":
        await clearFinishedPipeline();
        break;
      default:
        throw new UserError("action không hợp lệ.");
    }
    return NextResponse.json(await pipelineView());
  } catch (err) {
    return errorResponse(err);
  }
}
