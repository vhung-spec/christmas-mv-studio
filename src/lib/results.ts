// THƯ MỤC KẾT QUẢ: mỗi MV dựng xong có một thư mục riêng trong "Thư mục kết quả" (Cài đặt), vd.
//   KET QUA\008 - Santa Monica Moonlight 1959\
//     Just Us Two - Santa Monica Moonlight 1959.mp4   (tên theo tiêu đề YouTube — YouTube lấy tên file làm tiêu đề mặc định)
//     Ảnh bìa.jpg
//     Tiêu đề - mô tả.txt
// Thư mục kết quả nằm trong ổ Google Drive (Google Drive cho máy tính) thì các file tự được đưa lên Drive.
// Video được tạo bằng liên kết cứng khi cùng ổ đĩa (không tốn thêm chỗ), khác ổ thì chép. Không xoá file nào. Chỉ dùng phía server.

import { promises as fs } from "node:fs";
import path from "node:path";
import { downloadName } from "./branding";
import { mediaPath } from "./media";
import type { MVResult, RenderInfo } from "./types";

export const COVER_NAME = "Ảnh bìa.jpg";
export const INFO_NAME = "Tiêu đề - mô tả.txt";

const safeName = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim()
    .slice(0, 100);

/** Tên thư mục kết quả của MV: số ý tưởng (3 chữ số, để xếp đúng thứ tự) + địa điểm. */
export function resultFolderName(mv: Pick<MVResult, "idea">): string {
  const id = /^\d+$/.test(mv.idea.id) ? mv.idea.id.padStart(3, "0") : safeName(mv.idea.id);
  return `${id} - ${safeName(mv.idea.world_location) || "MV"}`;
}

async function exists(p: string) {
  return fs.stat(p).then(
    () => true,
    () => false,
  );
}

/** Liên kết cứng (cùng ổ, không tốn chỗ); không được (khác ổ, ổ Google Drive…) thì chép. */
async function linkOrCopy(from: string, to: string) {
  try {
    await fs.link(from, to);
  } catch {
    await fs.copyFile(from, to);
  }
}

/**
 * Tạo thư mục kết quả cho một lần dựng. Thư mục đã có (dựng lại MV) → thêm " (2)", " (3)"… để không ghi đè.
 * Trả về đường dẫn thư mục.
 */
export async function exportResult(mv: MVResult, render: Pick<RenderInfo, "file" | "cover" | "youtube_info" | "download_name">, resultsDir: string): Promise<string> {
  await fs.mkdir(/*turbopackIgnore: true*/ resultsDir, { recursive: true });
  const base = path.join(/*turbopackIgnore: true*/ resultsDir, resultFolderName(mv));
  let dir = base;
  for (let k = 2; await exists(dir); k++) dir = `${base} (${k})`;
  await fs.mkdir(dir);
  const video = render.download_name || downloadName(mv.youtube_titles?.[0] || mv.idea.world_location);
  await linkOrCopy(mediaPath(mv.id, render.file), path.join(dir, video));
  if (render.cover) await linkOrCopy(mediaPath(mv.id, render.cover), path.join(dir, COVER_NAME));
  if (render.youtube_info) await fs.copyFile(mediaPath(mv.id, render.youtube_info), path.join(dir, INFO_NAME));
  return dir;
}
