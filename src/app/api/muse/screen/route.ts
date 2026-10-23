import { NextResponse } from "next/server";
import { UserError } from "@/lib/errors";
import { errorResponse, readJsonBody } from "@/lib/http";
import { museEngine } from "@/lib/museEngine";
import type { Chrome } from "@/lib/museEngine/chrome";
import { captureTab, mobileTabs, resetMobile, screenInput, screenTabs, type ScreenAction } from "@/lib/museEngine/screen";
import { readSettings } from "@/lib/store";

// Khung xem cửa sổ Chrome của Muse (đăng nhập Muse ngay trên trang, kể cả từ xa). Chữ gõ vào không được ghi lại ở đâu.

/** Chrome của Muse trong app, hoặc lý do không xem được. */
async function museChrome(): Promise<{ chrome: Chrome | null; reason: string }> {
  if ((await readSettings()).museMode !== "gateway") return { chrome: null, reason: "Đang dùng cách dán tay vào HaoHao — không có Chrome của Muse trong app." };
  const e = museEngine();
  if (e.fake) return { chrome: null, reason: "Muse giả (MUSE_FAKE): không có cửa sổ Chrome để xem." };
  const chrome = (e.page as { chrome?: Chrome }).chrome ?? null;
  if (!chrome?.running) return { chrome: null, reason: "Chrome của Muse chưa mở — bấm “Đăng nhập Muse” để mở." };
  return { chrome, reason: "" };
}

/** Đang đăng nhập / chưa đăng nhập → cho hiện kiểu điện thoại. Đã đăng nhập xong → tab phải về khung máy tính để gửi cảnh. */
const loginPhase = () => {
  const st = museEngine().worker.state;
  return st.loggingIn || st.loggedIn === false;
};

/** Không có ?tab → danh sách tab + tình trạng đăng nhập. ?tab=<id> → ảnh JPEG của tab (X-Screen-Width / -Height / -Url). */
export async function GET(req: Request) {
  try {
    const tab = new URL(req.url).searchParams.get("tab");
    const { chrome, reason } = await museChrome();
    if (!tab) {
      const st = chrome ? museEngine().worker.state : null;
      return NextResponse.json({
        ready: Boolean(chrome),
        reason,
        tabs: chrome ? await screenTabs(chrome) : [],
        mobile: mobileTabs(),
        canMobile: Boolean(chrome) && loginPhase(),
        loggedIn: st?.loggedIn ?? null,
        loggingIn: st?.loggingIn ?? false,
        busy: Boolean(st?.current),
      });
    }
    if (!chrome) throw new UserError(reason, 409);
    if (!loginPhase() && mobileTabs().length) await resetMobile(chrome);
    const shot = await captureTab(chrome, tab);
    return new NextResponse(new Uint8Array(shot.jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
        "X-Screen-Width": String(shot.width),
        "X-Screen-Height": String(shot.height),
        "X-Screen-Url": encodeURI(shot.url),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** { tab, action: { type: "click", x, y } | { type: "text", text } | { type: "key", key } | … } (xem ScreenAction). */
export async function POST(req: Request) {
  try {
    const body = await readJsonBody<{ tab?: unknown; action?: ScreenAction }>(req);
    const { chrome, reason } = await museChrome();
    if (!chrome) throw new UserError(reason, 409);
    if (typeof body.tab !== "string" || !/^[A-F0-9]{8,64}$/i.test(body.tab) || !body.action || typeof body.action !== "object") throw new UserError("Thiếu tab / thao tác.");
    await screenInput(chrome, body.tab, body.action, loginPhase()).catch((e) => {
      throw new UserError((e as Error).message, 409);
    });
    return NextResponse.json({ ok: true, mobile: mobileTabs() });
  } catch (err) {
    return errorResponse(err);
  }
}
