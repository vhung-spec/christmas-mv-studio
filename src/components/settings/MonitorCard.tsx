"use client";

// Thẻ "Điều khiển từ xa" (trang Cài đặt): mở cổng từ xa qua Tailscale (chỉ xem tiến độ, hoặc điều khiển cả app), đặt mật khẩu,
// xem địa chỉ để mở trên điện thoại / máy khác, đăng xuất mọi thiết bị.

import { useCallback, useEffect, useState } from "react";
import { Card, CopyButton, ErrorBox, Spinner } from "@/components/ui";
import { api, isRemote } from "@/lib/client";

interface MonitorStatus {
  enabled: boolean;
  port: number;
  control: boolean;
  hasPassword: boolean;
  sessions: number;
  addresses: string[];
  machine: string;
  listening: string[];
  urls: string[];
  error: string | null;
}

export default function MonitorCard() {
  const [st, setSt] = useState<MonitorStatus | null>(null);
  const [pw, setPw] = useState("");
  const [port, setPort] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Đang mở app qua cổng từ xa: tắt cổng / tắt điều khiển / đổi mật khẩu sẽ cắt luôn chính phiên này.
  const remote = isRemote();

  const load = useCallback(() => api<MonitorStatus>("/api/monitor").then((s) => (setSt(s), setPort(String(s.port))), (e) => setError((e as Error).message)), []);
  useEffect(() => {
    void load();
    // Tailscale có thể vừa bật / vừa đăng nhập: dò lại cho thẻ cập nhật.
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  async function post(json: Record<string, unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setSt(await api<MonitorStatus>("/api/monitor", { method: "POST", json }));
      if (done) setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = "Điều khiển từ xa (Tailscale)";
  if (!st) {
    return (
      <Card title={title} className="lg:col-span-2">
        {error ? <ErrorBox error={error} /> : <Spinner />}
      </Card>
    );
  }
  const noTailscale = !st.addresses.length;
  const cut = (what: string) => !remote || confirm(`${what}\n\nBạn đang mở app từ xa: làm vậy sẽ cắt luôn kết nối này, muốn bật lại phải làm ở máy chạy. Tiếp tục?`);
  return (
    <Card title={title} className="lg:col-span-2">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted">
          Mở app trên <b>điện thoại hoặc máy khác của bạn</b>, ở đâu cũng được (4G, wifi khác): xem tiến độ, tải MP4, và — khi tick “Cho phép điều khiển” —
          dùng mọi chức năng như ngồi tại máy, kể cả <b>đăng nhập Muse</b> (cửa sổ Chrome của Muse hiện ngay trong trang). Cổng chỉ mở trên địa chỉ{" "}
          <b>Tailscale</b> của máy này — máy cùng wifi hay người ngoài không vào được — và phải đăng nhập bằng mật khẩu. App chính vẫn chỉ mở trong máy này.
          Cài Tailscale (tailscale.com/download, có cho điện thoại) trên máy này và thiết bị của bạn, đăng nhập cùng một tài khoản.
        </p>
        <p>
          <b>Tailscale trên máy này:</b>{" "}
          {noTailscale ? (
            <span className="text-amber-800">chưa thấy — cài và đăng nhập Tailscale, thẻ này tự cập nhật.</span>
          ) : (
            <span className="text-mint-dark">✓ {st.addresses.join(", ")}</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span>
            <b>Mật khẩu:</b> {st.hasPassword ? <span className="text-mint-dark">đã đặt</span> : <span className="text-cherry-dark">chưa đặt</span>}
          </span>
          <input
            className="input w-full max-w-52"
            type="password"
            autoComplete="new-password"
            placeholder={st.hasPassword ? "Mật khẩu mới (để đổi)" : "Ít nhất 6 ký tự"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button
            className="btn-ghost btn-sm"
            disabled={busy || pw.length < 6}
            onClick={() =>
              (!st.hasPassword || cut("Đổi mật khẩu sẽ đăng xuất mọi thiết bị đang mở cổng từ xa.")) &&
              void post({ action: "password", password: pw }, "Đã lưu mật khẩu (chỉ lưu bản mã hoá trên máy này). Các thiết bị phải đăng nhập lại.").then(() => setPw(""))
            }
          >
            Lưu mật khẩu
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={st.enabled}
              disabled={busy || (!st.enabled && !st.hasPassword)}
              onChange={(e) => (e.target.checked || cut("Tắt cổng từ xa.")) && void post({ action: "config", enabled: e.target.checked })}
            />
            Bật cổng từ xa
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={st.control}
              disabled={busy}
              onChange={(e) => (e.target.checked || cut("Tắt điều khiển: cổng chỉ còn trang xem tiến độ.")) && void post({ action: "config", control: e.target.checked })}
            />
            Cho phép điều khiển app (không chỉ xem)
          </label>
          <label className="flex items-center gap-2 text-xs">
            Cổng
            <input className="input w-24 px-2 py-0.5" type="number" min={1024} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
            {Number(port) !== st.port && (
              <button className="btn-ghost btn-sm" disabled={busy} onClick={() => cut("Đổi cổng.") && void post({ action: "config", port: Number(port) })}>
                Đổi cổng
              </button>
            )}
          </label>
        </div>
        {!st.hasPassword && <p className="text-xs text-muted">Đặt mật khẩu trước rồi mới bật được.</p>}
        {notice && <p className="text-xs font-semibold text-mint-dark">{notice}</p>}
        <ErrorBox error={error ?? st.error} />
        {st.enabled && st.urls.length > 0 && (
          <div className="rounded-lg border-2 border-mint-dark/60 bg-mint/20 p-3">
            <p className="font-semibold">Đang mở. Trên điện thoại / máy khác (đã bật Tailscale), mở trình duyệt và vào:</p>
            {st.urls.slice(0, 1).map((u) => (
              <p key={u} className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all text-base">{u}</code>
                <CopyButton text={u} label="Copy" />
              </p>
            ))}
            <p className="mt-1 text-xs text-muted">
              Hoặc <code>http://{st.machine}:{st.port}</code> (nếu Tailscale bật MagicDNS). Gõ mật khẩu ở trên để đăng nhập; thiết bị nhớ đăng nhập 30 ngày. Trên
              điện thoại: menu trình duyệt → “Thêm vào màn hình chính” để mở nhanh như một app. Lần đầu Windows có thể hỏi cho Node.js dùng mạng — chọn{" "}
              <b>Allow</b>.
            </p>
            <p className="mt-1 text-xs">
              {st.control ? "Điều khiển: bật — mở được mọi trang của app." : "Điều khiển: tắt — chỉ xem tiến độ và tải kết quả."} · Đang đăng nhập: {st.sessions} thiết bị{" "}
              {st.sessions > 0 && (
                <button className="btn-ghost btn-sm ml-1" disabled={busy} onClick={() => cut("Đăng xuất mọi thiết bị.") && void post({ action: "logout-all" }, "Đã đăng xuất mọi thiết bị.")}>
                  Đăng xuất mọi thiết bị
                </button>
              )}
            </p>
          </div>
        )}
        {st.enabled && !st.urls.length && !noTailscale && !st.error && <p className="text-xs text-muted">Đang mở cổng từ xa…</p>}
      </div>
    </Card>
  );
}
