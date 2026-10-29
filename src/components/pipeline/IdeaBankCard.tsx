"use client";

// Thẻ "Kho ý tưởng" của một kênh (trang Kênh): đếm ý tưởng đã dùng / chưa dùng, kho nhạc còn bài mới cho kênh, tự đề xuất ý tưởng
// (Claude), duyệt các ý tưởng Claude đề xuất. Cách dây chuyền tự lấy việc (bật / tắt, mỗi lúc mấy video, chờ nhạc) ở FeedCard (trang
// Dây chuyền).

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { formatUsd } from "@/lib/cost";
import { BANK_LIMITS, type BankConfig, type BankIdea, type BankView } from "@/lib/ideaBankTypes";

export type BankData = BankView & { mode: "claude" | "mock" | "manual" };

/** Ô số: chỉ lưu khi rời ô hoặc bấm Enter (gõ "10" không bị lưu thành "1" giữa chừng). */
export function NumberBox({ value, range, onCommit, disabled }: { value: number; range: readonly [number, number]; onCommit: (n: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.min(range[1], Math.max(range[0], Math.round(Number(text)) || value));
    setText(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      className="input inline-block w-16 px-2 py-0.5 text-center"
      type="number"
      min={range[0]}
      max={range[1]}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

function IdeaLine({ x, children }: { x: BankIdea; children?: ReactNode }) {
  const i = x.idea;
  return (
    <li className="flex flex-wrap items-start gap-2 border-t border-ink/10 py-1.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <b>#{i.id}</b> {i.world_location} · {i.theme_code}
        {i.theme_name ? ` ${i.theme_name}` : ""}
        <div className="text-xs text-muted">{i.outline}</div>
        {x.source === "claude" && i.series && <div className="text-xs text-muted">Series: {i.series}</div>}
      </div>
      {children && <div className="flex gap-1">{children}</div>}
    </li>
  );
}

export function IdeaBankCard({
  bank,
  busy,
  onPost,
  onChannel,
  fixedChannel = false,
}: {
  bank: BankData | null;
  busy: boolean;
  onPost: (json: Record<string, unknown>) => void;
  /** Chọn kênh để xem kho ý tưởng của kênh đó. */
  onChannel?: (id: string) => void;
  /** Trang Kênh: kho của kênh đang chọn ở trang (không hiện các nút chọn kênh trong thẻ). */
  fixedChannel?: boolean;
}) {
  if (!bank) {
    return (
      <Card title="Kho ý tưởng">
        <Spinner />
      </Card>
    );
  }
  const c = bank.config;
  const setConfig = (patch: Partial<BankConfig>) => onPost({ action: "config", config: patch });
  // Mọi thao tác trên ý tưởng áp dụng cho kênh đang xem.
  const post = (json: Record<string, unknown>) => onPost({ ...json, channel: bank.channel });
  const manual = bank.mode === "manual";
  const more = (bank.ready ?? bank.counts.new) - bank.upcoming.length;
  const current = bank.channels.find((x) => x.id === bank.channel);
  return (
    <Card
      title={fixedChannel && bank.channels.length > 1 ? `Kho ý tưởng — ${bank.channels.find((x) => x.id === bank.channel)?.name ?? ""}` : "Kho ý tưởng"}
      actions={
        <button className="btn-ghost btn-sm" disabled={busy || bank.suggesting || manual} onClick={() => post({ action: "suggest" })} title="Claude nghĩ thêm ý tưởng mới cho kênh này ngay bây giờ">
          {bank.suggesting && <Spinner />} ✨ Nhờ Claude đề xuất ngay
        </button>
      }
    >
      <div className="space-y-3 text-sm">
        {bank.channels.length > 1 && !fixedChannel && (
          <div className="flex flex-wrap gap-1" data-testid="bank-channels">
            {bank.channels.map((x) => (
              <button
                key={x.id}
                className={`btn-sm ${x.id === bank.channel ? "btn-primary" : "btn-ghost"}`}
                onClick={() => onChannel?.(x.id)}
                title={x.active ? "" : "Kênh đang tắt: dây chuyền tạm không lấy ý tưởng của kênh này"}
              >
                📺 {x.name} ({x.counts.new}
                {x.counts.proposed ? ` + ${x.counts.proposed} chờ duyệt` : ""}){x.active ? "" : " · tắt"}
              </button>
            ))}
          </div>
        )}
        <p>
          {bank.channels.length > 1 && current && !fixedChannel ? <b>{current.name}: </b> : null}
          Chưa dùng <b>{bank.counts.new}</b> · Đã dùng <b>{bank.counts.used}</b> · Claude đề xuất chờ duyệt <b>{bank.counts.proposed}</b>
          {bank.counts.rejected ? ` · Đã bỏ ${bank.counts.rejected}` : ""}
        </p>
        {bank.music && (
          <div className={`space-y-1 text-xs ${bank.music.videos > 0 || !c.needSong ? "text-muted" : "text-cherry-dark"}`}>
            <p>
              🎵 Kho nhạc: <b>{bank.music.songs}</b> bài (mức 3 / 2 / 1: {bank.music.levels[3]} / {bank.music.levels[2]} / {bank.music.levels[1]}) · kênh này chưa dùng{" "}
              <b>{bank.music.unused}</b> bài — đủ bài mới cho khoảng <b>{bank.music.videos}</b> video {bank.music.videoMinutes} phút
              {bank.music.videos === 0 &&
                (c.needSong
                  ? ": ý tưởng của kênh này đang nằm chờ nhạc."
                  : bank.music.songs === 0
                    ? " — đang làm video trước: kịch bản và clip Muse vẫn làm, video chờ ở bước Nhạc; kho có nhạc là app tự xếp bài rồi dựng."
                    : " — video vẫn làm; tới bước Nhạc mà kho hết bài mới thì dùng lại bài cũ (thêm bài vào kho trên Drive).")}
              {!bank.music.sheet && bank.music.songs > 0 && " Chưa có Kho bài hát.xlsx: mọi bài coi là mức 1."}
            </p>
            {bank.music.videos === 0 && c.needSong && (
              <p className="flex flex-wrap items-center gap-2">
                <span>Kho nhạc chưa xong?</span>
                <button className="btn-ghost btn-sm" disabled={busy} onClick={() => setConfig({ needSong: false })}>
                  Làm video trước, ghép nhạc sau
                </button>
                <span className="text-muted">(bỏ tick ô “Chỉ làm video mới khi kho nhạc còn bài mới” ở trang Dây chuyền)</span>
              </p>
            )}
          </div>
        )}
        {bank.library > 0 && (
          <p className="text-xs text-muted">
            Thư viện lời bài hát: <b>{bank.library}</b> bài — tên bài (câu điệp khúc) được dùng cho danh sách bài trong mô tả YouTube.
          </p>
        )}
        {bank.skipped.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted">Đã bỏ qua {bank.skipped.length} ý tưởng</summary>
            <ul className="mt-1">
              {bank.skipped.map((x) => (
                <li key={x.key}>
                  <b>#{x.idea.id}</b> {x.idea.world_location} — {x.note}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="space-y-1.5">
          <p className="text-xs text-muted">
            Dây chuyền {c.feed ? `đang tự lấy ý tưởng trong kho các kênh, mỗi lúc ${c.ahead} video` : "đang tắt tự lấy ý tưởng"} — đổi ở trang{" "}
            <Link href="/pipeline" className="underline">
              Dây chuyền
            </Link>{" "}
            (thẻ Tự lấy việc).
          </p>
          <label className="flex flex-wrap items-center gap-2">
            <input type="checkbox" checked={c.suggest} disabled={busy} onChange={(e) => setConfig({ suggest: e.target.checked })} />
            Kho của kênh sắp hết (kể cả kho trống) thì nhờ Claude nghĩ
            <NumberBox value={c.batch} range={BANK_LIMITS.batch} disabled={busy} onCommit={(batch) => setConfig({ batch })} />
            ý tưởng mới — chỉ cảnh (Giáng sinh ở một vùng đất), không nhân vật chính
          </label>
          <div className="flex flex-wrap gap-4 pl-6">
            <label className="flex items-center gap-2">
              <input type="radio" name="bank-approve" checked={!c.autoApprove} disabled={busy} onChange={() => setConfig({ autoApprove: false })} />
              Chờ tôi duyệt
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="bank-approve" checked={c.autoApprove} disabled={busy} onChange={() => setConfig({ autoApprove: true })} />
              Dùng luôn, không cần duyệt
            </label>
          </div>
          <p className="text-xs text-muted">
            Mỗi video tốn tiền Claude viết kịch bản (khoảng 0,10–0,30 USD) và lượt Muse cho từng cảnh (20–30 cảnh); mỗi lần đề xuất ý tưởng chỉ tốn vài cent. Dây
            chuyền chỉ lấy ý tưởng mới khi các video đang làm đã đủ clip, nên tự đi theo tốc độ của Muse.
          </p>
          {manual && (
            <p className="text-xs text-cherry-dark">
              Đang ở chế độ claude.ai (copy–dán): kho chưa tự chạy được. Nhập Claude API key trong Cài đặt để app tự viết kịch bản và tự đề xuất ý tưởng.
            </p>
          )}
          {bank.mode === "mock" && <p className="text-xs text-amber-800">Chế độ Demo: ý tưởng đề xuất là mẫu ghép sẵn, không dùng AI.</p>}
        </div>

        {bank.suggesting && (
          <p className="flex items-center gap-2 font-semibold text-sky-900">
            <Spinner /> Claude đang nghĩ ý tưởng mới…
          </p>
        )}
        <ErrorBox error={bank.error} />
        {bank.last && !bank.suggesting && (
          <p className="text-xs text-muted">
            Lần đề xuất gần nhất ({new Date(bank.last.at).toLocaleString("vi-VN")}): thêm {bank.last.added} ý tưởng
            {bank.last.dropped ? `, bỏ ${bank.last.dropped} ý tưởng trùng hoặc sai định dạng` : ""}
            {bank.last.cost_usd !== null ? ` · ${formatUsd(bank.last.cost_usd)}` : ""}.
          </p>
        )}

        {bank.proposals.length > 0 && (
          <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3" data-testid="bank-proposals">
            <div className="flex flex-wrap items-center gap-2">
              <b>Claude đề xuất — chờ bạn duyệt ({bank.proposals.length})</b>
              <span className="ml-auto flex gap-2">
                <button className="btn-primary btn-sm" disabled={busy} onClick={() => post({ action: "approve", all: true })}>
                  ✓ Duyệt tất cả
                </button>
                <button className="btn-ghost btn-sm" disabled={busy} onClick={() => post({ action: "reject", all: true })}>
                  ✗ Bỏ tất cả
                </button>
              </span>
            </div>
            <ul className="mt-2">
              {bank.proposals.map((x) => (
                <IdeaLine key={x.key} x={x}>
                  <button className="btn-ghost btn-sm" disabled={busy} onClick={() => post({ action: "approve", keys: [x.key] })}>
                    ✓ Dùng
                  </button>
                  <button className="btn-ghost btn-sm" disabled={busy} onClick={() => post({ action: "reject", keys: [x.key] })}>
                    ✗ Bỏ
                  </button>
                </IdeaLine>
              ))}
            </ul>
          </div>
        )}

        {bank.upcoming.length > 0 ? (
          <details>
            <summary className="cursor-pointer font-semibold">Sắp tới lượt ({bank.ready ?? bank.counts.new})</summary>
            <ul className="mt-1 max-h-80 overflow-auto">
              {bank.upcoming.map((x) => (
                <IdeaLine key={x.key} x={x}>
                  <button className="btn-ghost btn-sm" disabled={busy} onClick={() => post({ action: "reject", keys: [x.key] })} title="Bỏ ý tưởng này khỏi kho (không dùng)">
                    Bỏ
                  </button>
                </IdeaLine>
              ))}
            </ul>
            {more > 0 && <p className="text-xs text-muted">… và {more} ý tưởng nữa.</p>}
          </details>
        ) : bank.counts.new > 0 ? (
          <p className="text-xs text-amber-800">
            {bank.counts.new} ý tưởng đang chờ: kho nhạc hết bài mới cho kênh này — thêm bài vào kho nhạc (Drive) là dây chuyền tự lấy, hoặc bấm “Làm video
            trước, ghép nhạc sau”.
          </p>
        ) : (
          !bank.proposals.length && <p className="text-xs text-muted">Kho chưa có ý tưởng chưa dùng — dán bảng ý tưởng ở thẻ “Giao việc” rồi bấm “Đưa vào kho”.</p>
        )}
      </div>
    </Card>
  );
}
