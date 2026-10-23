"use client";

// Khung xem cửa sổ Chrome của Muse: ảnh chụp tab tự làm mới; bấm vào ảnh = bấm vào trang; ô gõ chữ (email, mật khẩu, mã 2 bước —
// che được chữ); phím Enter / Xoá / Tab; cuộn; quay lại / tải lại; kiểu điện thoại cho trang đăng nhập. Để đăng nhập Muse ngay trên
// trang — kể cả từ điện thoại qua cổng điều khiển từ xa. Chữ gõ chỉ chuyển thẳng vào trang Muse, không lưu ở đâu.

import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/client";

interface ScreenTab {
  id: string;
  title: string;
  url: string;
  muse: boolean;
}

interface ScreenView {
  ready: boolean;
  reason: string;
  tabs: ScreenTab[];
  mobile: string[];
  canMobile: boolean;
  loggedIn: boolean | null;
  loggingIn: boolean;
  busy: boolean;
}

type Action =
  | { type: "click"; x: number; y: number }
  | { type: "wheel"; x: number; y: number; dy: number }
  | { type: "text"; text: string }
  | { type: "key"; key: string }
  | { type: "back" | "reload" | "home" }
  | { type: "mobile"; on: boolean };

const KEYS = new Set(["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export default function MuseScreen({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<ScreenView | null>(null);
  const [tab, setTab] = useState("");
  const [shot, setShot] = useState<{ src: string; w: number; h: number; url: string } | null>(null);
  const [text, setText] = useState("");
  const [hide, setHide] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const seq = useRef(0);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const loadTabs = useCallback(async () => {
    try {
      const v = await api<ScreenView>("/api/muse/screen");
      setView(v);
      // Giữ tab đang xem; chưa chọn thì tab đăng nhập mới mở (nếu có), không thì tab Muse.
      setTab((cur) => (v.tabs.some((t) => t.id === cur) ? cur : (v.tabs.find((t) => !t.muse && !t.url.startsWith("about:")) ?? v.tabs[0])?.id ?? ""));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadShot = useCallback(async () => {
    const id = tabRef.current;
    if (!id || document.hidden) return;
    const n = ++seq.current;
    const res = await fetch(`/api/muse/screen?tab=${id}&t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? `Lỗi ${res.status}`);
    }
    const blob = await res.blob();
    if (n !== seq.current) return; // đã có ảnh mới hơn
    const src = URL.createObjectURL(blob);
    setShot((old) => {
      if (old) URL.revokeObjectURL(old.src);
      return { src, w: Number(res.headers.get("x-screen-width")) || 1, h: Number(res.headers.get("x-screen-height")) || 1, url: decodeURI(res.headers.get("x-screen-url") ?? "") };
    });
    setError(null);
  }, []);

  // Danh sách tab mỗi 3 giây (tab đăng nhập vừa mở, đã đăng nhập xong…); ảnh khoảng 1 giây một lần khi trang đang hiện.
  useEffect(() => {
    void loadTabs();
    const t = setInterval(() => void loadTabs(), 3000);
    return () => clearInterval(t);
  }, [loadTabs]);
  useEffect(() => {
    let stop = false;
    void (async () => {
      while (!stop) {
        await loadShot().catch((e) => setError((e as Error).message));
        await sleep(900);
      }
    })();
    return () => {
      stop = true;
    };
  }, [loadShot]);

  const act = useCallback(
    async (action: Action) => {
      if (!tabRef.current) return;
      setSending(true);
      try {
        const r = await api<{ ok: boolean; mobile: string[] }>("/api/muse/screen", { method: "POST", json: { tab: tabRef.current, action } });
        setView((v) => (v ? { ...v, mobile: r.mobile } : v));
        await sleep(250);
        await loadShot().catch(() => {});
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSending(false);
      }
    },
    [loadShot],
  );

  // Cuộn chuột trên ảnh = cuộn trang Muse (không cuộn trang app).
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (!shot) return;
      void act({ type: "wheel", x: ((e.clientX - r.left) / r.width) * shot.w, y: ((e.clientY - r.top) / r.height) * shot.h, dy: e.deltaY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [act, shot]);

  function clickAt(e: React.MouseEvent<HTMLImageElement>) {
    const el = imgRef.current;
    if (!el || !shot) return;
    const r = el.getBoundingClientRect();
    void act({ type: "click", x: ((e.clientX - r.left) / r.width) * shot.w, y: ((e.clientY - r.top) / r.height) * shot.h });
    el.focus();
  }

  // Máy tính: bấm vào ảnh rồi gõ phím thẳng (từng ký tự).
  function keyDown(e: React.KeyboardEvent<HTMLImageElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1) void act({ type: "text", text: e.key });
    else if (KEYS.has(e.key)) void act({ type: "key", key: e.key });
    else return;
    e.preventDefault();
  }

  async function sendText(enter: boolean) {
    if (!text) return;
    const t = text;
    setText("");
    await act({ type: "text", text: t });
    if (enter) await act({ type: "key", key: "Enter" });
  }

  async function close() {
    // Trả tab về khung máy tính trước khi đóng.
    if (tab && view?.mobile.includes(tab)) await act({ type: "mobile", on: false });
    onClose();
  }

  const current = view?.tabs.find((t) => t.id === tab);
  const mobile = Boolean(tab && view?.mobile.includes(tab));
  const scroll = (dy: number) => shot && void act({ type: "wheel", x: shot.w / 2, y: shot.h / 2, dy });
  return (
    <div className="mt-2 min-w-0 space-y-2 rounded-xl border-2 border-sky-400 bg-sky-50 p-2 text-sm text-ink sm:p-3" data-testid="muse-screen">
      <div className="flex flex-wrap items-center gap-2">
        <b>🖥 Cửa sổ Chrome của Muse</b>
        {view?.loggedIn ? (
          <span className="badge border-mint-dark/50 bg-mint/30">✓ Đã đăng nhập Muse</span>
        ) : view?.loggingIn ? (
          <span className="badge border-sky-400 bg-sky-100">Đang chờ bạn đăng nhập…</span>
        ) : null}
        {sending && <Spinner />}
        <button className="btn-ghost btn-sm ml-auto" onClick={() => void close()}>
          ✕ Đóng khung
        </button>
      </div>
      {view && !view.ready ? (
        <p className="text-amber-800">{view.reason}</p>
      ) : (
        <>
          {view && view.tabs.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {view.tabs.map((t) => (
                <button key={t.id} className={`btn-sm ${t.id === tab ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(t.id)} title={t.url}>
                  {t.muse ? "Muse" : host(t.url) || "Tab mới"}
                </button>
              ))}
            </div>
          )}
          {view?.busy && <p className="text-xs font-semibold text-amber-800">Muse đang gửi cảnh: bấm / gõ trong khung lúc này có thể làm lỗi lần gửi đó.</p>}
          <p className="truncate text-xs text-muted" title={shot?.url}>
            {shot?.url || current?.url || "…"}
          </p>
          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={shot.src}
              alt="Cửa sổ Chrome của Muse — bấm vào để bấm vào trang"
              className={`block w-full cursor-pointer select-none rounded border border-ink/20 bg-white outline-none focus:ring-2 focus:ring-sky-400 ${mobile ? "max-w-[430px]" : "max-w-[1000px]"}`}
              style={{ touchAction: "manipulation" }}
              tabIndex={0}
              draggable={false}
              onClick={clickAt}
              onKeyDown={keyDown}
            />
          ) : (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input min-w-0 flex-1 basis-48"
              type={hide ? "password" : "text"}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Bấm vào ô trên trang rồi gõ ở đây (email, mật khẩu, mã)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void sendText(false);
                }
              }}
            />
            <button className="btn-ghost btn-sm" type="button" onClick={() => setHide(!hide)} title={hide ? "Hiện chữ đang gõ" : "Che chữ đang gõ"}>
              {hide ? "👁 Hiện" : "🙈 Che"}
            </button>
            <button className="btn-primary btn-sm" disabled={!text || sending} onClick={() => void sendText(false)}>
              Gõ vào trang
            </button>
            <button className="btn-ghost btn-sm" disabled={!text || sending} onClick={() => void sendText(true)}>
              Gõ + Enter
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            <button className="btn-ghost btn-sm" onClick={() => void act({ type: "key", key: "Enter" })}>
              ⏎ Enter
            </button>
            <button className="btn-ghost btn-sm" onClick={() => void act({ type: "key", key: "Backspace" })}>
              ⌫ Xoá
            </button>
            <button className="btn-ghost btn-sm" onClick={() => void act({ type: "key", key: "Tab" })}>
              ⇥ Tab
            </button>
            <button className="btn-ghost btn-sm" onClick={() => scroll(-500)}>
              ▲ Cuộn lên
            </button>
            <button className="btn-ghost btn-sm" onClick={() => scroll(500)}>
              ▼ Cuộn xuống
            </button>
            <button className="btn-ghost btn-sm" onClick={() => void act({ type: "back" })}>
              ← Quay lại
            </button>
            <button className="btn-ghost btn-sm" onClick={() => void act({ type: "reload" })}>
              ⟳ Tải lại
            </button>
            <button className="btn-ghost btn-sm" onClick={() => void act({ type: "home" })} title="Về trang muse.ai">
              🏠 Muse
            </button>
          </div>
          {view?.canMobile && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={mobile} disabled={sending} onChange={(e) => void act({ type: "mobile", on: e.target.checked })} />
              Hiện trang kiểu điện thoại (vừa màn hình nhỏ; tự tắt khi đăng nhập xong)
            </label>
          )}
          <p className="text-xs text-muted">
            Bấm vào ảnh để bấm vào trang. Muốn gõ: bấm vào ô trên trang trước, rồi gõ vào ô bên dưới ảnh và bấm “Gõ vào trang” (trên máy tính có thể bấm vào ảnh rồi
            gõ phím thẳng). Chữ gõ chỉ chuyển vào trang Muse, app không lưu.
          </p>
        </>
      )}
      <ErrorBox error={error} />
    </div>
  );
}
