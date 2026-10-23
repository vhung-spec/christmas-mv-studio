#!/usr/bin/env node
// Khởi động Christmas MV Studio bằng một lệnh: cài thư viện (nếu cần) → build (nếu mã nguồn đổi) → chạy → mở trình duyệt.
// Được gọi từ "Chay-Christmas-MV-Studio.bat" (Windows) và "Chay-Christmas-MV-Studio.command" (macOS / Linux).
// Cổng mặc định 3100 (app cũ MV Prompt Studio dùng 3000) để hai app chạy song song trên cùng máy.
// Tự cập nhật: app tải bản mới về rồi tự tắt với mã 75 → trình khởi động cài bản mới (scripts/cap-nhat.mjs), build, chạy lại;
// build lỗi hoặc app không chạy được thì quay về bản cũ và chạy bản cũ.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ID, PENDING, RESTART_CODE, RESULT, VERSION_FILE, applyUpdate, listFiles, pruneOld, readJsonSafe, rollbackUpdate, sha256, updateDir } from "./cap-nhat.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";
const HOST = "127.0.0.1";

function log(msg) {
  console.log(`\x1b[36m▶\x1b[0m ${msg}`);
}

function fail(msg) {
  console.error(`\n\x1b[31m✖ ${msg}\x1b[0m\n`);
  process.exit(1);
}

/** Chạy lệnh, trả về đúng / sai (không thoát). */
function run(cmd, args, label) {
  log(label);
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: isWin });
  if (res.status !== 0) console.error(`\x1b[31m✖ ${label} thất bại (mã lỗi ${res.status}). Xem thông báo phía trên.\x1b[0m`);
  return res.status === 0;
}

/** Thời điểm sửa mới nhất của mã nguồn app (để biết có cần build lại không). */
const SOURCES = ["src", "package.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json"];
function newestMtime(p) {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(p).reduce((m, name) => Math.max(m, newestMtime(path.join(p, name))), st.mtimeMs);
}

function freePort(start) {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      const srv = net.createServer();
      srv.once("error", () => tryPort(port + 1));
      srv.once("listening", () => srv.close(() => resolve(port)));
      srv.listen(port, HOST);
    };
    tryPort(start);
  });
}

function openBrowser(url) {
  const cmd = isWin ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = isWin ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // không mở được trình duyệt tự động — người dùng tự mở địa chỉ in ra bên dưới
  }
}

async function waitFor(url, ms, alive = () => true) {
  const until = Date.now() + ms;
  while (Date.now() < until && alive()) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // server chưa sẵn sàng
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Cài thư viện lần đầu / khi package-lock đổi nội dung (so mã băm — bản cập nhật chép lại file cũng không cài lại vô ích). */
function installDeps() {
  const lock = path.join(ROOT, "package-lock.json");
  const installed = path.join(ROOT, "node_modules", ".package-lock.json");
  const mark = path.join(ROOT, "node_modules", ".mvs-lock-sha");
  const want = sha256(readFileSync(lock));
  const have = existsSync(mark) ? readFileSync(mark, "utf8").trim() : "";
  const need = !existsSync(installed) || (have ? have !== want : statSync(lock).mtimeMs > statSync(installed).mtimeMs);
  if (need && !run(npm, ["install", "--no-audit", "--no-fund"], "Đang cài thư viện (lần đầu mất vài phút)…")) return false;
  writeFileSync(mark, want);
  return true;
}

/** Build khi chưa có, khi mã nguồn đã thay đổi, hoặc bắt buộc (vừa cài bản mới / vừa quay về bản cũ). */
function build(force) {
  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  if (!force && existsSync(buildId) && Math.max(...SOURCES.map((f) => newestMtime(path.join(ROOT, f)))) <= statSync(buildId).mtimeMs) return true;
  return run(npm, ["run", "build"], "Đang chuẩn bị app (build)…");
}

// ---------- Tự cập nhật ----------

const UPD = updateDir(ROOT);
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const writeResult = (r) => writeFileSync(path.join(UPD, RESULT), JSON.stringify({ at: new Date().toISOString(), ...r }, null, 2));

/** App đã tải bản mới và xin cài (cho-cai.json) → chép bản mới vào thư mục app. Trả về lần cài (để quay lại nếu lỗi) hoặc null. */
function applyPending() {
  const marker = path.join(UPD, PENDING);
  const p = readJsonSafe(marker, null);
  if (!p) return null;
  // Bỏ dấu "chờ cài" trước (lỡ cài lỗi mà máy tắt thì lần mở sau không cài lại mãi); giữ lại bản ghi.
  renameSync(marker, `${marker}.da-nhan`);
  const sha = String(p.sha ?? "");
  const pkg = readJsonSafe(path.join(String(p.dir ?? ""), "package.json"), null);
  if (!pkg || pkg.name !== APP_ID) {
    writeResult({ ok: false, sha, error: "Bản tải về không phải Christmas MV Studio (thiếu package.json)." });
    return null;
  }
  const current = readJsonSafe(path.join(ROOT, VERSION_FILE), {});
  const backup = path.join(UPD, `cu-${String(current.commit || "chua-ro").slice(0, 7)}-${stamp()}`);
  log(`Đang cài bản mới ${sha.slice(0, 7)}${p.message ? ` — ${String(p.message).split("\n")[0]}` : ""}…`);
  try {
    applyUpdate(ROOT, p.dir, backup);
  } catch (e) {
    let back = "";
    try {
      rollbackUpdate(ROOT, backup);
    } catch (e2) {
      back = ` Quay về bản cũ cũng lỗi: ${e2.message}.`;
    }
    writeResult({ ok: false, sha, error: `Chép file bản mới lỗi: ${e.message}.${back}`, rolledBack: !back });
    return null;
  }
  return { ...p, sha, backup, previous: current };
}

/** Cài lỗi → về bản cũ (file cũ từ thư mục dự phòng), ghi kết quả để app báo. */
function rollback(upd, error) {
  console.error(`\x1b[31m✖ Bản mới ${upd.sha.slice(0, 7)} lỗi: ${error}. Đang quay về bản cũ…\x1b[0m`);
  try {
    rollbackUpdate(ROOT, upd.backup);
    writeResult({ ok: false, sha: upd.sha, error, rolledBack: true });
  } catch (e) {
    writeResult({ ok: false, sha: upd.sha, error: `${error}. Quay về bản cũ lỗi: ${e.message}`, rolledBack: false });
  }
}

/** Cài xong, app chạy được → ghi bản đang cài; dọn bớt dự phòng / bản tải về cũ (vào Thùng rác). */
function finish(upd) {
  writeFileSync(
    path.join(ROOT, VERSION_FILE),
    JSON.stringify({ app: APP_ID, commit: upd.sha, date: upd.date ?? "", branch: upd.branch ?? "", source: upd.source ?? "", installed_at: new Date().toISOString(), files: listFiles(upd.dir) }, null, 2),
  );
  writeResult({ ok: true, sha: upd.sha, from: upd.previous?.commit ?? "" });
  try {
    pruneOld(UPD, [upd.backup, upd.dir]);
  } catch {
    // dọn không được thì để lần sau
  }
  console.log(`\x1b[32m✔ Đã cài bản mới ${upd.sha.slice(0, 7)}.\x1b[0m`);
}

// 1. Kiểm tra Node.js
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  fail(`Cần Node.js 20.9 trở lên (máy đang có ${process.versions.node}). Tải bản LTS tại https://nodejs.org rồi chạy lại.`);
}

console.log("\n\x1b[1m🎄  Christmas MV Studio\x1b[0m\n");

const port = await freePort(Number(process.env.PORT) || 3100);
const url = `http://${HOST}:${port}`;
const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
let first = true;
let forceBuild = false;

for (;;) {
  // 2. Bản mới đang chờ cài (app vừa tự tắt để cài, hoặc đã tải về từ trước).
  const upd = applyPending();
  // 3. Cài thư viện (lần đầu / package-lock đổi) và build (chưa có / mã nguồn đổi / vừa cài bản mới).
  if (!installDeps() || !build(forceBuild || Boolean(upd))) {
    if (upd) {
      rollback(upd, "cài thư viện / build bản mới lỗi");
      forceBuild = true;
      continue;
    }
    fail("Không chuẩn bị được app — xem thông báo phía trên.");
  }
  forceBuild = false;

  // 4. Chạy (Muse chạy ngay trong app — không còn cổng riêng). MVS_SUPERVISOR: app biết có thể tự tắt để cài bản mới.
  log(`Đang khởi động tại ${url} …`);
  const server = spawn(process.execPath, [nextBin, "start", "-H", HOST, "-p", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, MVS_APP_PORT: String(port), MVS_SUPERVISOR: "2" },
  });
  let exited = false;
  const done = new Promise((resolve) => server.on("exit", (code) => ((exited = true), resolve(code))));
  const stop = (sig) => server.kill(sig);
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const ready = await waitFor(`${url}/api/status`, upd ? 180000 : 60000, () => !exited);
  if (upd) {
    if (!ready) {
      if (!exited) server.kill();
      await done;
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      rollback(upd, "app bản mới không chạy được");
      forceBuild = true;
      continue;
    }
    finish(upd);
  }
  if (first) {
    if (ready) {
      console.log(`\n\x1b[32m✔ Đã sẵn sàng: ${url}\x1b[0m`);
      console.log("  Giữ cửa sổ này mở trong khi dùng app. Đóng cửa sổ (hoặc nhấn Ctrl+C) để tắt.\n");
      if (!process.env.NO_BROWSER) openBrowser(url);
    } else {
      console.log(`\nApp chưa phản hồi — hãy thử mở ${url} trong trình duyệt.`);
    }
    first = false;
  }

  const code = await done;
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  // App tự tắt để cài bản mới → vòng lại: cài, build, chạy lại.
  if (code === RESTART_CODE && existsSync(path.join(UPD, PENDING))) continue;
  process.exit(code ?? 0);
}
