import { NextResponse } from "next/server";
import { UserError } from "@/lib/errors";
import { generationMode } from "@/lib/generate";
import { errorResponse, readJsonBody } from "@/lib/http";
import { addIdeas, bankView, setBankConfig, setIdeas, startSuggest } from "@/lib/ideaBank";
import { ensurePipelineWatch } from "@/lib/pipeline";
import { zIdea } from "@/lib/schemas";
import { readSettings } from "@/lib/store";

/** Kho ý tưởng + cách viết kịch bản hiện tại (claude / mock / manual). */
async function view() {
  return { ...(await bankView()), mode: generationMode(await readSettings()) };
}

export async function GET() {
  try {
    return NextResponse.json(await view());
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * { action: "add", ideas } · { action: "approve" | "reject", keys | all: true } · { action: "config", config }
 * · { action: "suggest" } (nhờ Claude đề xuất ngay, chạy nền — xem trạng thái ở GET).
 */
export async function POST(req: Request) {
  try {
    const body = await readJsonBody<{ action: string; ideas?: unknown; keys?: unknown; all?: unknown; config?: unknown }>(req);
    let result: Record<string, unknown> = {};
    switch (body.action) {
      case "add": {
        const ideas = Array.isArray(body.ideas) ? body.ideas.map((x) => zIdea.parse(x)) : [];
        result = await addIdeas(ideas);
        break;
      }
      case "approve":
      case "reject": {
        const keys = body.all === true ? "proposed" : Array.isArray(body.keys) ? body.keys.filter((x): x is string => typeof x === "string") : [];
        result = { changed: await setIdeas(keys, body.action) };
        break;
      }
      case "config":
        await setBankConfig(body.config && typeof body.config === "object" ? (body.config as Record<string, unknown>) : {});
        break;
      case "suggest":
        if (generationMode(await readSettings()) === "manual") {
          throw new UserError("Cần Claude API key để đề xuất ý tưởng: vào Cài đặt → “API key của Claude” (hoặc chọn chế độ Demo để thử).");
        }
        if (!startSuggest(() => ensurePipelineWatch(), true)) throw new UserError("Claude đang nghĩ ý tưởng mới — chờ chút.");
        break;
      default:
        throw new UserError("action không hợp lệ.");
    }
    // Kho vừa đổi → đánh thức dây chuyền để lấy ý tưởng mới (nếu đang bật "Tự lấy ý tưởng").
    ensurePipelineWatch();
    return NextResponse.json({ ...result, ...(await view()) });
  } catch (err) {
    return errorResponse(err);
  }
}
