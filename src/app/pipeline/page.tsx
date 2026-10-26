"use client";

// Trang Dây chuyền: sản xuất — mỗi việc là một video (MV một bài hoặc playlist ~1 tiếng) của một kênh, chạy qua Kịch bản → Nhạc →
// Clip Muse → Dựng MP4. Quản lý kênh, giao việc, kế hoạch sản xuất và kho ý tưởng ở trang Kênh.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { KindBadge } from "@/components/channels/ChannelPlanCard";
import { MuseStatus, useMuse } from "@/components/muse/MusePanels";
import { FeedCard } from "@/components/pipeline/FeedCard";
import type { BankData } from "@/components/pipeline/IdeaBankCard";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { api, mediaUrl } from "@/lib/client";
import type { BankConfig } from "@/lib/ideaBankTypes";
import { STEP_LABEL, itemChannelOf, type PipelineItem, type PipelineView, type StepName, type StepStatus } from "@/lib/pipelineSteps";

type View = PipelineView & {
  settings: { mode: "claude" | "mock" | "manual"; songDir: string; museMode: "gateway" | "haohao"; minShots: number; maxShots: number; videoMinutes: number };
};

const CHIP: Record<StepStatus, string> = {
  pending: "border-ink/30 bg-cream text-muted",
  running: "border-sky-500 bg-sky-200 text-sky-950 animate-pulse",
  waiting: "border-amber-500 bg-amber-100 text-amber-900",
  done: "border-mint-dark/60 bg-mint/30",
  error: "border-cherry bg-cherry/10 text-cherry-dark",
};
const ICON: Record<StepStatus, string> = { pending: "·", running: "…", waiting: "⏸", done: "✓", error: "✗" };
const STEPS: StepName[] = ["script", "song", "clips", "render"];

/** Bước đang cần chú ý của một việc (lỗi > chờ > đang chạy). */
function focus(it: PipelineItem): { name: StepName; status: StepStatus; message?: string } | null {
  for (const want of ["error", "waiting", "running"] as StepStatus[]) {
    const name = STEPS.find((s) => it.steps[s].status === want);
    if (name) return { name, ...it.steps[name] };
  }
  return null;
}

export default function PipelinePage() {
  const [view, setView] = useState<View | null>(null);
  const [bank, setBank] = useState<BankData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Lọc danh sách theo kênh ("" = mọi kênh). */
  const [only, setOnly] = useState("");
  const muse = useMuse();

  const reload = useCallback(() => api<View>("/api/pipeline").then(setView, (e) => setError((e as Error).message)), []);
  const loadBank = useCallback(() => api<BankData>("/api/ideas").then(setBank, () => {}), []);
  const channelName = (id?: string) => view?.channels.find((c) => c.id === id)?.name ?? view?.channels[0]?.name ?? "";
  useEffect(() => {
    void reload();
    void loadBank();
  }, [reload, loadBank]);
  const open = view?.items.some((i) => !i.done_at) ?? false;
  const watchBank = Boolean(bank?.config.feed && bank.channels.some((c) => c.counts.new));
  useEffect(() => {
    if (!open && !watchBank) return;
    const t = setInterval(() => {
      void reload();
      void loadBank();
    }, 4000);
    return () => clearInterval(t);
  }, [open, watchBank, reload, loadBank]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const post = (json: unknown) =>
    run(async () => {
      await api("/api/pipeline", { method: "POST", json });
      await reload();
    });
  const setConfig = (patch: Partial<BankConfig>) =>
    run(async () => {
      setBank(await api<BankData>("/api/ideas", { method: "POST", json: { action: "config", config: patch } }));
      await reload();
    });

  const s = view?.settings;
  const items = (view?.items ?? []).filter((i) => !only || itemChannelOf(i) === only);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl uppercase">Dây chuyền sản xuất</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Mỗi việc là một video cho một <b>kênh</b> — <b>MV một bài</b> (~3–4 phút) hoặc <b>playlist ~1 tiếng</b>, theo thứ tự sản xuất của kênh — chạy qua 4
          bước: <b>Kịch bản</b> → <b>Nhạc</b> (MV: đúng bài đã chọn; playlist: tự xếp bài như Bokin Playlist) → <b>Clip Muse</b> (tự gửi từng cảnh) →{" "}
          <b>Dựng MP4</b>. Giao việc, kế hoạch và kho ý tưởng từng kênh ở trang{" "}
          <Link href="/channels" className="underline">
            Kênh
          </Link>
          . Tắt app giữa chừng không sao: mở lại là chạy tiếp.
        </p>
      </div>
      <ErrorBox error={error} />

      <Card title="Chuẩn bị">
        {!s ? (
          <Spinner />
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              <b>Kịch bản:</b>{" "}
              {s.mode === "claude" ? (
                <span className="text-mint-dark">✓ Claude API — tự viết</span>
              ) : s.mode === "mock" ? (
                <span className="text-amber-800">Chế độ Demo (ghép từ mẫu, không dùng AI)</span>
              ) : (
                <span className="text-cherry-dark">
                  ✗ Đang ở chế độ claude.ai (copy–dán) — chỉ chạy được MV có sẵn. Nhập API key ở{" "}
                  <Link href="/settings" className="underline">
                    Cài đặt
                  </Link>{" "}
                  để tự viết kịch bản.
                </span>
              )}
            </p>
            <p>
              <b>Nhạc:</b>{" "}
              {s.songDir ? (
                <span>
                  kho <code>{s.songDir}</code> (Kho bài hát.xlsx cho mức hay) — MV một bài dài đúng bài, playlist đủ khoảng <b>{s.videoMinutes} phút</b>
                </span>
              ) : (
                <span className="text-amber-800">
                  chưa đặt “Thư mục nhạc” trong{" "}
                  <Link href="/settings" className="underline">
                    Cài đặt
                  </Link>{" "}
                  — video nào chưa có nhạc sẽ chờ bạn tải nhạc lên.
                </span>
              )}
            </p>
            <div>
              <b>Muse:</b> {muse.view ? <MuseStatus view={muse.view} url={muse.url} onView={muse.setView} /> : <Spinner />}
            </div>
          </div>
        )}
      </Card>

      <FeedCard bank={bank} busy={busy} onConfig={(patch) => void setConfig(patch)} />

      <Card
        title="Đang sản xuất"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              Kênh:
              <select className="input w-auto py-0.5 text-xs" value={only} onChange={(e) => setOnly(e.target.value)} data-testid="pipeline-filter">
                <option value="">Mọi kênh</option>
                {(view?.channels ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {view?.items.some((i) => i.done_at) && (
              <button className="btn-ghost btn-sm" disabled={busy} onClick={() => void post({ action: "clear" })}>
                Bỏ các việc đã xong
              </button>
            )}
          </div>
        }
      >
        {!view ? (
          <Spinner />
        ) : !items.length ? (
          <p className="text-sm text-muted">
            Chưa có việc nào{only ? " của kênh này" : ""}. Giao việc ở trang{" "}
            <Link href="/channels" className="underline">
              Kênh
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-3">
            {view.error && <p className="text-xs text-cherry-dark">Lần chạy gần nhất: {view.error}</p>}
            {items.map((it) => {
              const f = focus(it);
              const hasError = STEPS.some((st) => it.steps[st].status === "error");
              return (
                <div key={it.id} className="rounded-lg border border-ink/15 p-3" data-testid={`pipeline-${it.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge border-sky-600/40 bg-sky-50" title="Kênh làm video này" data-testid="pipeline-channel">
                      📺 {channelName(itemChannelOf(it))}
                    </span>
                    <KindBadge kind={it.kind ?? it.idea?.video_kind ?? "playlist"} />
                    <span className="font-semibold">{it.title}</span>
                    {STEPS.map((st) => (
                      <span key={st} className={`badge ${CHIP[it.steps[st].status]}`} title={it.steps[st].message ?? ""} data-step={st} data-status={it.steps[st].status}>
                        {ICON[it.steps[st].status]} {STEP_LABEL[st]}
                      </span>
                    ))}
                    <span className="ml-auto flex flex-wrap gap-2 text-xs">
                      {it.mv_id && (
                        <Link href={`/mv/${it.mv_id}/video`} className="btn-ghost btn-sm">
                          Mở MV
                        </Link>
                      )}
                      {it.mv_id && it.output && (
                        <a className="btn-primary btn-sm" href={mediaUrl(it.mv_id, it.output, true)} download>
                          ⬇ Tải MP4
                        </a>
                      )}
                      {hasError && (
                        <button className="btn-ghost btn-sm" disabled={busy} onClick={() => void post({ action: "retry", id: it.id })}>
                          ↻ Thử lại bước lỗi
                        </button>
                      )}
                      <button className="btn-ghost btn-sm" disabled={busy} onClick={() => void post({ action: "remove", id: it.id })} title="Bỏ khỏi dây chuyền (không xoá MV, clip hay video)">
                        Bỏ
                      </button>
                    </span>
                  </div>
                  {it.done_at ? (
                    <div className="mt-2 flex flex-wrap items-start gap-3">
                      {it.mv_id && it.cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl(it.mv_id, it.cover)} alt="Ảnh bìa" className="w-48 max-w-full rounded border border-ink/15" />
                      )}
                      <div className="min-w-0 flex-1 space-y-1 text-xs">
                        <p className="font-semibold text-mint-dark">✓ Xong — {it.output}</p>
                        {it.yt_title && (
                          <p>
                            <b>Tiêu đề:</b> {it.yt_title}
                          </p>
                        )}
                        {it.result_dir && (
                          <p className="break-all text-muted">
                            Thư mục kết quả: <code>{it.result_dir}</code>
                          </p>
                        )}
                        {it.mv_id && (it.cover || it.info) && (
                          <p className="flex flex-wrap gap-2">
                            {it.cover && (
                              <a className="btn-ghost btn-sm" href={mediaUrl(it.mv_id, it.cover, true)} download>
                                ⬇ Ảnh bìa
                              </a>
                            )}
                            {it.info && (
                              <a className="btn-ghost btn-sm" href={mediaUrl(it.mv_id, it.info, true)} download>
                                ⬇ Tiêu đề + mô tả
                              </a>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    f?.message && (
                      <p className={`mt-1 text-xs ${f.status === "error" ? "text-cherry-dark" : f.status === "waiting" ? "text-amber-800" : "text-muted"}`}>
                        {STEP_LABEL[f.name]}: {f.message}
                      </p>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
