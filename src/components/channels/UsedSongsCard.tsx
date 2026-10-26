"use client";

// Thẻ "Nhạc đã dùng" của một kênh (trang Kênh): theo video (mỗi MV / playlist các bài theo thứ tự + giờ bắt đầu, chép dán mô tả YouTube),
// theo bài (bài nào dùng ở MV / playlist nào, bài thứ mấy, bản nào), bài kênh chưa dùng và bài các MV đang làm đã giữ.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { KindBadge } from "@/components/channels/ChannelPlanCard";
import { TrackList } from "@/components/channels/TrackList";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { chapterTime } from "@/lib/chapters";
import type { UsedSongsView } from "@/lib/channelTypes";
import { api } from "@/lib/client";

type Tab = "videos" | "songs" | "unused";
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("vi-VN") : "");
/** So khớp ô tìm: bỏ dấu, hoa thường. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** `reload` đổi (vd. kênh vừa có thêm video được xếp nhạc) thì thẻ đọc lại. */
export function UsedSongsCard({ channelId, reload }: { channelId: string; reload: string }) {
  const [view, setView] = useState<UsedSongsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("videos");
  const [q, setQ] = useState("");
  /** Video đang mở danh sách bài. */
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(
    () =>
      api<UsedSongsView>(`/api/channels?used=${encodeURIComponent(channelId)}`).then(
        (v) => {
          setView(v);
          setError(null);
        },
        (e) => setError((e as Error).message),
      ),
    [channelId],
  );
  useEffect(() => {
    void load();
  }, [load, reload]);
  useEffect(() => setOpen(new Set()), [channelId]);

  const hit = (...texts: string[]) => !q.trim() || texts.some((t) => fold(t).includes(fold(q.trim())));
  const v = view?.channel.id === channelId ? view : null;
  const videos = (v?.videos ?? []).filter((x) => hit(x.title, ...x.tracks.flatMap((t) => [t.title, t.code, t.file])));
  const songs = (v?.songs ?? []).filter((s) => hit(s.title, s.code, ...s.uses.map((u) => u.title)));
  const unused = (v?.unused ?? []).filter((s) => hit(s.title, s.code));
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Card
      title={`Nhạc đã dùng${v ? ` — ${v.channel.name}` : ""}`}
      actions={
        <button className="btn-ghost btn-sm" onClick={() => void load()}>
          ↻ Xem lại
        </button>
      }
    >
      <ErrorBox error={error} />
      {!v ? (
        !error && <Spinner />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Kênh đã xếp nhạc cho <b>{v.videos.length} video</b>, dùng <b>{v.songs.length} bài</b>
            {v.library ? (
              <>
                ; kho còn <b>{v.unused.length} bài</b> kênh chưa dùng
              </>
            ) : (
              <> (chưa đặt Thư mục nhạc: tên bài lấy theo tên file)</>
            )}
            . Mỗi video có danh sách bài theo thứ tự và giờ bắt đầu từng bài — bấm <b>Chép danh sách bài</b> để dán vào mô tả YouTube (YouTube tự tạo
            chương). Mô tả trong thư mục kết quả của playlist đã có sẵn danh sách này.
          </p>
          {v.held.length > 0 && (
            <p className="text-xs">
              <b>Đang giữ cho MV đang làm</b> (chưa ghép nhạc):{" "}
              {v.held.map((h) => `“${h.title}” (MV “${h.video}”)`).join(", ")}.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["videos", `Theo video (${v.videos.length})`],
                ["songs", `Theo bài (${v.songs.length})`],
                ...(v.library ? [["unused", `Chưa dùng (${v.unused.length})`]] : []),
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} className={`btn-sm ${tab === id ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
            <input className="input w-full py-1 text-sm sm:ml-auto sm:w-56" placeholder="Tìm bài / video…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="used-search" />
          </div>

          <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
            {tab === "videos" &&
              (!videos.length ? (
                <p className="text-sm text-muted">{v.videos.length ? "Không có video nào khớp." : "Kênh chưa có video nào được xếp nhạc."}</p>
              ) : (
                videos.map((x) => (
                  <div key={x.id} className="rounded-lg border border-ink/15 p-2" data-testid={`used-video-${x.id}`}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <KindBadge kind={x.kind} />
                      {x.exists ? (
                        <Link href={`/mv/${x.id}/video`} className="font-semibold underline-offset-2 hover:underline">
                          {x.title}
                        </Link>
                      ) : (
                        <span className="font-semibold" title="MV này không còn trong app">
                          {x.title}
                        </span>
                      )}
                      <span className="text-xs text-muted">
                        {day(x.date)} · {x.tracks.length} bài{x.total !== null ? ` · ${chapterTime(x.total)}` : ""}
                      </span>
                      <button className="btn-ghost btn-sm ml-auto" onClick={() => toggle(x.id)} aria-expanded={open.has(x.id)}>
                        {open.has(x.id) ? "▾ Ẩn bài" : "▸ Xem bài"}
                      </button>
                    </div>
                    {open.has(x.id) && (
                      <div className="mt-2">
                        <TrackList tracks={x.tracks} />
                      </div>
                    )}
                  </div>
                ))
              ))}

            {tab === "songs" &&
              (!songs.length ? (
                <p className="text-sm text-muted">{v.songs.length ? "Không có bài nào khớp." : "Kênh chưa dùng bài nào."}</p>
              ) : (
                songs.map((s) => (
                  <div key={s.code} className="rounded-lg border border-ink/15 p-2 text-sm" data-testid={`used-song-${s.code}`}>
                    <p>
                      <b>{s.title}</b> <span className="text-xs text-muted">mã {s.code}{s.level ? ` · mức ${s.level}` : ""}</span>{" "}
                      <span className="badge border-ink/20 bg-cream">{s.uses.length} lần</span>
                      {!s.inLibrary && <span className="badge ml-1 border-amber-500 bg-amber-100 text-amber-900">không còn trong kho</span>}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {s.uses.map((u, k) => (
                        <li key={k} className="flex flex-wrap items-center gap-x-2">
                          <KindBadge kind={u.kind} />
                          <span>{u.title}</span>
                          <span className="text-muted">
                            {day(u.date)}
                            {u.kind === "playlist" ? ` · bài ${u.position}` : ""} · {u.file}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ))}

            {tab === "unused" &&
              (!unused.length ? (
                <p className="text-sm text-muted">{v.unused.length ? "Không có bài nào khớp." : "Kênh đã dùng hết các bài trong kho — thêm bài vào kho trên Drive."}</p>
              ) : (
                ([3, 2, 1] as const).map((lv) => {
                  const list = unused.filter((s) => s.level === lv);
                  return (
                    list.length > 0 && (
                      <p key={lv} className="text-sm">
                        <b>Mức {lv}</b> <span className="text-xs text-muted">({list.length} bài)</span>:{" "}
                        {list.map((s) => `${s.title} (${s.code})`).join(" · ")}
                      </p>
                    )
                  );
                })
              ))}
          </div>
        </div>
      )}
    </Card>
  );
}
