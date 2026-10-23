// KHUNG XEM CỬA SỔ MUSE — chụp các tab trong Chrome của Muse và chuyển thao tác bấm / gõ / cuộn vào đó (qua CDP, chung đường ống
// với Muse trong app). Để đăng nhập Muse (Meta / Instagram, mã 2 bước) ngay trên trang web của app — kể cả khi điều khiển từ xa bằng
// điện thoại, không cần ngồi trước máy chạy. Chữ gõ vào chỉ chuyển thẳng vào trang, không ghi lại ở đâu. Chỉ dùng phía server.

import type { Chrome } from "./chrome";

export interface ScreenTab {
  id: string;
  title: string;
  url: string;
  /** Tab Muse chính (app dùng tab này để gửi cảnh). */
  muse: boolean;
}

export interface ScreenShot {
  jpeg: Buffer;
  /** Kích thước khung trang (px CSS) — toạ độ bấm tính theo khung này. */
  width: number;
  height: number;
  url: string;
}

export const SCREEN_KEYS = {
  Enter: { code: "Enter", vk: 13, text: "\r" },
  Backspace: { code: "Backspace", vk: 8 },
  Tab: { code: "Tab", vk: 9 },
  Escape: { code: "Escape", vk: 27 },
  Delete: { code: "Delete", vk: 46 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  ArrowUp: { code: "ArrowUp", vk: 38 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
  ArrowDown: { code: "ArrowDown", vk: 40 },
} as const;
export type ScreenKey = keyof typeof SCREEN_KEYS;

export type ScreenAction =
  | { type: "click"; x: number; y: number }
  | { type: "wheel"; x: number; y: number; dy: number }
  | { type: "text"; text: string }
  | { type: "key"; key: ScreenKey }
  | { type: "back" }
  | { type: "reload" }
  | { type: "home" }
  /** Hiện trang kiểu điện thoại (khung hẹp) — chỉ khi đang đăng nhập, tự tắt khi xong. */
  | { type: "mobile"; on: boolean };

/**
 * Khung kiểu điện thoại: khổ hẹp 412 px (nét gấp đôi) để trang đăng nhập Meta / Instagram vừa màn hình điện thoại. Không bật chế độ
 * "mobile" của Chrome: trang thiếu thẻ viewport sẽ bị thu nhỏ (khổ 980 px) và toạ độ bấm lệch khỏi ảnh.
 */
const MOBILE = { width: 412, height: 860, deviceScaleFactor: 2, mobile: false };
/** Không ai xem khung chừng này → bỏ khung kiểu điện thoại (trả tab về như cũ cho Muse). */
const IDLE_MS = 10 * 60e3;

const g = globalThis as unknown as {
  __mvScreen?: { chrome: Chrome | null; sessions: Map<string, string>; mobile: Set<string>; idle: ReturnType<typeof setTimeout> | null };
};
const mem = (g.__mvScreen ??= { chrome: null, sessions: new Map(), mobile: new Set(), idle: null });

/** Chrome đổi (mở lại, đổi tài khoản) → phiên gắn tab cũ hết dùng được. */
function use(chrome: Chrome) {
  if (mem.chrome !== chrome) {
    mem.chrome = chrome;
    mem.sessions.clear();
    mem.mobile.clear();
  }
  if (mem.idle) clearTimeout(mem.idle);
  mem.idle = setTimeout(() => void resetMobile(chrome).catch(() => {}), IDLE_MS);
  mem.idle.unref?.();
}

/** Các tab đang mở trong Chrome của Muse (tab Muse trước). */
export async function screenTabs(chrome: Chrome): Promise<ScreenTab[]> {
  use(chrome);
  const { targetInfos } = (await chrome.cmd("Target.getTargets")) as { targetInfos: { targetId: string; type: string; title: string; url: string }[] };
  const tabs = targetInfos.filter((t) => t.type === "page").map((t) => ({ id: t.targetId, title: t.title, url: t.url, muse: t.targetId === chrome.targetId }));
  return tabs.sort((a, b) => Number(b.muse) - Number(a.muse));
}

/** Phiên CDP gắn vào tab (tab Muse dùng phiên sẵn có của app). */
async function attach(chrome: Chrome, tab: string): Promise<string> {
  if (tab === chrome.targetId && chrome.sessionId) return chrome.sessionId;
  const known = mem.sessions.get(tab);
  if (known) return known;
  const { sessionId } = (await chrome.cmd("Target.attachToTarget", { targetId: tab, flatten: true })) as { sessionId: string };
  await chrome.cmd("Page.enable", {}, sessionId).catch(() => {});
  mem.sessions.set(tab, sessionId);
  return sessionId;
}

/** Lệnh cho tab; tab đã đóng (phiên mất) → gắn lại một lần. */
async function onTab(chrome: Chrome, tab: string, fn: (sid: string) => Promise<unknown>): Promise<unknown> {
  try {
    return await fn(await attach(chrome, tab));
  } catch (e) {
    if (!mem.sessions.has(tab)) throw e;
    mem.sessions.delete(tab);
    return fn(await attach(chrome, tab));
  }
}

/** Chụp tab (JPEG) kèm kích thước khung trang để tính toạ độ bấm. */
export async function captureTab(chrome: Chrome, tab: string): Promise<ScreenShot> {
  use(chrome);
  return (await onTab(chrome, tab, async (sid) => {
    // Cửa sổ Chrome của Muse nằm ngoài màn hình: giả là đang được chọn để trang vẫn vẽ và nhận phím.
    await chrome.cmd("Emulation.setFocusEmulationEnabled", { enabled: true }, sid).catch(() => {});
    const shot = (await chrome.cmd("Page.captureScreenshot", { format: "jpeg", quality: 60 }, sid, 20e3)) as { data: string };
    // Ảnh gồm cả thanh cuộn → khổ trang tính bằng innerWidth / innerHeight (clientWidth thiếu phần thanh cuộn, bấm sẽ lệch).
    const info = (await chrome
      .cmd("Runtime.evaluate", { expression: "({ w: innerWidth, h: innerHeight, url: location.href })", returnByValue: true }, sid)
      .catch(() => null)) as { result?: { value?: { w: number; h: number; url: string } } } | null;
    let size = info?.result?.value;
    if (!size?.w) {
      const m = (await chrome.cmd("Page.getLayoutMetrics", {}, sid)) as { cssLayoutViewport: { clientWidth: number; clientHeight: number } };
      size = { w: m.cssLayoutViewport.clientWidth, h: m.cssLayoutViewport.clientHeight, url: "" };
    }
    return { jpeg: Buffer.from(shot.data, "base64"), width: size.w, height: size.h, url: size.url };
  })) as ScreenShot;
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(Number.isFinite(n) ? n : 0)));

/** Chuyển một thao tác vào tab. `allowMobile` = đang đăng nhập (khung kiểu điện thoại không làm lỗi việc gửi cảnh). */
export async function screenInput(chrome: Chrome, tab: string, action: ScreenAction, allowMobile: boolean): Promise<void> {
  use(chrome);
  await onTab(chrome, tab, async (sid) => {
    const mouse = (type: string, x: number, y: number, extra: Record<string, unknown> = {}) => chrome.cmd("Input.dispatchMouseEvent", { type, x, y, ...extra }, sid);
    switch (action.type) {
      case "click": {
        const x = clamp(action.x, 10000);
        const y = clamp(action.y, 10000);
        await mouse("mouseMoved", x, y);
        await mouse("mousePressed", x, y, { button: "left", buttons: 1, clickCount: 1 });
        await mouse("mouseReleased", x, y, { button: "left", buttons: 0, clickCount: 1 });
        break;
      }
      case "wheel":
        await mouse("mouseWheel", clamp(action.x, 10000), clamp(action.y, 10000), { deltaX: 0, deltaY: Math.max(-5000, Math.min(5000, Number(action.dy) || 0)) });
        break;
      case "text":
        await chrome.cmd("Input.insertText", { text: String(action.text).slice(0, 500) }, sid);
        break;
      case "key": {
        const k = SCREEN_KEYS[action.key];
        if (!k) throw new Error("Phím không hỗ trợ.");
        const base = { key: action.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
        await chrome.cmd("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...("text" in k ? { text: k.text, unmodifiedText: k.text } : {}) }, sid);
        await chrome.cmd("Input.dispatchKeyEvent", { type: "keyUp", ...base }, sid);
        break;
      }
      case "back": {
        const h = (await chrome.cmd("Page.getNavigationHistory", {}, sid)) as { currentIndex: number; entries: { id: number }[] };
        if (h.currentIndex > 0) await chrome.cmd("Page.navigateToHistoryEntry", { entryId: h.entries[h.currentIndex - 1].id }, sid);
        break;
      }
      case "reload":
        await chrome.cmd("Page.reload", {}, sid);
        break;
      case "home":
        await chrome.cmd("Page.navigate", { url: chrome.url }, sid);
        break;
      case "mobile":
        if (action.on && !allowMobile) throw new Error("Chỉ hiện kiểu điện thoại lúc đăng nhập Muse.");
        if (action.on) {
          await chrome.cmd("Emulation.setDeviceMetricsOverride", MOBILE, sid);
          mem.mobile.add(tab);
        } else {
          await chrome.cmd("Emulation.clearDeviceMetricsOverride", {}, sid);
          mem.mobile.delete(tab);
        }
        break;
      default:
        throw new Error("Thao tác không hợp lệ.");
    }
  });
}

/** Các tab đang hiện kiểu điện thoại. */
export const mobileTabs = () => [...mem.mobile];

/** Trả mọi tab về khung thường (đăng nhập xong / không ai xem nữa) — tab Muse phải đúng khung máy tính để gửi cảnh. */
export async function resetMobile(chrome: Chrome): Promise<void> {
  for (const tab of [...mem.mobile]) {
    mem.mobile.delete(tab);
    await onTab(chrome, tab, (sid) => chrome.cmd("Emulation.clearDeviceMetricsOverride", {}, sid)).catch(() => {});
  }
}
