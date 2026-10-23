// Mở lại app (vd. máy khởi động lại, không ai mở trình duyệt): tự chạy tiếp việc dở — dây chuyền, Muse — và tự đồng bộ kho nhạc
// từ Google Drive định kỳ, mở cổng từ xa cho máy khác (nếu bật), và tự cập nhật (kiểm tra bản mới mỗi giờ, cài khi app rảnh).
// Gọi một lần từ instrumentation.ts khi server khởi động. Chỉ dùng phía server.

import { autoSyncDue, startDriveSync } from "./driveSync";
import { syncMonitor } from "./monitor";
import { failoverTick } from "./museEngine/accounts";
import { museView } from "./museJobs";
import { ensurePipelineWatch, pipelineView } from "./pipeline";
import { readSettings } from "./store";
import { updateTick } from "./updater";

/** Kiểm tra lại định kỳ (tự đồng bộ đến hạn, dây chuyền đang nghỉ mà kho có ý tưởng mới có nhạc…). */
const CHECK_MS = 30 * 60 * 1000;
/** Dò lại địa chỉ Tailscale cho cổng từ xa (Tailscale có thể bật sau app, hoặc đổi địa chỉ). */
const MONITOR_MS = 60 * 1000;
/** Kiểm tra tài khoản Muse lỗi để tự đổi sang tài khoản dự phòng (nếu bật). */
const FAILOVER_MS = 2 * 60 * 1000;
/** Tự cập nhật: tới hạn thì hỏi GitHub (mỗi giờ); có bản mới đã tải thì chờ app rảnh rồi cài. */
const UPDATE_MS = 2 * 60 * 1000;

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
  const monitor = () => void syncMonitor().catch((err) => console.error("[monitor]", err));
  setTimeout(monitor, 3000);
  setInterval(monitor, MONITOR_MS).unref?.();
  const failover = async () => {
    try {
      if ((await readSettings()).museMode === "gateway") await failoverTick();
    } catch (err) {
      console.error("[failover]", err);
    }
  };
  setInterval(() => void failover(), FAILOVER_MS).unref?.();
  const update = () => void updateTick().catch((err) => console.error("[cập nhật]", err));
  // Chờ app chạy ổn vài phút sau khi mở rồi mới hỏi bản mới.
  setTimeout(update, 3 * 60 * 1000).unref?.();
  setInterval(update, UPDATE_MS).unref?.();
}
