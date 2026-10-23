"use client";

// Thẻ "Kho nhạc trên Google Drive" ở trang Tự động: link thư mục kho nhạc, đồng bộ ngay / tự đồng bộ, tiến độ và kết quả.
// Kho chung của mọi kênh: file nhạc + tệp Kho bài hát.xlsx (mức hay, mẫu Bokin). Bài nào kênh nào đã dùng: app tự nhớ (thẻ Kênh).

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/client";

interface DriveView {
  running: boolean;
  phase: string;
  error: string | null;
  last: { at: string; songs: number; audio: number; downloaded: number; bytes: number; renamed: number; failed: string[]; sheet?: string | null } | null;
  driveFolder: string;
  driveAutoSync: boolean;
  songDir: string;
}

const gb = (bytes: number) => (bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(2)} GB` : `${Math.round(bytes / 1048576)} MB`);

export function DriveSyncCard({ onSynced }: { onSynced?: () => void }) {
  const [view, setView] = useState<DriveView | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Giữ hàm báo "đồng bộ xong" mới nhất mà không làm tải lại thẻ mỗi lần trang cha vẽ lại.
  const synced = useRef(onSynced);
  useEffect(() => {
    synced.current = onSynced;
  }, [onSynced]);

  const load = useCallback(
    () =>
      api<DriveView>("/api/drive").then((v) => {
        setView((old) => {
          if (old?.running && !v.running) synced.current?.();
          return v;
        });
        return v;
      }),
    [],
  );
  useEffect(() => {
    void load().then((v) => setLink(v.driveFolder), (e) => setError((e as Error).message));
  }, [load]);
  useEffect(() => {
    if (!view?.running) return;
    const t = setInterval(() => void load().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [view?.running, load]);

  async function post(json: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      setView(await api<DriveView>("/api/drive", { method: "POST", json }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <Card title="Kho nhạc trên Google Drive">
        {error ? <ErrorBox error={error} /> : <Spinner />}
      </Card>
    );
  }
  const changed = link.trim() !== view.driveFolder;
  const last = view.last;
  return (
    <Card
      title="Kho nhạc trên Google Drive"
      actions={
        <button className="btn-primary btn-sm" disabled={busy || view.running || changed || !view.driveFolder} onClick={() => void post({ action: "sync" })}>
          {view.running && <Spinner />} ⟳ Đồng bộ ngay
        </button>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="text-xs text-muted">
          Dán link thư mục kho nhạc (chia sẻ “Bất kỳ ai có đường liên kết”): app tải tệp <b>Kho bài hát.xlsx</b> (mức hay, tên bài — cùng mẫu Bokin Playlist; Google
          Sheet tên “Kho bài hát” cũng được), đọc lời từ các thư mục bài đánh số và tải các file nhạc còn thiếu về Thư mục nhạc; file nào trên Drive đổi tên thì
          đổi tên bản ở máy cho khớp. Không xoá file nào. Không cần ghi “đã dùng” nữa: app tự nhớ kênh nào đã dùng bài nào.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input min-w-0 flex-1 text-xs"
            value={link}
            placeholder="https://drive.google.com/drive/folders/…"
            onChange={(e) => setLink(e.target.value)}
            data-testid="drive-link"
          />
          {changed && (
            <button className="btn-ghost btn-sm" disabled={busy} onClick={() => void post({ action: "config", driveFolder: link.trim() })}>
              Lưu link
            </button>
          )}
        </div>
        <p className="text-xs">
          Lưu nhạc vào: {view.songDir ? <code>{view.songDir}</code> : <span className="text-cherry-dark">chưa đặt</span>} (đổi ở{" "}
          <Link href="/settings" className="underline">
            Cài đặt → Thư mục nhạc
          </Link>
          )
        </p>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={view.driveAutoSync} disabled={busy} onChange={(e) => void post({ action: "config", driveAutoSync: e.target.checked })} />
          Tự đồng bộ mỗi 6 giờ (chỉ tải file mới; cả khi không mở trang này)
        </label>
        {view.running && (
          <p className="flex items-center gap-2 font-semibold text-sky-900">
            <Spinner /> {view.phase || "Đang đồng bộ…"}
          </p>
        )}
        <ErrorBox error={error ?? view.error} />
        {last && !view.running && (
          <p className="text-xs text-muted">
            Lần gần nhất ({new Date(last.at).toLocaleString("vi-VN")}): đọc lời {last.songs} bài · trên Drive {last.audio} file nhạc · tải mới <b>{last.downloaded}</b>
            {last.bytes ? ` (${gb(last.bytes)})` : ""}
            {last.renamed ? ` · đổi tên ${last.renamed}` : ""}
            {last.failed.length ? ` · lỗi ${last.failed.length}: ${last.failed.slice(0, 5).join(", ")}${last.failed.length > 5 ? "…" : ""}` : ""}.
            {last.sheet ? ` ${last.sheet}` : ""}
          </p>
        )}
      </div>
    </Card>
  );
}
