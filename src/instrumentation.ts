// Next.js gọi register() một lần khi server khởi động: app tự chạy tiếp việc dở dù không ai mở trình duyệt (vd. máy chạy app
// khởi động lại sau khi cập nhật Windows). NO_AUTOSTART=1 để tắt.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NO_AUTOSTART) return;
  const { autostart } = await import("./lib/autostart");
  autostart();
}
