// Mở lại app (vd. máy khởi động lại, không ai mở trình duyệt): tự chạy tiếp việc dở — dây chuyền, Muse — và tự đồng bộ kho nhạc
// từ Google Drive định kỳ. Gọi một lần từ instrumentation.ts khi server khởi động. Chỉ dùng phía server.

import { autoSyncDue, startDriveSync } from "./driveSync";
import { museView } from "./museJobs";
import { ensurePipelineWatch, pipelineView } from "./pipeline";

/** Kiểm tra lại định kỳ (tự đồng bộ đến hạn, dây chuyền đang nghỉ mà kho có ý tưởng mới có nhạc…). */
const CHECK_MS = 30 * 60 * 1000;

const g = globalThis as unknown as { __mvAutostart?: boolean };

export function autostart(): void {
  if (g.__mvAutostart) return;
  g.__mvAutostart = true;
  const tick = async () => {
    try {
      await pipelineView(); // còn việc dở hoặc kho ý tưởng còn ý tưởng → dây chuyền chạy tiếp
      await museView(); // còn cảnh đang làm → Muse chạy tiếp
      if (await autoSyncDue()) startDriveSync(() => ensurePipelineWatch());
    } catch (err) {
      console.error("[autostart]", err);
    }
  };
  setTimeout(() => void tick(), 5000);
  setInterval(() => void tick(), CHECK_MS).unref?.();
}
