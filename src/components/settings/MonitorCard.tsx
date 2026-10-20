"use client";

// Thẻ "Theo dõi từ máy khác" (trang Cài đặt): bật trang theo dõi chỉ-xem qua Tailscale, đặt mật khẩu, xem địa chỉ để mở trên máy chính.

import { useCallback, useEffect, useState } from "react";
import { Card, CopyButton, ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/client";

interface MonitorStatus {
  enabled: boolean;
  port: number;
  hasPassword: boolean;
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

  if (!st) {
    return (
      <Card title="Theo dõi từ máy khác (Tailscale)" className="lg:col-span-2">
        {error ? <ErrorBox error={error} /> : <Spinner />}
      </Card>
    );
  }
  const noTailscale = !st.addresses.length;
  return (
    <Card title="Theo dõi từ máy khác (Tailscale)" className="lg:col-span-2">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted">
          Mở một trang <b>chỉ xem</b> tiến độ (dây chuyền, Muse, MV đã xong, tải MP4) trên máy chính của bạn. Trang chỉ mở trên địa chỉ <b>Tailscale</b> của máy
          này — máy cùng wifi hay người ngoài không vào được — và cần mật khẩu. App chính vẫn chỉ mở trong máy này. Cài Tailscale (tailscale.com/download) trên
          cả hai máy và đăng nhập cùng một tài khoản.
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
            <b>Mật khẩu trang theo dõi:</b> {st.hasPassword ? <span className="text-mint-dark">đã đặt</span> : <span className="text-cherry-dark">chưa đặt</span>}
          </span>
          <input
            className="input w-52"
            type="password"
            autoComplete="new-password"
            placeholder={st.hasPassword ? "Mật khẩu mới (để đổi)" : "Ít nhất 6 ký tự"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button
            className="btn-ghost btn-sm"
            disabled={busy || pw.length < 6}
            onClick={() => void post({ action: "password", password: pw }, "Đã lưu mật khẩu (chỉ lưu bản mã hoá trên máy này).").then(() => setPw(""))}
          >
            Lưu mật khẩu
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={st.enabled} disabled={busy || (!st.enabled && !st.hasPassword)} onChange={(e) => void post({ action: "config", enabled: e.target.checked })} />
            Bật trang theo dõi
          </label>
          <label className="flex items-center gap-2 text-xs">
            Cổng
            <input className="input w-24 px-2 py-0.5" type="number" min={1024} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
            {Number(port) !== st.port && (
              <button className="btn-ghost btn-sm" disabled={busy} onClick={() => void post({ action: "config", port: Number(port) })}>
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
            <p className="font-semibold">Đang mở. Trên máy chính, mở trình duyệt và vào:</p>
            {st.urls.slice(0, 1).map((u) => (
              <p key={u} className="mt-1 flex flex-wrap items-center gap-2">
                <code className="text-base">{u}</code>
                <CopyButton text={u} label="Copy" />
              </p>
            ))}
            <p className="mt-1 text-xs text-muted">
              Hoặc <code>http://{st.machine}:{st.port}</code> (nếu Tailscale bật MagicDNS). Trình duyệt hỏi tên đăng nhập + mật khẩu: tên gõ gì cũng được, mật
              khẩu là mật khẩu ở trên. Lần đầu Windows có thể hỏi cho Node.js dùng mạng — chọn <b>Allow</b>.
            </p>
          </div>
        )}
        {st.enabled && !st.urls.length && !noTailscale && !st.error && <p className="text-xs text-muted">Đang mở trang theo dõi…</p>}
      </div>
    </Card>
  );
}
