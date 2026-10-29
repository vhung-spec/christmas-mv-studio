"use client";

// Danh sách bài của một video theo thứ tự, kèm giờ bắt đầu từng bài (như "Tracklist" trong mô tả YouTube — YouTube tự tạo chương) và
// nút chép các dòng "0:00 Tên bài" để dán vào mô tả. Dùng ở trang Kênh (Nhạc đã dùng), trang Dây chuyền và trang Ghép video.

import { useEffect, useState } from "react";
import { CopyButton, Spinner } from "@/components/ui";
import { chapterTime, tracklistLines } from "@/lib/chapters";
import { api } from "@/lib/client";
import type { VideoProject } from "@/lib/types";

export interface TrackRow {
  title: string;
  /** Giây bắt đầu trong video; null = không còn biết. */
  start: number | null;
  duration?: number | null;
  file?: string;
  level?: number | null;
  /** MV một bài: số lần bài phát liền nhau. */
  plays?: number;
}

/**
 * Các bài của nhạc đã ghép vào video (nhiều bài: theo danh sách đã ghép; MV phát một bài nhiều lần: một dòng kèm số lần; một bài: chính
 * file đó, tên bài = `title`).
 */
export function audioTracks(audio: VideoProject["audio"], title?: string): TrackRow[] {
  if (!audio) return [];
  const list = audio.tracks ?? [];
  if (list.length > 1 && new Set(list.map((t) => t.code ?? t.title)).size === 1) {
    return [{ title: list[0].title, start: 0, duration: list[0].duration, file: list[0].name, plays: list.length }];
  }
  if (list.length) return list.map((t) => ({ title: t.title, start: t.start, duration: t.duration, file: t.name }));
  return [{ title: title || audio.name, start: 0, duration: audio.duration, file: audio.name }];
}

export function TrackList({ tracks }: { tracks: TrackRow[] }) {
  const timed = tracks.length > 1 && tracks.every((t) => t.start !== null);
  return (
    <div className="space-y-1.5">
      <ol className="space-y-0.5 text-xs">
        {tracks.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-14 shrink-0 text-right font-mono text-muted">{t.start !== null ? chapterTime(t.start) : `${i + 1}.`}</span>
            <span className="min-w-0">
              <b>{t.title}</b>{" "}
              <span className="break-all text-muted">
                {[t.level ? `mức ${t.level}` : "", t.file ?? "", t.duration ? chapterTime(t.duration) : "", t.plays && t.plays > 1 ? `phát ${t.plays} lần liền nhau` : ""].filter(Boolean).join(" · ")}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {/* Các dòng "0:00 Tên bài" — dán vào mô tả YouTube, YouTube tự tạo chương. */}
      {timed && <CopyButton text={tracklistLines(tracks.map((t) => ({ title: t.title, start: t.start ?? 0 }))).join("\n")} label="📋 Chép danh sách bài (0:00 Tên bài)" />}
    </div>
  );
}

/** Danh sách bài của một video, đọc nhạc đã ghép của video khi mở ra (trang Dây chuyền). */
export function VideoTracks({ mvId, title }: { mvId: string; title?: string }) {
  const [rows, setRows] = useState<TrackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ project: VideoProject }>(`/api/mv/${mvId}/media`).then(
      (s) => setRows(audioTracks(s.project.audio, title)),
      (e) => setError((e as Error).message),
    );
  }, [mvId, title]);
  if (error) return <p className="text-xs text-cherry-dark">{error}</p>;
  if (!rows) return <Spinner />;
  return rows.length ? <TrackList tracks={rows} /> : <p className="text-xs text-muted">Video chưa có nhạc.</p>;
}
