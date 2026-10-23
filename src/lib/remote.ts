// ĐIỀU KHIỂN TỪ XA — phần chạy trong cổng từ xa (monitor.ts mở cổng CHỈ trên địa chỉ Tailscale của máy này):
//   · đăng nhập bằng mật khẩu (trang "Đăng nhập"; nhớ phiên 30 ngày bằng cookie, chỉ lưu bản băm của mã phiên);
//   · chặn yêu cầu đổi dữ liệu gửi từ trang web khác (kiểm tra Origin) và tên miền lạ (Host) — chống giả mạo, chống đổi DNS;
//   · chuyển tiếp mọi trang / API của app (app chính vẫn chỉ mở ở 127.0.0.1) → dùng mọi chức năng như ngồi tại máy.
// Chỉ dùng phía server.

import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import os from "node:os";
import { PAGE_STYLE } from "./monitorPage";
import { REMOTE_SESSIONS_FILE, readJson, writeJson } from "./store";

export const SESSION_COOKIE = "xmas_remote";
const SESSION_DAYS = 30;
const MAX_SESSIONS = 20;
/** Ghi lại "lần dùng gần nhất" của phiên tối đa mỗi chừng này (đỡ ghi file mỗi yêu cầu). */
const SEEN_WRITE_MS = 10 * 60e3;
/** Đăng nhập sai MAX_FAILS lần trong FAIL_WINDOW_MS → khoá địa chỉ đó LOCK_MS. */
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60e3;
const LOCK_MS = 15 * 60e3;
/** Header app nhận được khi yêu cầu đi qua cổng từ xa (cổng xoá header cùng tên do trình duyệt gửi tới). */
export const REMOTE_HEADER = "x-mvs-remote";

export interface RemoteSession {
  /** sha256 của mã phiên (mã thật chỉ nằm trong cookie của trình duyệt). */
  id: string;
  created: string;
  seen: string;
  agent: string;
  ip: string;
}

const g = globalThis as unknown as {
  __mvRemote?: { sessions: RemoteSession[] | null; fails: Map<string, { count: number; first: number; until: number }> };
};
const mem = (g.__mvRemote ??= { sessions: null, fails: new Map() });

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const alive = (s: RemoteSession) => Date.now() - Date.parse(s.seen) < SESSION_DAYS * 86400e3;
export const clientIp = (req: http.IncomingMessage) => (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");

async function sessions(): Promise<RemoteSession[]> {
  mem.sessions ??= (await readJson<{ sessions: RemoteSession[] }>(REMOTE_SESSIONS_FILE(), { sessions: [] })).sessions.filter(alive);
  return mem.sessions;
}
const save = () => writeJson(REMOTE_SESSIONS_FILE(), { sessions: mem.sessions ?? [] });

/** Đọc một cookie trong header Cookie. */
export function cookieValue(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Phiên của yêu cầu (cookie hợp lệ, dùng trong 30 ngày qua) hoặc null. */
export async function findSession(req: http.IncomingMessage): Promise<RemoteSession | null> {
  const token = cookieValue(req.headers.cookie, SESSION_COOKIE);
  if (!token || token.length > 200) return null;
  const id = hashToken(token);
  const s = (await sessions()).find((x) => x.id === id && alive(x));
  if (!s) return null;
  if (Date.now() - Date.parse(s.seen) > SEEN_WRITE_MS) {
    s.seen = new Date().toISOString();
    await save();
  }
  return s;
}

/** Tạo phiên mới sau khi đăng nhập đúng → mã phiên (chỉ đưa vào cookie). */
export async function createSession(req: http.IncomingMessage): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const list = (await sessions()).filter(alive);
  list.push({ id: hashToken(token), created: now, seen: now, agent: String(req.headers["user-agent"] ?? "").slice(0, 160), ip: clientIp(req) });
  mem.sessions = list.slice(-MAX_SESSIONS);
  await save();
  return token;
}

/** Đăng xuất phiên của yêu cầu này. */
export async function dropSession(req: http.IncomingMessage): Promise<void> {
  const token = cookieValue(req.headers.cookie, SESSION_COOKIE);
  if (!token) return;
  const id = hashToken(token);
  mem.sessions = (await sessions()).filter((x) => x.id !== id);
  await save();
}

/** Đăng xuất mọi thiết bị (đổi / xoá mật khẩu cũng gọi). */
export async function dropAllSessions(): Promise<void> {
  mem.sessions = [];
  await save();
}

export async function sessionCount(): Promise<number> {
  return (await sessions()).filter(alive).length;
}

/** Cookie phiên: HttpOnly (script trong trang không đọc được), SameSite=Lax (trang web khác không gửi kèm khi POST). null = xoá. */
export function sessionCookie(token: string | null): string {
  return token
    ? `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
    : `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ---------- Đăng nhập sai nhiều lần ----------

/** Còn bao lâu (ms) địa chỉ này bị khoá đăng nhập; 0 = không khoá. */
export function loginLockedFor(ip: string): number {
  const f = mem.fails.get(ip);
  return f && f.until > Date.now() ? f.until - Date.now() : 0;
}

export function noteLoginFail(ip: string): void {
  const now = Date.now();
  const f = mem.fails.get(ip);
  const cur = f && now - f.first < FAIL_WINDOW_MS ? f : { count: 0, first: now, until: 0 };
  cur.count++;
  if (cur.count >= MAX_FAILS) cur.until = now + LOCK_MS;
  mem.fails.set(ip, cur);
}

export function clearLoginFails(ip: string): void {
  mem.fails.delete(ip);
}

// ---------- Chống giả mạo ----------

/**
 * Tên máy được gọi: địa chỉ Tailscale / 127.0.0.1, tên MagicDNS (…​.ts.net, tên máy, tên một chữ). Tên miền lạ = có thể là trang
 * xấu đổi DNS trỏ về máy này → chặn.
 */
export function okHost(host: string | undefined, isTailscaleIp: (addr: string) => boolean): boolean {
  const m = (host ?? "").match(/^\[([^\]]+)\](?::\d+)?$/) ?? (host ?? "").match(/^([^:[\]]+)(?::\d+)?$/);
  if (!m) return false;
  const name = m[1].toLowerCase();
  return (
    isTailscaleIp(name) ||
    ["127.0.0.1", "localhost", "::1"].includes(name) ||
    name.endsWith(".ts.net") ||
    name === os.hostname().toLowerCase() ||
    /^[a-z0-9-]+$/.test(name)
  );
}

/** Yêu cầu đổi dữ liệu (POST…) phải gửi từ chính trang của cổng: Origin (hoặc Referer) cùng địa chỉ. */
export function sameOrigin(req: http.IncomingMessage): boolean {
  const self = `http://${req.headers.host ?? ""}`;
  const origin = req.headers.origin;
  if (origin) return origin === self;
  const ref = req.headers.referer;
  return Boolean(ref && (ref === self || ref.startsWith(`${self}/`)));
}

/** Đường dẫn quay về sau khi đăng nhập: chỉ đường dẫn trong cổng (không cho chuyển sang trang khác). */
export function safeNext(next: string | null | undefined, fallback: string): string {
  return next && /^\/(?![/\\])/.test(next) && !/[\r\n]/.test(next) ? next : fallback;
}

// ---------- Chuyển tiếp tới app ----------

const HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"]);

/** Chuyển nguyên yêu cầu tới app ở 127.0.0.1:port (cả tải file lớn lên / về, không giữ trong bộ nhớ). */
export function proxyToApp(req: http.IncomingMessage, res: http.ServerResponse, port: number): void {
  const headers: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !HOP.has(k) && k !== REMOTE_HEADER) headers[k] = v;
  // Cookie phiên của cổng không đưa vào app.
  const cookies = (req.headers.cookie ?? "")
    .split(";")
    .filter((p) => p.trim() && p.split("=")[0].trim() !== SESSION_COOKIE)
    .join(";")
    .trim();
  if (cookies) headers.cookie = cookies;
  else delete headers.cookie;
  headers["x-forwarded-for"] = clientIp(req);
  headers["x-forwarded-host"] = req.headers.host ?? "";
  headers["x-forwarded-proto"] = "http";
  headers[REMOTE_HEADER] = "1";
  const up = http.request({ host: "127.0.0.1", port, method: req.method, path: req.url, headers }, (r) => {
    const out: http.OutgoingHttpHeaders = {};
    for (const [k, v] of Object.entries(r.headers)) if (v !== undefined && !HOP.has(k)) out[k] = v;
    res.writeHead(r.statusCode ?? 502, out);
    r.pipe(res);
  });
  up.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/html; charset=utf-8" }).end(messagePage("App chưa chạy", "Cổng từ xa vẫn mở nhưng app chính trên máy chạy chưa phản hồi (đang khởi động hoặc đang cài bản cập nhật). Chờ một chút rồi tải lại trang.", true));
    else res.destroy();
  });
  res.on("close", () => {
    if (!res.writableFinished) up.destroy();
  });
  req.pipe(up);
}

// ---------- Trang của cổng ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${PAGE_STYLE}
  .box { max-width:420px; margin:10vh auto 0; }
  label { display:block; font-weight:600; margin:12px 0 6px; }
  input[type=password] { width:100%; font-size:16px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--ink); }
  button, .btn { display:inline-block; margin-top:14px; font-size:16px; padding:10px 18px; border-radius:999px; border:0; background:#b3261e; color:#fff; font-weight:600; text-decoration:none; cursor:pointer; }
  .err { color:var(--bad); font-weight:600; }
</style>
</head>
<body><main><div class="box"><section>${body}</section></div></main></body>
</html>`;
}

/** Trang đăng nhập (mật khẩu đặt ở máy chạy: Cài đặt → Điều khiển từ xa). */
export function loginPage(next: string, error = ""): string {
  return shell(
    "Đăng nhập — Christmas MV Studio",
    `<h1>🎄 Christmas MV Studio</h1>
<p class="muted">Điều khiển từ xa (qua Tailscale)</p>
<form method="post" action="/_remote/login">
  <input type="hidden" name="next" value="${esc(next)}">
  <label for="pw">Mật khẩu</label>
  <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
  ${error ? `<p class="err">${esc(error)}</p>` : ""}
  <button type="submit">Đăng nhập</button>
</form>
<p class="muted" style="margin-top:16px">Máy này nhớ đăng nhập 30 ngày. Quên mật khẩu: đặt lại ở máy chạy (Cài đặt → Điều khiển từ xa).</p>`,
  );
}

/** Trang báo (app chưa chạy, điều khiển đang tắt…). */
export function messagePage(title: string, text: string, reload = false): string {
  return shell(
    title,
    `<h1>${esc(title)}</h1><p>${esc(text)}</p>
${reload ? `<a class="btn" href="" onclick="location.reload();return false">↻ Tải lại</a>` : ""}
<p style="margin-top:14px"><a href="/_remote/">Xem tiến độ (trang theo dõi)</a></p>`,
  );
}
