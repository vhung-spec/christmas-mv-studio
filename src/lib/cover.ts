// ẢNH BÌA + THÔNG TIN YOUTUBE cho video vừa dựng (không tốn lượt Muse):
//   - ảnh bìa 1280×720: một khung hình đẹp lấy từ chính clip của video (cảnh có nhân vật, ưu tiên điệp khúc / cảnh signature),
//     màu ấm hơn, tên video thật to + dòng "địa điểm · năm · 1 Hour" ở dưới, logo kênh ở góc nếu có. Chữ đọc từ file (không chèn
//     vào filtergraph), font có dấu tiếng Việt như intro;
//   - file .txt: tiêu đề (gợi ý số 1), các tiêu đề khác, mô tả (kèm danh sách bài + mốc thời gian) + hashtag — dán thẳng lên YouTube.
// Chỉ dùng phía server.

import { promises as fs } from "node:fs";
import path from "node:path";
import { cleanText } from "./branding";
import { ffmpegOrThrow, hasFilter } from "./ffmpeg";
import { defaultFont } from "./fonts";
import { mediaPath } from "./media";
import { videoLengthLabel } from "./prompts";
import type { MVResult, Shot, VideoProject } from "./types";

const W = 1280;
const H = 720;

type ClipRef = { file: string; duration: number; owner?: string };

/** Cảnh làm ảnh bìa: có clip; hai nhân vật > một người; điệp khúc / signature / cận-trung cảnh được cộng điểm; cảnh đời sống Giáng sinh 50s bị trừ. */
export function pickCoverShot(mv: Pick<MVResult, "shots">, clips: Record<string, ClipRef>): Shot | null {
  const score = (s: Shot) =>
    (s.characters_in_shot.length >= 2 ? 4 : s.characters_in_shot.length ? 2 : 0) +
    (/chorus/i.test(s.section) ? 2 : 0) +
    (s.signature_shot ? 2 : 0) +
    (/close|medium/i.test(s.shot_size) ? 1 : 0) -
    (s.era_life ? 3 : 0) -
    (s.is_motion ? 1 : 0); // cảnh nhảy dễ nhoè
  const withClip = mv.shots.filter((s) => clips[String(s.shot_no)]);
  return withClip.sort((a, b) => score(b) - score(a) || a.shot_no - b.shot_no)[0] ?? null;
}

/**
 * Chữ trên ảnh bìa: tên video (hoặc phần đầu tiêu đề YouTube) chia tối đa 2 dòng + dòng "địa điểm · năm", thêm độ dài với video dài
 * (`seconds` ≥ 20 phút, vd. "· 1 Hour").
 */
export function coverText(mv: Pick<MVResult, "idea" | "youtube_titles">, hook?: string, seconds?: number): { lines: string[]; sub: string } {
  // Phần đầu tiêu đề YouTube: cắt ở " | ", " — ", " : ", "(" hoặc biểu tượng (🎄 — font chữ không vẽ được emoji).
  const titlePart = (mv.youtube_titles ?? [])[0]?.split(/\s+[|—–:•·]\s+|\s*\(|\s*\p{Extended_Pictographic}/u)[0] ?? "";
  const raw = (mv.idea.song_title || titlePart || hook || mv.idea.world_location).replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "").trim();
  // Dài quá 60 ký tự thì bỏ cả từ bị cắt dở, không cắt giữa chữ.
  const cut = raw.slice(0, 60);
  const big = cleanText(raw.length <= 60 || /\s/.test(raw[60]) ? cut : cut.replace(/\s+\S*$/, ""), 60);
  const words = big.split(/\s+/);
  const lines: string[] = [];
  if (big.length <= 22 || words.length < 2) lines.push(big);
  else {
    // Chia hai dòng gần bằng nhau theo số ký tự.
    let best = 1;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ").length;
      const b = words.slice(i).join(" ").length;
      const bestA = words.slice(0, best).join(" ").length;
      if (Math.abs(a - b) < Math.abs(bestA - words.slice(best).join(" ").length)) best = i;
    }
    lines.push(words.slice(0, best).join(" "), words.slice(best).join(" "));
  }
  const loc = mv.idea.world_location.trim();
  const year = loc.match(/\b(19\d\d)\b/)?.[1];
  const length = seconds && seconds >= 20 * 60 ? ` · ${videoLengthLabel(seconds / 60)}` : "";
  const sub = cleanText(`${year ? `${loc.replace(/\s*\b19\d\d\b\s*/, " ").trim()} · ${year}` : loc}${length}`, 80);
  return { lines, sub };
}

/** Nội dung file thông tin YouTube. */
export function youtubeInfo(mv: Pick<MVResult, "youtube_titles" | "youtube_description" | "idea">): string {
  const titles = (mv.youtube_titles ?? []).map((t) => t.trim()).filter(Boolean);
  const out = [
    "TIÊU ĐỀ",
    titles[0] ?? mv.idea.song_title ?? mv.idea.world_location,
    "",
    ...(titles.length > 1 ? ["TIÊU ĐỀ KHÁC", ...titles.slice(1), ""] : []),
    "MÔ TẢ",
    (mv.youtube_description ?? "").trim(),
    "",
  ];
  return out.join("\r\n");
}

/**
 * Tạo ảnh bìa + file thông tin YouTube cạnh file MP4 (cùng tên, thêm "-cover.jpg" / "-youtube.txt").
 * Trả về tên hai file (trong thư mục media của MV). Ảnh bìa lỗi thì vẫn có file thông tin (cover = null).
 */
export async function makeCoverAndInfo(
  mv: MVResult,
  project: Pick<VideoProject, "clips" | "logo" | "font"> & Partial<Pick<VideoProject, "audio">>,
  videoFile: string,
  work: string,
  hook?: string,
): Promise<{ cover: string | null; info: string }> {
  const stem = videoFile.replace(/\.mp4$/i, "");
  const info = `${stem}-youtube.txt`;
  await fs.writeFile(mediaPath(mv.id, info), "﻿" + youtubeInfo(mv), "utf8");

  const clips = project.clips as Record<string, ClipRef>;
  const shot = pickCoverShot(mv, clips);
  if (!shot) return { cover: null, info };
  const clip = clips[String(shot.shot_no)];
  const clipPath = mediaPath(clip.owner ?? mv.id, clip.file);
  const at = Math.max(0, Math.min((clip.duration || 4) * 0.45, (clip.duration || 4) - 0.2));

  // Font + chữ chép vào thư mục làm việc, ffmpeg đọc bằng tên tương đối.
  const { lines, sub } = coverText(mv, hook, project.audio?.duration);
  const fontSrc = project.font ? mediaPath((project.font as ClipRef).owner ?? mv.id, project.font.file) : defaultFont();
  const canText = Boolean(fontSrc) && (await hasFilter("drawtext"));
  let text = "";
  if (canText) {
    const fontFile = `cover_font${path.extname(fontSrc!).toLowerCase()}`;
    await fs.copyFile(fontSrc!, path.join(work, fontFile));
    await fs.writeFile(path.join(work, "cover_sub.txt"), sub, "utf8");
    const big = lines.length > 1 ? 78 : 92;
    const style = `fontfile=${fontFile}:expansion=none:borderw=5:bordercolor=black@0.75:shadowcolor=black@0.6:shadowx=4:shadowy=4:x=(w-text_w)/2`;
    const subY = H - 46 - 38;
    let y = subY - 24 - lines.length * (big + 10);
    for (let i = 0; i < lines.length; i++) {
      await fs.writeFile(path.join(work, `cover_l${i}.txt`), lines[i], "utf8");
      text += `,drawtext=textfile=cover_l${i}.txt:${style}:fontsize=${big}:fontcolor=0xFFE7A8:y=${y}`;
      y += big + 10;
    }
    text += `,drawtext=textfile=cover_sub.txt:${style}:fontsize=36:fontcolor=white:y=${subY}`;
  }
  // Nền tối dần mượt ở 55% dưới ảnh cho chữ dễ đọc (alpha tăng theo bình phương chiều cao).
  const gh = Math.round(H * 0.55);
  const graph = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=contrast=1.06:saturation=1.18:brightness=0.01[bg]`,
    `color=c=black:s=${W}x${gh}:d=1,format=gray,geq=lum='205*(Y/H)*(Y/H)'[mask]`,
    `color=c=black:s=${W}x${gh}:d=1[black]`,
    `[black][mask]alphamerge[shade]`,
    `[bg][shade]overlay=0:${H - gh}${text}${project.logo ? "[txt]" : ""}`,
    ...(project.logo ? [`[1:v]scale=${Math.round(W * 0.12)}:-1[lg]`, `[txt][lg]overlay=W-w-28:28`] : []),
  ].join(";");
  const logoPath = project.logo ? mediaPath((project.logo as ClipRef).owner ?? mv.id, project.logo.file) : null;
  const cover = `${stem}-cover.jpg`;
  try {
    await ffmpegOrThrow(
      ["-hide_banner", "-loglevel", "error", "-y", "-ss", at.toFixed(2), "-i", clipPath, ...(logoPath ? ["-i", logoPath] : []), "-filter_complex", graph, "-frames:v", "1", "-q:v", "2", mediaPath(mv.id, cover)],
      "Tạo ảnh bìa",
      { cwd: work },
    );
    return { cover, info };
  } catch (err) {
    console.error("[cover]", (err as Error).message);
    return { cover: null, info };
  }
}
