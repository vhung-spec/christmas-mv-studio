// Mốc thời gian và danh sách bài kiểu YouTube ("0:00 Silver Bells Waltz") — dùng cả phía server (mô tả YouTube, playlist.ts) lẫn
// trên trình duyệt (danh sách nhạc của từng video, nút chép).

import type { PlaylistTrack } from "./types";

/** Mốc thời gian kiểu YouTube: "0:00", "3:07", "1:02:03". */
export function chapterTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec + 1e-6));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Các dòng danh sách bài cho mô tả YouTube ("0:00 Snowfall On Main Street") — YouTube tự tạo chương. */
export function tracklistLines(tracks: Pick<PlaylistTrack, "title" | "start">[]): string[] {
  return tracks.map((t) => `${chapterTime(t.start)} ${t.title}`);
}
