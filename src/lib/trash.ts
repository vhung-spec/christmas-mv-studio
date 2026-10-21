// Chuyển file / thư mục vào Thùng rác thay vì xoá vĩnh viễn (quy tắc của app: không bao giờ xoá hẳn dữ liệu của bạn).
// Windows: Thùng rác thật (qua PowerShell, Microsoft.VisualBasic). Máy khác hoặc khi đặt MV_TRASH_DIR (test): chuyển vào thư mục đó.
// Chỉ dùng phía server.

import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

export async function moveToTrash(target: string): Promise<void> {
  const custom = process.env.MV_TRASH_DIR;
  if (custom || process.platform !== "win32") {
    const bin = custom ? path.resolve(/*turbopackIgnore: true*/ custom) : path.join(/*turbopackIgnore: true*/ path.dirname(target), "_thung-rac");
    await fs.mkdir(bin, { recursive: true });
    await fs.rename(target, path.join(/*turbopackIgnore: true*/ bin, `${path.basename(target)}-${Date.now().toString(36)}`));
    return;
  }
  const isDir = (await fs.stat(target)).isDirectory();
  const call = isDir ? "DeleteDirectory" : "DeleteFile";
  // Đường dẫn truyền qua biến môi trường — không ghép vào câu lệnh (không lo dấu nháy / ký tự lạ).
  const script = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${call}($env:MV_TRASH_TARGET, 'OnlyErrorDialogs', 'SendToRecycleBin')`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
      env: { ...process.env, MV_TRASH_TARGET: target },
      windowsHide: true,
    });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 && !existsSync(target) ? resolve() : reject(new Error(err.trim() || `PowerShell mã ${code}`))));
  });
}
