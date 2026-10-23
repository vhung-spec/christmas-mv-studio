#!/usr/bin/env node
// Đóng gói app để chép sang máy khác (bấm đúp "Dong-goi-cai-moi.bat" / "Dong-goi-cap-nhat.bat"):
//   node scripts/dong-goi.mjs             → bản CÀI MỚI: mã nguồn + dữ liệu của bạn (cài đặt, thư viện lời, kênh, kho ý tưởng, chủ đề…)
//   node scripts/dong-goi.mjs --cap-nhat  → bản CẬP NHẬT: chỉ mã nguồn (giải nén đè lên thư mục app ở máy kia, dữ liệu ở đó giữ nguyên)
//   --ra <thư mục>                        → nơi để file zip (mặc định: thư mục "<tên thư mục app>-goi" cạnh thư mục app,
//                                           vd. D:\bokin-christmas → D:\bokin-christmas-goi)
// Không bao giờ đóng gói API key (.env*), thư viện đã cài (node_modules), bản build (.next), video / clip / lịch sử MV,
// hàng đợi Muse / dựng của máy này, hay profile Chrome có phiên đăng nhập Muse.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const update = args.includes("--cap-nhat");
const outIdx = args.indexOf("--ra");
const OUT = path.resolve(outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : path.join(path.dirname(ROOT), `${path.basename(ROOT)}-goi`));
const NAME = "Christmas-MV-Studio";
const zipName = `${NAME}-${update ? "cap-nhat" : "cai-moi"}.zip`;

/** Dữ liệu của bạn mang theo khi cài mới (có file nào thì lấy file đó). */
const DATA_KEEP = [
  "settings.json",
  "themes.json",
  "locations.json",
  "era_rules.json",
  "style_presets.json",
  "video_models.json",
  "pricing.json",
  "couples.json",
  "song_library.json",
  "ideas.json",
  // Kênh + lịch sử nhạc từng kênh: phải đi cùng kho ý tưởng (mỗi ý tưởng gắn mã kênh).
  "channels.json",
];

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/** Chuyển file vào Thùng rác: Windows = Thùng rác thật (PowerShell, Microsoft.VisualBasic); máy khác = thư mục _thung-rac bên cạnh. */
function toTrash(file) {
  if (process.platform !== "win32") {
    const bin = path.join(path.dirname(file), "_thung-rac");
    mkdirSync(bin, { recursive: true });
    renameSync(file, path.join(bin, `${path.basename(file)}-${Date.now().toString(36)}`));
    return;
  }
  // Đường dẫn truyền qua biến môi trường — không ghép vào câu lệnh.
  const script = "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:MV_TRASH_TARGET, 'OnlyErrorDialogs', 'SendToRecycleBin')";
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { env: { ...process.env, MV_TRASH_TARGET: file }, windowsHide: true, encoding: "utf8" });
  if (r.status !== 0 || existsSync(file)) fail(`Không chuyển được gói cũ vào Thùng rác: ${file}${r.stderr ? ` (${r.stderr.trim()})` : ""}`);
}

// 1. Danh sách file mã nguồn (file git đang theo dõi, lấy bản đang có trên máy).
const git = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
if (git.status !== 0) fail("Cần Git để biết file nào thuộc mã nguồn (git ls-files không chạy được).");
const files = git.stdout
  .split("\0")
  .filter(Boolean)
  .filter((f) => !f.startsWith("data/") && !/(^|\/)\.env/.test(f) && existsSync(path.join(ROOT, f)));

// 2. Chép vào thư mục tạm cạnh nơi để zip (không dùng ổ C).
const stage = path.join(OUT, ".dang-dong-goi");
const app = path.join(stage, NAME);
rmSync(stage, { recursive: true, force: true });
const copy = (rel, from = path.join(ROOT, rel)) => {
  const to = path.join(app, rel);
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
};
for (const f of files) copy(f);
const data = [];
if (!update) {
  for (const f of DATA_KEEP) {
    const p = path.join(ROOT, "data", f);
    if (existsSync(p)) {
      copy(path.join("data", f), p);
      data.push(f);
    }
  }
  // Thư mục nhạc: máy kia có thể không có cùng ổ đĩa (vd. chỉ có ổ C) → ghi tên thư mục không kèm ổ đĩa,
  // app hiểu là thư mục nằm cạnh thư mục app (vd. app ở C:\Christmas-MV-Studio\Christmas-MV-Studio → nhạc ở
  // C:\Christmas-MV-Studio\KHO NHAC GIANG SINH).
  const sp = path.join(app, "data", "settings.json");
  if (existsSync(sp)) {
    const s = JSON.parse(readFileSync(sp, "utf8"));
    if (typeof s.songDir === "string" && path.isAbsolute(s.songDir.trim())) {
      s.songDir = path.basename(s.songDir.trim().replace(/[\\/]+$/, "")) || "KHO NHAC GIANG SINH";
      writeFileSync(sp, JSON.stringify(s, null, 2) + "\n");
    }
  }
}

// 3. Nén. Gói cũ cùng tên chuyển vào Thùng rác (không xoá hẳn), như moveToTrash của app (src/lib/trash.ts).
const zip = path.join(OUT, zipName);
const oldZip = existsSync(zip);
if (oldZip) toTrash(zip);
// Windows 10/11 có sẵn tar.exe tạo được zip chuẩn (đường dẫn dùng "/"); Compress-Archive của PowerShell 5 ghi "\" nên chỉ dùng khi thiếu tar.
const winTar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const res =
  process.platform !== "win32"
    ? spawnSync("zip", ["-rq", zip, NAME], { cwd: stage, stdio: "inherit" })
    : existsSync(winTar)
      ? spawnSync(winTar, ["-a", "-c", "-f", zip, NAME], { cwd: stage, stdio: "inherit" })
      : spawnSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${app.replace(/'/g, "''")}' -DestinationPath '${zip.replace(/'/g, "''")}' -Force`], { stdio: "inherit" });
rmSync(stage, { recursive: true, force: true });
if (res.status !== 0 || !existsSync(zip)) fail("Không nén được file zip.");

const size = statSync(zip).size;
console.log(`\n✔ Đã đóng gói: ${zip} (${(size / 1048576).toFixed(1)} MB, ${files.length + data.length} file)`);
if (oldZip) console.log(`  Gói cũ cùng tên đã chuyển vào Thùng rác.`);
if (update) {
  console.log("  Bản CẬP NHẬT (chỉ mã nguồn): ở máy kia tắt app, giải nén đè lên thư mục app (chọn Thay thế), rồi chạy lại Chay-Christmas-MV-Studio.bat.");
} else {
  console.log(`  Dữ liệu mang theo: ${data.join(", ") || "(không có)"}`);
  console.log("  KHÔNG có API key, phiên đăng nhập Muse, file nhạc hay video — làm theo HUONG-DAN-MAY-MOI.txt trong gói.");
}
console.log(`  Các gói trong ${OUT}: ${readdirSync(OUT).filter((f) => f.endsWith(".zip")).join(", ")}\n`);
