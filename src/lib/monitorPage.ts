// Trang theo dõi (chỉ xem) mở trên máy chính của bạn: một file HTML tự đứng, cứ 5 giây đọc /api/status một lần.
// Mọi chữ lấy từ app đều được thoát ký tự trước khi đưa vào trang.

export function monitorPage(): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Theo dõi MV Prompt Studio</title>
<style>
  :root { --bg:#fbf6ec; --card:#fffdf8; --ink:#2b2420; --muted:#7a6f66; --line:#e6dccb; --ok:#2f7d4f; --warn:#a46a00; --bad:#b3261e; --run:#1f5f99; --chip:#f1e9da; }
  @media (prefers-color-scheme: dark) { :root { --bg:#1b1916; --card:#24211d; --ink:#efe8dc; --muted:#a59a8d; --line:#3a352e; --ok:#6cc08f; --warn:#e2b04a; --bad:#ef7b72; --run:#7fb2e5; --chip:#302b25; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.45 system-ui, "Segoe UI", sans-serif; }
  main { max-width:1100px; margin:0 auto; padding:16px; }
  header { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 16px; margin-bottom:12px; }
  h1 { font-size:20px; margin:0; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:0 0 8px; }
  .muted { color:var(--muted); }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%; background:var(--ok); margin-right:6px; }
  .dot.off { background:var(--bad); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-bottom:14px; }
  .tile, section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; }
  .tile b { display:block; font-size:24px; font-variant-numeric:tabular-nums; }
  section { margin-bottom:14px; overflow-x:auto; }
  table { width:100%; border-collapse:collapse; }
  td, th { text-align:left; padding:6px 8px; border-top:1px solid var(--line); vertical-align:top; }
  th { border-top:none; font-weight:600; color:var(--muted); font-size:12px; }
  .chip { display:inline-block; padding:1px 7px; border-radius:999px; background:var(--chip); font-size:12px; margin:1px 2px 1px 0; white-space:nowrap; }
  .done { color:var(--ok); } .error { color:var(--bad); } .waiting { color:var(--warn); } .running { color:var(--run); } .pending { color:var(--muted); }
  .bar { height:6px; background:var(--chip); border-radius:3px; overflow:hidden; margin-top:4px; }
  .bar i { display:block; height:100%; background:var(--run); }
  a { color:var(--run); }
  .warnbox { border-color:var(--bad); }
</style>
</head>
<body>
<main>
  <header>
    <h1>MV Prompt Studio — theo dõi</h1>
    <span class="muted" id="machine"></span>
    <span class="muted"><span class="dot" id="dot"></span><span id="updated">Đang tải…</span></span>
  </header>
  <div class="grid" id="tiles"></div>
  <section id="alerts" class="warnbox" hidden></section>
  <section><h2>Dây chuyền (đang làm)</h2><div id="open"></div></section>
  <section><h2>MV đã xong gần đây</h2><div id="done"></div></section>
  <section><h2>Muse · dựng video · kho nhạc</h2><div id="system"></div></section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const time = (iso) => iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
const gb = (b) => (b / 1073741824).toFixed(1) + " GB";
const STEP = { script: "Kịch bản", song: "Bài hát", clips: "Clip Muse", render: "Dựng MP4" };
const ICON = { pending: "·", running: "…", waiting: "⏸", done: "✓", error: "✗" };
const ORDER = ["script", "song", "clips", "render"];
function focus(it) {
  for (const st of ["error", "waiting", "running"]) { const n = ORDER.find((k) => it.steps[k].status === st); if (n) return { n, ...it.steps[n] }; }
  return null;
}
function tile(label, value, sub, cls) { return '<div class="tile"><span class="muted">' + esc(label) + '</span><b class="' + (cls || "") + '">' + esc(value) + '</b><span class="muted">' + esc(sub || "") + "</span></div>"; }
function render(s) {
  $("machine").textContent = "Máy chạy: " + s.machine + " · app mở từ " + time(s.upSince);
  const items = s.pipeline.items, open = items.filter((i) => !i.done_at), done = items.filter((i) => i.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at));
  const today = new Date().toDateString();
  const err = open.filter((i) => ORDER.some((k) => i.steps[k].status === "error")).length;
  const waitSong = open.filter((i) => i.steps.song.status === "waiting").length;
  const m = s.muse;
  const museState = m.haohao ? "HaoHao (dán tay)" : m.limitHit ? "Hết lượt" : m.paused ? "Đang dừng" : m.loggedIn === false ? "Chưa đăng nhập" : m.counts && (m.counts.processing || m.counts.queued) ? "Đang làm" : "Rảnh";
  const disk = s.disks[0];
  $("tiles").innerHTML =
    tile("Đang làm", open.length - err - waitSong, "MV trong dây chuyền", "running") +
    tile("Chờ bài hát", waitSong, "", waitSong ? "waiting" : "") +
    tile("Lỗi", err, "cần xử lý", err ? "error" : "") +
    tile("Đã xong", done.length, done.filter((i) => new Date(i.done_at).toDateString() === today).length + " hôm nay", "done") +
    tile("Kho ý tưởng", s.bank.ready ?? s.bank.counts.new, s.bank.ready !== null ? "có nhạc, sẵn sàng" : "chưa dùng") +
    tile("Muse", museState, m.counts ? (m.counts.queued + m.counts.processing) + " cảnh chờ / đang làm" : "", m.limitHit || m.loggedIn === false ? "error" : "") +
    (disk ? tile("Ổ " + disk.path + " còn trống", gb(disk.free), "trên " + gb(disk.total), disk.free < 10 * 1073741824 ? "error" : "") : "");
  const alerts = [];
  if (s.mode === "manual") alerts.push("Máy chạy chưa có Claude API key — không tự viết được kịch bản.");
  if (m.loggedIn === false) alerts.push("Muse chưa đăng nhập — vào máy chạy, Cài đặt → Đăng nhập Muse.");
  if (m.limitHit) alerts.push("Muse báo hết lượt (" + time(new Date(m.limitHit.at).toISOString()) + "): " + m.limitHit.message);
  else if (m.paused) alerts.push("Muse đang dừng: " + m.paused);
  if (m.error) alerts.push("Muse: " + m.error);
  if (s.pipeline.error) alerts.push("Dây chuyền: " + s.pipeline.error);
  if (s.drive.error) alerts.push("Kho nhạc Drive: " + s.drive.error);
  if (s.bank.error) alerts.push("Đề xuất ý tưởng: " + s.bank.error);
  for (const ev of (m.failover || [])) alerts.push(ev.kind === "switch" ? "Đã tự đổi tài khoản Muse “" + ev.from + "” → “" + ev.to + "” (" + time(ev.at) + "): " + ev.reason : "Tài khoản Muse “" + ev.from + "” bị lỗi và hết tài khoản dự phòng (" + time(ev.at) + ") — cần bạn xử lý.");
  if (s.bank.proposals) alerts.push(s.bank.proposals + " ý tưởng Claude đề xuất đang chờ bạn duyệt (trên máy chạy).");
  for (const d of ((s.songs && s.songs.duplicates) || [])) alerts.push("MV dùng trùng bài " + d.file + ": " + d.titles.join(" · ") + " — đổi bài cho MV chưa đăng (trang Ghép video trên máy chạy).");
  if (disk && disk.free < 10 * 1073741824) alerts.push("Ổ " + disk.path + " sắp đầy: còn " + gb(disk.free) + ".");
  $("alerts").hidden = !alerts.length;
  $("alerts").innerHTML = "<h2>Cần chú ý</h2>" + alerts.map((a) => "<div class=error>• " + esc(a) + "</div>").join("");
  $("open").innerHTML = open.length
    ? "<table><tr><th>MV</th><th>Các bước</th><th>Đang ở</th></tr>" + open.map((i) => {
        const f = focus(i);
        return "<tr><td>" + (i.idea ? "#" + esc(i.idea) + " " : "") + esc(i.title) + "</td><td>" +
          ORDER.map((k) => '<span class="chip ' + i.steps[k].status + '">' + ICON[i.steps[k].status] + " " + STEP[k] + "</span>").join("") +
          "</td><td" + (f ? ' class="' + f.status + '"' : "") + ">" + (f ? esc(STEP[f.n] + ": " + (f.message || "")) : "") + "</td></tr>";
      }).join("") + "</table>"
    : '<span class="muted">Không có việc nào đang làm.</span>';
  $("done").innerHTML = done.length
    ? "<table><tr><th></th><th>MV</th><th>Xong lúc</th><th>Tải về</th></tr>" + done.slice(0, 15).map((i) =>
        "<tr><td>" + (i.cover ? '<a href="' + esc(i.cover) + '" target="_blank"><img src="' + esc(i.cover) + '" alt="" style="width:120px;border-radius:4px;display:block"></a>' : "") +
        "</td><td>" + (i.idea ? "#" + esc(i.idea) + " " : "") + esc(i.title) + (i.yt_title ? '<div class="muted">' + esc(i.yt_title) + "</div>" : "") +
        "</td><td>" + esc(time(i.done_at)) + "</td><td>" +
        [i.video ? '<a href="' + esc(i.video) + '">⬇ MP4</a>' : "", i.cover ? '<a href="' + esc(i.cover) + '?download=1">⬇ Ảnh bìa</a>' : "", i.info ? '<a href="' + esc(i.info) + '">⬇ Tiêu đề + mô tả</a>' : ""].filter(Boolean).join(" · ") +
        "</td></tr>").join("") + "</table>"
    : '<span class="muted">Chưa có MV nào xong.</span>';
  const rows = [];
  if (!m.haohao && m.counts) rows.push("<tr><td>Muse" + (m.account ? " · " + esc(m.account) : "") + "</td><td>" + esc(museState) + " · chờ " + m.counts.queued + " · đang làm " + m.counts.processing + " · xong " + m.counts.succeeded + " · lỗi " + m.counts.failed + (m.fake ? " · (Muse giả)" : "") + "</td></tr>");
  rows.push("<tr><td>Dựng video</td><td>" + (s.render ? esc(s.render.title + " — " + s.render.stage) + '<div class="bar"><i style="width:' + Math.round(s.render.progress * 100) + '%"></i></div>' : "Không dựng gì") + "</td></tr>");
  const d = s.drive;
  rows.push("<tr><td>Kho nhạc Drive</td><td>" + (d.running ? esc(d.phase || "Đang đồng bộ…") : d.last ? "Đồng bộ lúc " + esc(time(d.last.at)) + " · " + d.last.unused + " bản chưa dùng trên Drive · tải mới " + d.last.downloaded : "Chưa đồng bộ") + "</td></tr>");
  rows.push("<tr><td>Kho ý tưởng</td><td>chưa dùng " + s.bank.counts.new + (s.bank.ready !== null ? " (có nhạc " + s.bank.ready + ")" : "") + " · đã dùng " + s.bank.counts.used + (s.bank.suggesting ? " · Claude đang nghĩ ý tưởng mới" : "") + "</td></tr>");
  const sg = s.songs;
  if (sg && sg.toMark.length) rows.push("<tr><td>Nhạc cần ghi “đã dùng” trên Drive (" + sg.toMark.length + ")</td><td>" + sg.toMark.map((x) => "<b>" + esc(x.file) + "</b> " + esc(x.title)).join("<br>") + "</td></tr>");
  $("system").innerHTML = "<table>" + rows.join("") + "</table>";
}
async function tick() {
  try {
    const r = await fetch("api/status", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    render(await r.json());
    $("dot").className = "dot";
    $("updated").textContent = "Cập nhật " + new Date().toLocaleTimeString("vi-VN");
  } catch {
    $("dot").className = "dot off";
    $("updated").textContent = "Mất kết nối với máy chạy — thử lại sau 5 giây (máy chạy tắt, ngủ, hoặc Tailscale ngắt?)";
  }
}
tick();
setInterval(tick, 5000);
</script>
</body>
</html>`;
}
