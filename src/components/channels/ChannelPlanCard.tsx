"use client";

// Thẻ "Kế hoạch sản xuất" của một kênh (trang Kênh): thứ tự mỗi vòng (N MV một bài rồi 1 playlist), các video sắp tới, video làm sẵn chưa
// đăng (nút "Đã đăng" — app làm bù), video đang làm (trong dây chuyền) và video đã làm gần đây của kênh.

import Link from "next/link";
import { Card } from "@/components/ui";
import { VIDEO_KINDS, type ChannelSummary, type VideoKind } from "@/lib/channelTypes";
import { STEP_LABEL, type PipelineItem, type StepName, type StepStatus } from "@/lib/pipelineSteps";

const STEPS: StepName[] = ["script", "song", "clips", "render"];
const KIND_BADGE: Record<VideoKind, string> = { mv: "border-cherry/50 bg-cherry/10 text-cherry-dark", playlist: "border-sky-600/40 bg-sky-50 text-sky-900" };
const KIND_ICON: Record<VideoKind, string> = { mv: "🎬", playlist: "📀" };

/** Nhãn loại video: "🎬 MV 2/3" hoặc "📀 Playlist". */
export function KindBadge({ kind, index, of }: { kind: VideoKind; index?: number; of?: number }) {
  return (
    <span className={`badge ${KIND_BADGE[kind]}`} title={VIDEO_KINDS[kind]}>
      {KIND_ICON[kind]} {kind === "mv" ? `MV${index && of ? ` ${index}/${of}` : ""}` : "Playlist"}
    </span>
  );
}

/** Các video sắp tới theo thứ tự sản xuất (tối đa `n`), bắt đầu từ video tiếp theo của kênh. */
function upcoming(c: ChannelSummary, n: number): { kind: VideoKind; index: number }[] {
  const out: { kind: VideoKind; index: number }[] = [];
  let kind = c.next.kind;
  let index = c.next.index;
  while (out.length < n) {
    out.push({ kind, index });
    if (c.mvPerRound === 0) continue;
    if (kind === "mv" && index < c.mvPerRound) {
      index++;
    } else if (kind === "mv") {
      kind = "playlist";
      index = 0;
    } else {
      kind = "mv";
      index = 1;
    }
  }
  return out;
}

/** Bước đang cần chú ý của một việc (lỗi > chờ > đang chạy). */
function focus(it: PipelineItem): { name: StepName; status: StepStatus; message?: string } | null {
  for (const want of ["error", "waiting", "running"] as StepStatus[]) {
    const name = STEPS.find((s) => it.steps[s].status === want);
    if (name) return { name, ...it.steps[name] };
  }
  return null;
}

export function ChannelPlanCard({
  channel: c,
  items,
  videoMinutes,
  mvPlays,
  busy,
  onPosted,
}: {
  channel: ChannelSummary;
  items: PipelineItem[];
  videoMinutes: number;
  /** MV một bài phát bài mấy lần liền nhau. */
  mvPlays: number;
  busy?: boolean;
  /** Đánh dấu video đã đăng lên YouTube (hoặc bỏ đánh dấu). */
  onPosted?: (video: string, posted: boolean) => void;
}) {
  const open = items.filter((i) => !i.done_at);
  const next = upcoming(c, c.mvPerRound ? c.mvPerRound + 2 : 3);
  return (
    <Card title={`Kế hoạch sản xuất — ${c.name}`}>
      <div className="space-y-3 text-sm" data-testid="channel-plan">
        <p>
          {c.mvPerRound > 0 ? (
            <>
              Mỗi vòng: <b>{c.mvPerRound} MV một bài</b> (các cảnh Giáng sinh; lúc ghép nhạc lấy bài Giáng sinh mức hay cao nhất kênh chưa dùng
              {mvPlays > 1 ? `, phát ${mvPlays} lần liền nhau` : ""}, tên bài làm tiêu đề) rồi <b>1 playlist ~{videoMinutes} phút</b> mở đầu bằng {c.mvPerRound} bài vừa
              có MV; lặp lại.
            </>
          ) : (
            <>Chỉ làm playlist ~{videoMinutes} phút (MV mỗi vòng = 0).</>
          )}{" "}
          <span className="text-xs text-muted">Đổi số MV mỗi vòng ở bảng Các kênh.</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <b>Sắp tới:</b>
          {next.map((v, k) => (
            <span key={k} className="flex items-center gap-1">
              {k > 0 && <span className="text-muted">→</span>}
              <KindBadge kind={v.kind} index={v.index} of={c.mvPerRound} />
            </span>
          ))}
        </div>
        <p className="text-xs text-muted">
          {c.next.kind === "mv"
            ? `Video tiếp theo: MV ${c.next.index}/${c.mvPerRound}${c.next.song ? ` — bài dự kiến “${c.next.song}” (chọn lúc ghép nhạc)` : ""}.`
            : c.mvPerRound > 0
              ? "Video tiếp theo: playlist, mở đầu bằng bài của các MV trong vòng."
              : "Video tiếp theo: playlist."}{" "}
          · Bài mới còn {c.unused} bài (~{c.videosLeft} playlist {videoMinutes} phút).
        </p>

        <div data-testid="channel-stock">
          <b>
            Làm sẵn: {c.unposted}/{c.stock} video chưa đăng
          </b>{" "}
          <span className="text-xs text-muted">
            {c.stock === 0
              ? "— Làm sẵn = 0: app không tự làm video cho kênh này (vẫn giao việc tay được)."
              : c.unposted < c.stock
                ? `— app đang tự làm thêm ${c.stock - c.unposted} video (tự nghĩ ý tưởng khi kho hết).`
                : "— đủ rồi: khi đăng một video lên YouTube thì bấm “Đã đăng”, app tự làm bù."}
          </span>
          {c.ready.length > 0 && (
            <ul className="mt-1 space-y-1">
              {c.ready.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 border-t border-ink/10 pt-1 first:border-t-0" data-testid={`ready-${v.id}`}>
                  <KindBadge kind={v.kind} />
                  <span className="font-semibold">{v.title}</span>
                  <span className={`text-xs ${v.rendered ? "text-mint-dark" : "text-muted"}`}>{v.rendered ? "✓ đã dựng MP4" : "chưa dựng xong"}</span>
                  {onPosted && (
                    <button className="btn-ghost btn-sm ml-auto" disabled={busy} onClick={() => onPosted(v.id, true)} title="Đã đăng video này lên YouTube — app làm bù một video">
                      ✓ Đã đăng
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {c.postedRecent.length > 0 && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-muted">Đã đăng gần đây ({c.postedRecent.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {c.postedRecent.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={v.kind} />
                    <span>{v.title}</span>
                    <span className="text-muted">đăng {new Date(v.posted_at).toLocaleDateString("vi-VN")}</span>
                    {onPosted && (
                      <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onPosted(v.id, false)} title="Bấm nhầm: đưa lại vào danh sách chưa đăng">
                        ↺ Chưa đăng
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div>
          <b>Đang làm ({open.length})</b>
          {open.length ? (
            <ul className="mt-1 space-y-1">
              {open.map((it) => {
                const f = focus(it);
                const kind: VideoKind = it.kind ?? it.idea?.video_kind ?? "playlist";
                return (
                  <li key={it.id} className="flex flex-wrap items-center gap-2 border-t border-ink/10 pt-1 first:border-t-0">
                    <KindBadge kind={kind} />
                    <span className="font-semibold">{it.title}</span>
                    {f && (
                      <span className={`text-xs ${f.status === "error" ? "text-cherry-dark" : f.status === "waiting" ? "text-amber-800" : "text-muted"}`}>
                        {STEP_LABEL[f.name]}: {f.message ?? (f.status === "running" ? "đang làm" : "")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted">Không có video nào của kênh đang trong dây chuyền.</p>
          )}
          <Link href="/pipeline" className="mt-1 inline-block text-xs underline">
            Xem ở trang Dây chuyền →
          </Link>
        </div>

        <div>
          <b>Đã làm gần đây</b>
          {c.recent.length ? (
            <ul className="mt-1 space-y-0.5 text-xs">
              {c.recent.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">{new Date(v.date).toLocaleDateString("vi-VN")}</span>
                  <KindBadge kind={v.kind} />
                  <span>{v.title}</span>
                  <span className="text-muted">· {v.songs} bài</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">Kênh chưa có video nào được xếp nhạc.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
