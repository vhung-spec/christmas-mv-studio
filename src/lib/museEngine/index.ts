// MUSE TRONG APP — Chrome + hàng đợi + Worker chạy ngay trong server của app (trước đây là Cổng Muse riêng ở 127.0.0.1:18700).
// Một bản duy nhất cho cả tiến trình (giữ qua hot reload khi phát triển). Chỉ dùng phía server.
// Tắt app → Chrome của Muse tự tắt theo; mở lại app → task đang làm dở được dò tiếp (không gửi lại).

import { readFileSync } from "node:fs";
import path from "node:path";
import { Chrome } from "./chrome";
import { FakeMuse } from "./fake";
import { MusePage, type MuseDriver } from "./page";
import { Worker, type WorkerOptions, type WorkerState } from "./runner";
import { TaskStore, type GatewayTask } from "./tasks";

export interface MuseEngine {
  dir: string;
  store: TaskStore;
  worker: Worker;
  page: MuseDriver;
  fake: boolean;
}

/**
 * Thư mục dữ liệu (profile Chrome có phiên đăng nhập Muse, hàng đợi, video tải về): NGOÀI thư mục app, ngay bên cạnh, cùng ổ đĩa
 * (vd. D:\bokin-rockroll-muse-gateway). Lúc build, Next.js đọc file trong thư mục app và sẽ vấp vào profile Chrome đang mở.
 */
export function museDataDir(): string {
  if (process.env.MUSE_ENGINE_DIR) return path.resolve(/*turbopackIgnore: true*/ process.env.MUSE_ENGINE_DIR);
  const root = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  return path.join(/*turbopackIgnore: true*/ path.dirname(root), `${path.basename(root)}-muse-gateway`);
}

/**
 * Hồ sơ Chrome của tài khoản Muse đang dùng (accounts.json: mỗi tài khoản một thư mục cố định — đổi tài khoản chỉ đổi thư mục
 * Chrome mở, không đổi tên thư mục nào). Chưa có danh sách → "chrome-profile".
 */
export function activeProfileDir(dir: string): string {
  try {
    const data = JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ dir, "accounts.json"), "utf8")) as { active?: string; accounts?: { id: string; folder?: string }[] };
    const folder = data.accounts?.find((a) => a.id === data.active)?.folder;
    if (folder && /^[\w.-]+$/.test(folder)) return path.join(/*turbopackIgnore: true*/ dir, folder);
  } catch {
    // chưa có danh sách tài khoản
  }
  return path.join(/*turbopackIgnore: true*/ dir, "chrome-profile");
}

type EngineOptions = { dir?: string; page?: MuseDriver; worker?: Partial<Omit<WorkerOptions, "store" | "page" | "outputDir">> };
const g = globalThis as unknown as { __mvMuseEngine?: MuseEngine; __mvMuseEngineOpts?: EngineOptions };

/** Tạo (lại) bộ máy Muse. Test truyền Muse giả + thư mục tạm; MUSE_FAKE=1 dùng Muse giả để xem thử (không mở Chrome, không tốn lượt). */
export function initMuseEngine(opts: EngineOptions = {}): MuseEngine {
  g.__mvMuseEngineOpts = opts;
  const dir = opts.dir ?? museDataDir();
  const fake = !opts.page && Boolean(process.env.MUSE_FAKE);
  const page = opts.page ?? (fake ? new FakeMuse() : new MusePage(new Chrome({ profileDir: activeProfileDir(dir), url: "https://muse.ai" })));
  const store = new TaskStore(dir);
  const worker = new Worker({ store, page, outputDir: path.join(/*turbopackIgnore: true*/ dir, "videos"), ...(fake ? { gapMs: 1000, pollMs: 1000 } : {}), ...opts.worker });
  g.__mvMuseEngine = { dir, store, worker, page, fake };
  // Có task dở từ lần chạy trước → chạy tiếp.
  if (store.list().some((t) => t.status === "queued" || t.status === "processing")) worker.pump();
  return g.__mvMuseEngine;
}

export function museEngine(): MuseEngine {
  return g.__mvMuseEngine ?? initMuseEngine();
}

/**
 * Tắt bộ máy (dừng nhận việc, đóng Chrome, ghi hàng đợi), chạy `between` lúc Chrome đã tắt (vd. đổi hồ sơ đăng nhập), rồi mở lại
 * với cùng thiết lập. `between` lỗi thì vẫn mở lại (với hồ sơ đang có) rồi báo lỗi.
 */
export async function restartMuseEngine(between: (dir: string) => Promise<void>): Promise<MuseEngine> {
  const e = museEngine();
  const opts = g.__mvMuseEngineOpts ?? {};
  await e.worker.stop();
  g.__mvMuseEngine = undefined;
  await e.worker.close();
  try {
    await between(e.dir);
  } finally {
    initMuseEngine(opts);
  }
  return museEngine();
}

/** Tắt bộ máy (đóng Chrome, ghi hàng đợi) — dùng khi test. */
export async function closeMuseEngine(): Promise<void> {
  const e = g.__mvMuseEngine;
  g.__mvMuseEngine = undefined;
  await e?.worker.close();
}

export interface EngineStatus extends WorkerState {
  /** Đang chạy Muse giả (MUSE_FAKE=1). */
  fake: boolean;
  dir: string;
  counts: Record<GatewayTask["status"], number>;
}

export function engineStatus(e: MuseEngine = museEngine()): EngineStatus {
  const counts = { queued: 0, processing: 0, succeeded: 0, failed: 0, cancelled: 0 };
  for (const t of e.store.list()) counts[t.status]++;
  return { ...e.worker.state, fake: e.fake, dir: e.dir, counts };
}
