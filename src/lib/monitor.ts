// CỔNG TỪ XA — để máy khác / điện thoại của bạn xem tiến độ (trang theo dõi /_remote/) và, khi bật "Cho phép điều khiển",
// dùng cả app như ngồi tại máy (remote.ts chuyển tiếp mọi trang tới app). App chính vẫn chỉ mở ở 127.0.0.1. Cổng là một máy chủ
// riêng CHỈ mở trên địa chỉ Tailscale của máy này (100.x.y.z): máy cùng wifi hay người ngoài không vào được, chỉ các máy đăng
// nhập cùng tài khoản Tailscale của bạn. Vào cổng phải đăng nhập bằng mật khẩu (bạn tự đặt trong app; lưu dạng băm trong
// .env.local, không commit). Chỉ dùng phía server.

import { createReadStream, promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { setEnvLine } from "./apikey";
import { channelsView } from "./channelsView";
import { driveSyncStatus } from "./driveSync";
import { generationMode } from "./generate";
import { bankView } from "./ideaBank";
import { mediaPath } from "./media";
import { monitorPage } from "./monitorPage";
import { museAccounts } from "./museEngine/accounts";
import { museView } from "./museJobs";
import { pipelineView } from "./pipeline";
import { readQueue } from "./queue";
import {
  clearLoginFails,
  clientIp,
  createSession,
  dropAllSessions,
  dropSession,
  findSession,
  loginLockedFor,
  loginPage,
  messagePage,
  noteLoginFail,
  okHost,
  proxyToApp,
  safeNext,
  sameOrigin,
  sessionCookie,
  sessionCount,
} from "./remote";
import { SAFE_ID, readSettings } from "./store";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const HASH_ENV = "MONITOR_PASSWORD_HASH";

/** Địa chỉ Tailscale: IPv4 100.64.0.0/10, IPv6 fd7a:115c:a1e0::/48. */
export function isTailscaleIp(addr: string): boolean {
  const v4 = addr.match(/^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return Number(v4[1]) >= 64 && Number(v4[1]) <= 127;
  return /^fd7a:115c:a1e0:/i.test(addr);
}

/** Địa chỉ Tailscale của máy này (IPv4 trước). Rỗng = chưa cài / chưa bật Tailscale. */
export function tailscaleAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) if (!a.internal && isTailscaleIp(a.address)) out.push(a.address);
  return out.sort((a, b) => Number(a.includes(":")) - Number(b.includes(":")));
}

// ---------- Mật khẩu ----------

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await scrypt(pw, salt, 32)).toString("hex")}`;
}

export async function checkPassword(pw: string, stored: string | undefined): Promise<boolean> {
  const [kind, salt, hash] = (stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const got = await scrypt(pw, Buffer.from(salt, "hex"), 32);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export const hasMonitorPassword = () => Boolean(process.env[HASH_ENV]);

/** Đặt / đổi / xoá mật khẩu cổng từ xa — mọi thiết bị đang đăng nhập phải đăng nhập lại. */
export async function setMonitorPassword(pw: string | null): Promise<void> {
  if (pw !== null && pw.length < 6) throw new Error("Mật khẩu cần ít nhất 6 ký tự.");
  await setEnvLine(HASH_ENV, pw === null ? null : await hashPassword(pw));
  await dropAllSessions();
}

// ---------- Ảnh chụp tình trạng (cho trang theo dõi) ----------

async function diskFree(dir: string): Promise<{ path: string; free: number; total: number } | null> {
  try {
    const s = await fs.statfs(/*turbopackIgnore: true*/ dir);
    return { path: path.parse(dir).root || dir, free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

/** Link tải một file kết quả của MV đã xong (video, ảnh bìa, tiêu đề). */
const fileUrl = (i: { done_at?: string; mv_id?: string }, file?: string) =>
  i.done_at && i.mv_id && file && SAFE_ID.test(i.mv_id) ? `/_remote/file/${i.mv_id}/${encodeURIComponent(file)}` : null;

/** File được phép mở từ trang theo dõi: video đã dựng, ảnh bìa, tiêu đề + mô tả (đuôi file, kiểu, luôn tải về). */
const FILE_TYPES: [RegExp, string, boolean][] = [
  [/\.mp4$/i, "video/mp4", true],
  [/-cover\.jpg$/i, "image/jpeg", false],
  [/-youtube\.txt$/i, "text/plain; charset=utf-8", true],
];

export async function monitorSnapshot() {
  const settings = await readSettings();
  const [pipeline, muse, bank, drive, queue, channels] = await Promise.all([
    pipelineView(),
    museView(),
    bankView(),
    driveSyncStatus(),
    readQueue(),
    channelsView().catch(() => null),
  ]);
  const channelName = (id?: string) => pipeline.channels.find((c) => c.id === id)?.name ?? pipeline.channels[0]?.name ?? "";
  // Ổ chứa app và ổ chứa nhạc (cùng ổ thì chỉ một dòng).
  const disks: NonNullable<Awaited<ReturnType<typeof diskFree>>>[] = [];
  for (const d of await Promise.all([diskFree(process.cwd()), settings.songDir ? diskFree(settings.songDir) : null])) {
    if (d && !disks.some((x) => x.path === d.path)) disks.push(d);
  }
  const accounts = muse.gateway ? await museAccounts().catch(() => null) : null;
  const account = accounts?.active.name ?? null;
  // Tự đổi tài khoản / hết dự phòng trong 24 giờ qua → báo trên trang theo dõi.
  const failoverEvents = (accounts?.events ?? []).filter((ev) => ev.kind !== "reopen" && Date.now() - Date.parse(ev.at) < 24 * 3600e3);
  const running = queue.items.find((i) => i.status === "running");
  const runningTitle = running ? (pipeline.items.find((i) => i.mv_id === running.mv_id)?.title ?? running.mv_id) : "";
  return {
    at: new Date().toISOString(),
    machine: os.hostname(),
    upSince: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    mode: generationMode(settings),
    museMode: settings.museMode,
    disks,
    pipeline: {
      error: pipeline.error,
      items: pipeline.items.map((i) => ({
        id: i.id,
        title: i.title,
        channel: channelName(i.channel ?? i.idea?.channel),
        idea: i.idea?.id ?? null,
        added_at: i.added_at,
        done_at: i.done_at ?? null,
        steps: i.steps,
        // Chỉ đưa link tải khi file nằm đúng thư mục MV (tên file an toàn).
        video: fileUrl(i, i.output),
        cover: fileUrl(i, i.cover),
        info: fileUrl(i, i.info),
        yt_title: i.yt_title ?? null,
        result_dir: i.result_dir ?? null,
      })),
    },
    render: running ? { title: runningTitle, progress: queue.job?.progress ?? 0, stage: queue.job?.stage ?? "" } : null,
    muse: muse.gateway
      ? {
          account,
          failover: failoverEvents,
          loggedIn: muse.gateway.loggedIn,
          paused: muse.gateway.paused,
          limitHit: muse.gateway.limitHit,
          chromeClosed: muse.gateway.chromeClosed,
          counts: muse.gateway.counts,
          fake: muse.gateway.fake,
          error: muse.error,
        }
      : { haohao: true, error: muse.error },
    bank: {
      counts: bank.counts,
      proposals: bank.channels.reduce((n, c) => n + c.counts.proposed, 0),
      suggesting: bank.suggesting,
      error: bank.error,
    },
    drive: { running: drive.running, phase: drive.phase, error: drive.error, last: drive.last },
    // Kênh: số video (đã làm + đang làm), ý tưởng chưa dùng, bài mới còn lại cho kênh.
    channels: (channels?.channels ?? []).map((c) => ({
      name: c.name,
      active: c.active,
      videos: c.videos,
      inProgress: c.inProgress,
      ideas: bank.channels.find((x) => x.id === c.id)?.counts.new ?? 0,
      unused: c.unused,
      videosLeft: c.videosLeft,
    })),
    library: channels?.library ? { songs: channels.library.songs, levels: channels.library.levels, sheet: Boolean(channels.library.sheet), problems: channels.library.problems.length } : null,
  };
}

// ---------- Máy chủ ----------

const g = globalThis as unknown as {
  __mvMonitor?: { servers: Map<string, http.Server>; port: number; error: string | null };
};
const mem = (g.__mvMonitor ??= { servers: new Map(), port: 0, error: null });

/** Cổng của app chính (start.mjs truyền MVS_APP_PORT; chạy kiểu khác thì PORT hoặc 3100). */
const appPort = () => Number(process.env.MVS_APP_PORT) || Number(process.env.PORT) || 3100;
const LOGIN = "/_remote/login";
const HTML = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
const TEXT = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

/** Thân yêu cầu nhỏ (form đăng nhập); quá `max` byte thì bỏ. */
function readSmallBody(req: http.IncomingMessage, max = 8192): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(new Error("quá dài"));
        req.destroy();
      } else parts.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
}

/** Trang đăng nhập (GET) và kiểm tra mật khẩu (POST): đúng → cookie phiên 30 ngày; sai nhiều lần → khoá 15 phút. */
async function login(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (req.method === "GET" || req.method === "HEAD") {
    res.writeHead(200, HTML).end(loginPage(safeNext(url.searchParams.get("next"), "/pipeline")));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, TEXT).end();
    return;
  }
  const ip = clientIp(req);
  const form = new URLSearchParams(await readSmallBody(req));
  const next = safeNext(form.get("next"), "/pipeline");
  const locked = loginLockedFor(ip);
  if (locked) {
    res.writeHead(429, HTML).end(loginPage(next, `Sai mật khẩu nhiều lần — thử lại sau ${Math.ceil(locked / 60000)} phút.`));
    return;
  }
  if (!(await checkPassword(form.get("password") ?? "", process.env[HASH_ENV]))) {
    noteLoginFail(ip);
    await new Promise((r) => setTimeout(r, 600)); // chậm lại khi đoán mật khẩu
    res.writeHead(401, HTML).end(loginPage(next, "Sai mật khẩu."));
    return;
  }
  clearLoginFails(ip);
  const token = await createSession(req);
  // Chưa cho điều khiển → vào trang theo dõi.
  const to = (await readSettings()).remoteControl ? next : "/_remote/";
  res.writeHead(303, { Location: to, "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" }).end();
}

/** Tải một file kết quả của MV đã xong (video, ảnh bìa, tiêu đề) — có ở cả chế độ chỉ xem. */
async function serveFile(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const [, , , mvId, file] = url.pathname.split("/");
  const name = decodeURIComponent(file ?? "");
  const kind = FILE_TYPES.find(([re]) => re.test(name));
  if (!SAFE_ID.test(mvId ?? "") || !kind) throw new Error("không có");
  const p = mediaPath(mvId, name);
  const st = await fs.stat(p);
  res.writeHead(200, {
    "Content-Type": kind[1],
    "Content-Length": st.size,
    "Content-Disposition": `${kind[2] || url.searchParams.has("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
  if (req.method === "HEAD") res.end();
  else createReadStream(p).pipe(res);
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  if (!okHost(req.headers.host, isTailscaleIp)) {
    res.writeHead(421, TEXT).end("Sai địa chỉ.");
    return;
  }
  const url = new URL(req.url ?? "/", "http://x");
  const write = req.method !== "GET" && req.method !== "HEAD";
  // Yêu cầu đổi dữ liệu chỉ nhận từ chính trang của cổng: trang web khác không gửi lệnh thay bạn được.
  if (write && !sameOrigin(req)) {
    res.writeHead(403, TEXT).end("Bị chặn: yêu cầu không gửi từ trang của app.");
    return;
  }
  try {
    if (url.pathname === LOGIN) return await login(req, res, url);
    if (!(await findSession(req))) {
      if (!write && !/^\/(api|_next|_remote\/api)\//.test(url.pathname)) {
        const next = url.pathname === "/" ? "/pipeline" : url.pathname + url.search;
        res.writeHead(303, { Location: `${LOGIN}?next=${encodeURIComponent(next)}`, "Cache-Control": "no-store" }).end();
      } else {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: "Phiên đăng nhập từ xa đã hết — tải lại trang để đăng nhập lại." }));
      }
      return;
    }
    if (url.pathname === "/_remote/logout") {
      await dropSession(req);
      res.writeHead(303, { Location: LOGIN, "Set-Cookie": sessionCookie(null), "Cache-Control": "no-store" }).end();
      return;
    }
    const s = await readSettings();
    if (url.pathname === "/_remote" || url.pathname === "/_remote/") {
      res.writeHead(200, HTML).end(monitorPage(s.remoteControl));
    } else if (url.pathname === "/_remote/api/status") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(await monitorSnapshot()));
    } else if (url.pathname.startsWith("/_remote/file/")) {
      await serveFile(req, res, url);
    } else if (url.pathname.startsWith("/_remote/")) {
      res.writeHead(404, TEXT).end("Không có.");
    } else if (!s.remoteControl) {
      if (url.pathname === "/") res.writeHead(303, { Location: "/_remote/" }).end();
      else
        res
          .writeHead(403, HTML)
          .end(messagePage("Điều khiển từ xa đang tắt", "Cổng này hiện chỉ cho xem tiến độ. Muốn điều khiển app từ xa: ở máy chạy, vào Cài đặt → Điều khiển từ xa → tick “Cho phép điều khiển app”."));
    } else {
      proxyToApp(req, res, appPort());
    }
  } catch {
    if (!res.headersSent) res.writeHead(404, TEXT).end("Không có.");
  }
}

async function stopAll() {
  await Promise.all([...mem.servers.values()].map((s) => new Promise<void>((r) => s.close(() => r()))));
  mem.servers.clear();
}

/**
 * Mở / đóng / mở lại cổng theo dõi cho khớp cài đặt và địa chỉ Tailscale hiện có (gọi định kỳ: Tailscale có thể bật sau app).
 * `hosts` chỉ dùng cho test (vd. ["127.0.0.1"]).
 */
export async function syncMonitor(hosts?: string[]): Promise<void> {
  const s = await readSettings();
  // MVS_MONITOR_LOOPBACK=1: mở trên 127.0.0.1 để thử trên chính máy này (chỉ máy này vào được).
  const want = s.monitorEnabled && hasMonitorPassword() ? (hosts ?? (process.env.MVS_MONITOR_LOOPBACK ? ["127.0.0.1"] : tailscaleAddresses())) : [];
  const same = mem.port === s.monitorPort && want.length === mem.servers.size && want.every((h) => mem.servers.has(h));
  if (same) return;
  await stopAll();
  mem.port = s.monitorPort;
  mem.error = null;
  for (const host of want) {
    const server = http.createServer((req, res) => void handle(req, res));
    // Tải video lớn về / tải nhạc lên qua mạng chậm có thể lâu hơn 5 phút (mặc định của Node).
    server.requestTimeout = 0;
    server.headersTimeout = 60e3;
    await new Promise<void>((resolve) => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        mem.error = err.code === "EADDRINUSE" ? `Cổng ${s.monitorPort} đang bị chương trình khác dùng — đổi cổng khác.` : err.message;
        resolve();
      });
      server.listen(s.monitorPort, host, () => {
        mem.servers.set(host, server);
        resolve();
      });
    });
  }
}

export async function stopMonitor(): Promise<void> {
  await stopAll();
  mem.port = 0;
}

export async function monitorStatus() {
  const s = await readSettings();
  const addresses = tailscaleAddresses();
  const listening = [...mem.servers.keys()];
  const url = (h: string) => `http://${h.includes(":") ? `[${h}]` : h}:${s.monitorPort}`;
  return {
    enabled: s.monitorEnabled,
    port: s.monitorPort,
    /** Cho điều khiển cả app (không chỉ xem). */
    control: s.remoteControl,
    hasPassword: hasMonitorPassword(),
    /** Số thiết bị đang đăng nhập (phiên còn hạn). */
    sessions: await sessionCount(),
    addresses,
    machine: os.hostname().toLowerCase(),
    listening,
    urls: listening.map(url),
    error: mem.error,
  };
}

/** Đăng xuất mọi thiết bị đang mở cổng từ xa. */
export const logoutAllRemote = () => dropAllSessions();
