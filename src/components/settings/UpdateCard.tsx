"use client";

// Thẻ "Cập nhật app" (trang Cài đặt): bản đang chạy, tự kiểm tra bản mới trên GitHub (repo riêng tư, token chỉ-đọc), tải về và tự cài
// khi app rảnh (app tắt vài phút rồi tự mở lại; lỗi thì quay về bản cũ), hoặc tải gói .zip lên để cài.

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/client";

interface UpdateStatus {
  enabled: boolean;
  current: { commit: string; date: string; source: string; branch: string };
  repo: string;
  branch: string;
  autoUpdate: boolean;
  hasToken: boolean;
  supervisor: boolean;
  busy: "checking" | "downloading" | "installing" | null;
  error: string | null;
  lastCheck: { at: string; ok: boolean; upToDate?: boolean; error?: string } | null;
  latest: { sha: string; date: string; message: string; changes: string[]; newer: boolean } | null;
  ready: { sha: string; date: string; message: string; source: string; at: string } | null;
  wanted: boolean;
  waitingFor: string | null;
  bad: string[];
  lastResult: { at: string; ok: boolean; sha: string; error?: string; rolledBack?: boolean } | null;
  dir: string;
  installedAt: string | null;
  install?: { started: boolean; reason?: string };
}

const short = (sha: string) => (sha ? sha.slice(0, 7) : "—");
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN") : "");
const SOURCE: Record<string, string> = { github: "GitHub", goi: "gói cài / gói tải lên", git: "kho git (máy phát triển)", "": "gói cài" };

export default function UpdateCard() {
  const [st, setSt] = useState<UpdateStatus | null>(null);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [tok, setTok] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      api<UpdateStatus>("/api/update").then(
        (s) => {
          setSt(s);
          setRepo((r) => r || s.repo);
          setBranch((b) => b || s.branch);
        },
        (e) => setError((e as Error).message),
      ),
    [],
  );
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  // App tắt để cài → chờ app chạy lại rồi tải lại trang.
  useEffect(() => {
    if (!restarting) return;
    let stop = false;
    void (async () => {
      await new Promise((r) => setTimeout(r, 8000));
      while (!stop) {
        try {
          if ((await fetch("/api/status", { cache: "no-store" })).ok) {
            location.reload();
            return;
          }
        } catch {
          // app đang cài / build
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    })();
    return () => {
      stop = true;
    };
  }, [restarting]);

  function after(s: UpdateStatus, done?: string) {
    setSt(s);
    if (s.install?.started) {
      setRestarting(true);
      setNotice("App đang tắt để cài bản mới — trang tự tải lại khi app chạy lại (vài phút).");
    } else if (s.install?.reason) setNotice(`Sẽ cài khi app rảnh (hiện ${s.install.reason}).`);
    else if (done) setNotice(done);
  }

  async function post(json: Record<string, unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      after(await api<UpdateStatus>("/api/update", { method: "POST", json }), done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (!confirm(`Cài gói “${file.name}”? App sẽ tắt vài phút để cài (khi rảnh) rồi tự mở lại; cài lỗi thì quay về bản cũ.`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      after(await api<UpdateStatus>("/api/update", { method: "POST", body: file, headers: { "Content-Type": "application/zip", "X-File-Name": encodeURIComponent(file.name) } }), "Đã nhận gói.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const title = "Cập nhật app";
  if (!st) {
    return (
      <Card title={title} className="lg:col-span-2">
        {error ? <ErrorBox error={error} /> : <Spinner />}
      </Card>
    );
  }
  const r = st.lastResult;
  return (
    <Card title={title} className="lg:col-span-2">
      <div className="space-y-3 text-sm">
        <p>
          <b>Bản đang chạy:</b> <code>{short(st.current.commit)}</code>
          {st.current.date && ` (${when(st.current.date)})`} · {SOURCE[st.current.source] ?? st.current.source}
          {st.installedAt && st.current.source !== "git" && <span className="text-muted"> · cài lúc {when(st.installedAt)}</span>}
        </p>
        {!st.enabled ? (
          <p className="text-xs text-muted">
            Đây là bản mã nguồn trên máy phát triển (thư mục app là kho git): không tự cập nhật — cập nhật bằng git. Máy chạy cài từ gói thì tự cập nhật từ GitHub.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted">
              App tự hỏi GitHub mỗi giờ; có bản mới thì tải về và <b>tự cài khi app rảnh</b> (không dựng video, không viết kịch bản, không gửi cảnh Muse): app tắt
              vài phút, cài, build rồi tự mở lại — việc đang dở chạy tiếp. Cài lỗi thì tự quay về bản cũ. Dữ liệu của bạn (cài đặt, kênh, kho ý tưởng, nhạc,
              video, đăng nhập Muse) giữ nguyên. Bản cũ để ở <code className="break-all">{st.dir}</code>.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                Repo
                <input className="input w-64 max-w-full" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="chủ/tên-repo" />
              </label>
              <label className="flex items-center gap-2">
                Nhánh
                <input className="input w-32" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </label>
              {(repo !== st.repo || branch !== st.branch) && (
                <button className="btn-ghost btn-sm" disabled={busy} onClick={() => void post({ action: "config", repo, branch }, "Đã lưu repo / nhánh.")}>
                  Lưu
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span>
                <b>Token GitHub (chỉ đọc):</b> {st.hasToken ? <span className="text-mint-dark">đã lưu</span> : <span className="text-cherry-dark">chưa có</span>}
              </span>
              <input
                className="input w-full max-w-72"
                type="password"
                autoComplete="off"
                placeholder={st.hasToken ? "Token mới (để đổi)" : "github_pat_…"}
                value={tok}
                onChange={(e) => setTok(e.target.value)}
              />
              <button className="btn-ghost btn-sm" disabled={busy || tok.trim().length < 20} onClick={() => void post({ action: "token", token: tok }, "Đã lưu token trên máy này.").then(() => setTok(""))}>
                Lưu token
              </button>
              {st.hasToken && (
                <button className="btn-ghost btn-sm" disabled={busy} onClick={() => confirm("Xoá token GitHub khỏi máy này? App sẽ không tự cập nhật được.") && void post({ action: "token", token: null }, "Đã xoá token.")}>
                  Xoá token
                </button>
              )}
            </div>
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Tạo token chỉ-đọc thế nào?</summary>
              <ol className="ml-4 mt-1 list-decimal space-y-0.5">
                <li>Đăng nhập github.com → ảnh đại diện → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li>
                <li>Đặt tên (vd. “May chay Christmas”), Expiration tuỳ bạn (vd. 1 năm). Repository access: Only select repositories → chọn repo {st.repo || "của app"}.</li>
                <li>Permissions → Repository permissions → Contents: Read-only (chỉ đọc). Không cần quyền nào khác.</li>
                <li>Generate token → copy → dán vào ô trên → Lưu token. Token chỉ lưu trong .env.local của máy này.</li>
              </ol>
            </details>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={st.autoUpdate} disabled={busy} onChange={(e) => void post({ action: "config", auto: e.target.checked })} />
                Tự kiểm tra mỗi giờ và tự cài khi app rảnh
              </label>
              <button className="btn-ghost btn-sm" disabled={busy || Boolean(st.busy)} onClick={() => void post({ action: "check" })}>
                {(busy || st.busy === "checking" || st.busy === "downloading") && <Spinner />} Kiểm tra ngay
              </button>
              <span className="text-xs text-muted">
                {st.busy === "checking" ? "Đang hỏi GitHub…" : st.busy === "downloading" ? "Đang tải bản mới…" : st.busy === "installing" ? "Đang tắt app để cài…" : ""}
              </span>
            </div>
            {!st.supervisor && (
              <p className="text-xs font-semibold text-amber-800">App đang không chạy bằng Chay-Christmas-MV-Studio.bat nên không tự tắt để cài được — mở app bằng file đó.</p>
            )}
            {st.lastCheck && (
              <p className={`text-xs ${st.lastCheck.ok ? "text-muted" : "text-cherry-dark"}`}>
                Kiểm tra lúc {when(st.lastCheck.at)}: {st.lastCheck.ok ? (st.lastCheck.upToDate ? "đang dùng bản mới nhất ✓" : "có bản mới") : st.lastCheck.error}
              </p>
            )}
            {st.latest?.newer && (
              <div className="rounded-lg border border-sky-400 bg-sky-50 p-2">
                <p>
                  <b>Bản mới trên GitHub:</b> <code>{short(st.latest.sha)}</code> ({when(st.latest.date)}){st.bad.includes(st.latest.sha) && <span className="text-cherry-dark"> — bản này cài lỗi lần trước, không tự cài lại</span>}
                </p>
                {st.latest.changes.length > 0 && (
                  <ul className="ml-4 mt-1 list-disc text-xs">
                    {st.latest.changes.slice(0, 10).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {st.ready && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-mint-dark/60 bg-mint/20 p-2">
                <span>
                  ⬇ Đã tải bản <code>{short(st.ready.sha)}</code> ({st.ready.message}) —{" "}
                  {st.waitingFor ? `chờ app rảnh (hiện ${st.waitingFor})` : st.autoUpdate || st.wanted ? "sắp cài" : "chưa cài (đang tắt tự cập nhật)"}.
                </span>
                <button
                  className="btn-primary btn-sm"
                  disabled={busy || restarting}
                  onClick={() => confirm("Cài bản mới? App sẽ tắt vài phút (khi rảnh) để cài rồi tự mở lại; cài lỗi thì quay về bản cũ.") && void post({ action: "install" })}
                >
                  Cài ngay
                </button>
              </div>
            )}
            {r && (
              <p className={`text-xs ${r.ok ? "text-mint-dark" : "text-cherry-dark"}`}>
                {r.ok
                  ? `✓ Đã cài bản ${short(r.sha)} lúc ${when(r.at)}.`
                  : `✗ Cài bản ${short(r.sha)} lúc ${when(r.at)} lỗi: ${r.error ?? ""}${r.rolledBack ? " — đã quay về bản cũ." : ""}`}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">Dự phòng: tải gói .zip lên để cài (gói Dong-goi-cap-nhat.bat, hoặc file zip tải từ GitHub):</span>
              <input ref={fileRef} type="file" accept=".zip" disabled={busy} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            </div>
          </>
        )}
        {notice && <p className="text-xs font-semibold text-mint-dark">{notice}</p>}
        <ErrorBox error={error ?? st.error} />
      </div>
    </Card>
  );
}
