"use client";

// Thẻ "Kho ý tưởng" ở trang Tự động: đếm ý tưởng đã dùng / chưa dùng, bật tắt tự lấy ý tưởng và tự đề xuất,
// duyệt các ý tưởng Claude đề xuất.

import { type ReactNode, useEffect, useState } from "react";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { formatUsd } from "@/lib/cost";
import { BANK_LIMITS, type BankConfig, type BankIdea, type BankView } from "@/lib/ideaBankTypes";

export type BankData = BankView & { mode: "claude" | "mock" | "manual" };

/** Ô số: chỉ lưu khi rời ô hoặc bấm Enter (gõ "10" không bị lưu thành "1" giữa chừng). */
function NumberBox({ value, range, onCommit, disabled }: { value: number; range: readonly [number, number]; onCommit: (n: number) => void; disabled?: boolean }) {
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

export function IdeaBankCard({ bank, busy, onPost }: { bank: BankData | null; busy: boolean; onPost: (json: Record<string, unknown>) => void }) {
  if (!bank) {
    return (
      <Card title="Kho ý tưởng">
        <Spinner />
      </Card>
    );
  }
  const c = bank.config;
  const setConfig = (patch: Partial<BankConfig>) => onPost({ action: "config", config: patch });
  const manual = bank.mode === "manual";
  const more = bank.counts.new - bank.upcoming.length;
  return (
    <Card
      title="Kho ý tưởng"
      actions={
        <button className="btn-ghost btn-sm" disabled={busy || bank.suggesting || manual} onClick={() => onPost({ action: "suggest" })} title="Claude nghĩ thêm ý tưởng mới ngay bây giờ">
          {bank.suggesting && <Spinner />} ✨ Nhờ Claude đề xuất ngay
        </button>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          Chưa dùng <b>{bank.counts.new}</b> · Đã dùng <b>{bank.counts.used}</b> · Claude đề xuất chờ duyệt <b>{bank.counts.proposed}</b>
          {bank.counts.rejected ? ` · Đã bỏ ${bank.counts.rejected}` : ""}
        </p>

        <div className="space-y-1.5">
          <label className="flex flex-wrap items-center gap-2">
            <input type="checkbox" checked={c.feed} disabled={busy} onChange={(e) => setConfig({ feed: e.target.checked })} />
            Dây chuyền tự lấy ý tưởng trong kho, mỗi lúc
            <NumberBox value={c.ahead} range={BANK_LIMITS.ahead} disabled={busy} onCommit={(ahead) => setConfig({ ahead })} />
            MV (đang viết kịch bản hoặc chờ clip Muse)
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="checkbox" checked={c.suggest} disabled={busy} onChange={(e) => setConfig({ suggest: e.target.checked })} />
            Kho sắp hết thì nhờ Claude đề xuất
            <NumberBox value={c.batch} range={BANK_LIMITS.batch} disabled={busy} onCommit={(batch) => setConfig({ batch })} />
            ý tưởng mới
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
            Mỗi MV tốn tiền Claude viết kịch bản (khoảng 0,10–0,20 USD) và lượt Muse cho từng cảnh; mỗi lần đề xuất ý tưởng chỉ tốn vài cent. Dây chuyền chỉ lấy ý
            tưởng mới khi các MV đang làm đã đủ clip, nên tự đi theo tốc độ của Muse.
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
                <button className="btn-primary btn-sm" disabled={busy} onClick={() => onPost({ action: "approve", all: true })}>
                  ✓ Duyệt tất cả
                </button>
                <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onPost({ action: "reject", all: true })}>
                  ✗ Bỏ tất cả
                </button>
              </span>
            </div>
            <ul className="mt-2">
              {bank.proposals.map((x) => (
                <IdeaLine key={x.key} x={x}>
                  <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onPost({ action: "approve", keys: [x.key] })}>
                    ✓ Dùng
                  </button>
                  <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onPost({ action: "reject", keys: [x.key] })}>
                    ✗ Bỏ
                  </button>
                </IdeaLine>
              ))}
            </ul>
          </div>
        )}

        {bank.upcoming.length > 0 ? (
          <details>
            <summary className="cursor-pointer font-semibold">Sắp tới lượt ({bank.counts.new})</summary>
            <ul className="mt-1 max-h-80 overflow-auto">
              {bank.upcoming.map((x) => (
                <IdeaLine key={x.key} x={x}>
                  <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onPost({ action: "reject", keys: [x.key] })} title="Bỏ ý tưởng này khỏi kho (không dùng)">
                    Bỏ
                  </button>
                </IdeaLine>
              ))}
            </ul>
            {more > 0 && <p className="text-xs text-muted">… và {more} ý tưởng nữa.</p>}
          </details>
        ) : (
          !bank.proposals.length && <p className="text-xs text-muted">Kho chưa có ý tưởng chưa dùng — dán bảng ý tưởng ở thẻ “Thêm việc” rồi bấm “Đưa vào kho”.</p>
        )}
      </div>
    </Card>
  );
}
