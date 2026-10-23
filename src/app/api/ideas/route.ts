import { NextResponse } from "next/server";
import { UserError } from "@/lib/errors";
import { generationMode } from "@/lib/generate";
import { errorResponse, readJsonBody } from "@/lib/http";
import { addIdeas, bankView, setBankConfig, setIdeas, startSuggest } from "@/lib/ideaBank";
import { ensurePipelineWatch } from "@/lib/pipeline";
import { zIdea } from "@/lib/schemas";
import { readSettings } from "@/lib/store";

/** Kho ý tưởng của kênh `channel` (không ghi = kênh đầu tiên) + cách viết kịch bản hiện tại (claude / mock / manual). */
async function view(channel?: string) {
  return { ...(await bankView(channel)), mode: generationMode(await readSettings()) };
}

export async function GET(req: Request) {
  try {
    return NextResponse.json(await view(new URL(req.url).searchParams.get("channel") ?? undefined));
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * { action: "add", ideas, channel ("auto" = chia lần lượt các kênh) } · { action: "approve" | "reject", keys | all: true, channel }
 * · { action: "config", config } · { action: "suggest", channel } (nhờ Claude đề xuất ngay cho kênh, chạy nền — xem trạng thái ở GET).
 */
export async function POST(req: Request) {
  try {
    const body = await readJsonBody<{ action: string; ideas?: unknown; keys?: unknown; all?: unknown; config?: unknown; channel?: unknown }>(req);
    const channel = typeof body.channel === "string" && body.channel ? body.channel : undefined;
    let result: Record<string, unknown> = {};
    switch (body.action) {
      case "add": {
        const ideas = Array.isArray(body.ideas) ? body.ideas.map((x) => zIdea.parse(x)) : [];
        // Số ý tưởng trùng gửi về là "duplicates": "skipped" của kho (danh sách ý tưởng đã bỏ qua) sẽ đè lên nếu cùng tên.
        const { added, skipped } = await addIdeas(ideas, channel ?? "auto");
        result = { added, duplicates: skipped };
        break;
      }
      case "approve":
      case "reject": {
        const keys = body.all === true ? "proposed" : Array.isArray(body.keys) ? body.keys.filter((x): x is string => typeof x === "string") : [];
        result = { changed: await setIdeas(keys, body.action, channel) };
        break;
      }
      case "config":
        await setBankConfig(body.config && typeof body.config === "object" ? (body.config as Record<string, unknown>) : {});
        break;
      case "suggest":
        if (generationMode(await readSettings()) === "manual") {
          throw new UserError("Cần Claude API key để đề xuất ý tưởng: vào Cài đặt → “API key của Claude” (hoặc chọn chế độ Demo để thử).");
        }
        if (!startSuggest(() => ensurePipelineWatch(), true, channel)) throw new UserError("Claude đang nghĩ ý tưởng mới — chờ chút.");
        break;
      default:
        throw new UserError("action không hợp lệ.");
    }
    // Kho vừa đổi → đánh thức dây chuyền để lấy ý tưởng mới (nếu đang bật "Tự lấy ý tưởng").
    ensurePipelineWatch();
    return NextResponse.json({ ...result, ...(await view(channel === "auto" ? undefined : channel)) });
  } catch (err) {
    return errorResponse(err);
  }
}
