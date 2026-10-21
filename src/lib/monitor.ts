// THEO DÕI TỪ MÁY KHÁC — trang CHỈ XEM (không điều khiển được gì) để máy chính của bạn xem tiến độ của máy chạy app.
// App chính vẫn chỉ mở ở 127.0.0.1. Trang theo dõi là một cổng riêng CHỈ mở trên địa chỉ Tailscale của máy này (100.x.y.z):
// máy cùng wifi hay người ngoài không vào được, chỉ các máy đăng nhập cùng tài khoản Tailscale của bạn. Vào trang phải có
// mật khẩu (bạn tự đặt trong app; lưu dạng băm trong .env.local, không commit). Chỉ dùng phía server.

import { createReadStream, promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { setEnvLine } from "./apikey";
import { driveSyncStatus } from "./driveSync";
import { generationMode } from "./generate";
import { bankView } from "./ideaBank";
import { mediaPath } from "./media";
import { monitorPage } from "./monitorPage";
import { museAccounts } from "./museEngine/accounts";
import { museView } from "./museJobs";
import { pipelineView } from "./pipeline";
import { readQueue } from "./queue";
import { usedSongsView } from "./songsUsed";
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

export async function setMonitorPassword(pw: string | null): Promise<void> {
  if (pw !== null && pw.length < 6) throw new Error("Mật khẩu cần ít nhất 6 ký tự.");
  await setEnvLine(HASH_ENV, pw === null ? null : await hashPassword(pw));
  mem.okAuth.clear();
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
  i.done_at && i.mv_id && file && SAFE_ID.test(i.mv_id) ? `/file/${i.mv_id}/${encodeURIComponent(file)}` : null;

/** File được phép mở từ trang theo dõi: video đã dựng, ảnh bìa, tiêu đề + mô tả (đuôi file, kiểu, luôn tải về). */
const FILE_TYPES: [RegExp, string, boolean][] = [
  [/\.mp4$/i, "video/mp4", true],
  [/-cover\.jpg$/i, "image/jpeg", false],
  [/-youtube\.txt$/i, "text/plain; charset=utf-8", true],
];

export async function monitorSnapshot() {
  const settings = await readSettings();
  const [pipeline, muse, bank, drive, queue, used] = await Promise.all([
    pipelineView(),
    museView(),
    bankView(),
    driveSyncStatus(),
    readQueue(),
    usedSongsView(settings.songDir).catch(() => ({ rows: [], duplicates: [] })),
  ]);
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
    bank: { counts: bank.counts, ready: bank.ready, proposals: bank.proposals.length, suggesting: bank.suggesting, error: bank.error },
    drive: { running: drive.running, phase: drive.phase, error: drive.error, last: drive.last },
    // Bài app đã ghép vào MV mà trên Drive chưa ghi "đã dùng" (để bạn ghi cho khớp); MV đang dùng trùng một bài.
    songs: {
      toMark: used.rows.filter((x) => !x.marked).map((x) => ({ file: x.file, title: x.mvs.map((m) => m.title).join(" · ") })),
      marked: used.rows.filter((x) => x.marked).length,
      duplicates: used.duplicates.map((d) => ({ file: d.file, titles: d.mvs.map((m) => m.title) })),
    },
  };
}

// ---------- Máy chủ ----------

const g = globalThis as unknown as {
  __mvMonitor?: { servers: Map<string, http.Server>; port: number; error: string | null; okAuth: Map<string, number> };
};
const mem = (g.__mvMonitor ??= { servers: new Map(), port: 0, error: null, okAuth: new Map() });

const AUTH_CACHE_MS = 10 * 60 * 1000;

async function authorized(req: http.IncomingMessage): Promise<boolean> {
  const header = req.headers.authorization ?? "";
  const cached = mem.okAuth.get(header);
  if (cached && Date.now() - cached < AUTH_CACHE_MS) return true;
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const pw = decoded.slice(decoded.indexOf(":") + 1);
  if (!(await checkPassword(pw, process.env[HASH_ENV]))) return false;
  mem.okAuth.set(header, Date.now());
  return true;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  if (!(await authorized(req))) {
    await new Promise((r) => setTimeout(r, 600)); // chậm lại khi đoán mật khẩu
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="MV Prompt Studio - theo doi", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" });
    res.end("Cần mật khẩu trang theo dõi (đặt trong app ở máy chạy: Cài đặt → Theo dõi từ máy khác).");
    return;
  }
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(monitorPage());
    } else if (url.pathname === "/api/status") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(await monitorSnapshot()));
    } else if (url.pathname.startsWith("/file/")) {
      const [, , mvId, file] = url.pathname.split("/");
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
    } else {
      res.writeHead(404).end();
    }
  } catch {
    if (!res.headersSent) res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Không có.");
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
  const want = s.monitorEnabled && hasMonitorPassword() ? (hosts ?? tailscaleAddresses()) : [];
  const same = mem.port === s.monitorPort && want.length === mem.servers.size && want.every((h) => mem.servers.has(h));
  if (same) return;
  await stopAll();
  mem.port = s.monitorPort;
  mem.error = null;
  for (const host of want) {
    const server = http.createServer((req, res) => void handle(req, res));
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
    hasPassword: hasMonitorPassword(),
    addresses,
    machine: os.hostname().toLowerCase(),
    listening,
    urls: listening.map(url),
    error: mem.error,
  };
}
