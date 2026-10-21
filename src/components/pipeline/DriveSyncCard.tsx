"use client";

// Thẻ "Kho nhạc trên Google Drive" ở trang Tự động: link thư mục kho nhạc, đồng bộ ngay / tự đồng bộ, tiến độ và kết quả.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CopyButton, ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import type { UsedSongRow } from "@/lib/songsUsed";

interface DriveView {
  running: boolean;
  phase: string;
  error: string | null;
  last: { at: string; songs: number; audio: number; unused: number; downloaded: number; bytes: number; renamed: number; failed: string[] } | null;
  driveFolder: string;
  driveAutoSync: boolean;
  songDir: string;
  /** Sổ bài đã dùng: bài app đã ghép vào MV, chưa ghi "đã dùng" trên Drive trước. */
  used: UsedSongRow[];
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
          Dán link thư mục kho nhạc (chia sẻ “Bất kỳ ai có đường liên kết”): app đọc lời từ các thư mục bài đánh số và tải các bản nhạc <b>chưa dùng</b> còn thiếu
          về Thư mục nhạc; bản nào trên Drive vừa ghi “đã dùng” thì đổi tên bản ở máy cho khớp. Không xoá file nào.
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
          Tự đồng bộ mỗi 6 giờ (chỉ tải bản nhạc mới; cả khi không mở trang này)
        </label>
        {view.running && (
          <p className="flex items-center gap-2 font-semibold text-sky-900">
            <Spinner /> {view.phase || "Đang đồng bộ…"}
          </p>
        )}
        <ErrorBox error={error ?? view.error} />
        {last && !view.running && (
          <p className="text-xs text-muted">
            Lần gần nhất ({new Date(last.at).toLocaleString("vi-VN")}): đọc lời {last.songs} bài · trên Drive {last.audio} file nhạc ({last.unused} chưa dùng) · tải
            mới <b>{last.downloaded}</b>
            {last.bytes ? ` (${gb(last.bytes)})` : ""}
            {last.renamed ? ` · đổi tên ${last.renamed}` : ""}
            {last.failed.length ? ` · lỗi ${last.failed.length}: ${last.failed.slice(0, 5).join(", ")}${last.failed.length > 5 ? "…" : ""}` : ""}.
          </p>
        )}
        <UsedSongs rows={view.used} />
      </div>
    </Card>
  );
}

/** Bài app đã ghép vào MV: chưa ghi "đã dùng" trên Drive thì nhắc ghi; đã ghi (tên file ở máy đã đổi theo Drive) thì gom lại. */
function UsedSongs({ rows }: { rows: UsedSongRow[] }) {
  const todo = rows.filter((r) => !r.marked);
  const done = rows.filter((r) => r.marked);
  const line = (r: UsedSongRow) => (
    <li key={`${r.key}#${r.mv_id}`}>
      <code>{r.file}</code> — {r.title} <span className="text-muted">({new Date(r.at).toLocaleDateString("vi-VN")})</span>
    </li>
  );
  if (!rows.length) return <p className="text-xs text-muted">Sổ bài đã dùng: chưa có bài nào được ghép vào MV.</p>;
  return (
    <div className="space-y-2" data-testid="used-songs">
      {todo.length > 0 && (
        <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <b className="flex-1">Bài app đã ghép vào MV — hãy ghi “đã dùng” trên Drive ({todo.length})</b>
            <CopyButton text={todo.map((r) => `${r.file}\t${r.title}`).join("\n")} label="📋 Copy danh sách" />
          </div>
          <p className="mt-1 text-xs text-muted">
            App đã tự tránh dùng lại các bài này (sổ bài đã dùng). Ghi “đã dùng” vào tên file trên Drive để bạn cũng biết khi dùng nhạc ở chỗ khác; lần
            đồng bộ sau bài chuyển xuống mục “đã ghi”.
          </p>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-xs">{todo.map(line)}</ul>
        </div>
      )}
      {done.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">Đã ghi “đã dùng” trên Drive ({done.length})</summary>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">{done.map(line)}</ul>
        </details>
      )}
    </div>
  );
}
