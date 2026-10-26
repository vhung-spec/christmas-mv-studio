"use client";

// Thẻ "Tự lấy việc" ở trang Dây chuyền: dây chuyền tự lấy ý tưởng trong kho các kênh (lần lượt đều các kênh, mỗi lúc mấy video), chỉ làm
// video mới khi kho nhạc còn bài mới hay làm video trước — ghép nhạc sau. Kho ý tưởng và kế hoạch từng kênh ở trang Kênh.

import Link from "next/link";
import { Card, Spinner } from "@/components/ui";
import { BANK_LIMITS, type BankConfig } from "@/lib/ideaBankTypes";
import { type BankData, NumberBox } from "./IdeaBankCard";

export function FeedCard({ bank, busy, onConfig }: { bank: BankData | null; busy: boolean; onConfig: (patch: Partial<BankConfig>) => void }) {
  if (!bank) {
    return (
      <Card title="Tự lấy việc">
        <Spinner />
      </Card>
    );
  }
  const c = bank.config;
  const ideas = bank.channels.reduce((n, x) => n + x.counts.new, 0);
  const noMusic = bank.music && bank.music.videos === 0;
  return (
    <Card title="Tự lấy việc">
      <div className="space-y-1.5 text-sm" data-testid="feed-card">
        <label className="flex flex-wrap items-center gap-2">
          <input type="checkbox" checked={c.feed} disabled={busy} onChange={(e) => onConfig({ feed: e.target.checked })} />
          Dây chuyền tự lấy ý tưởng trong kho các kênh (lần lượt đều các kênh, theo thứ tự sản xuất của từng kênh), mỗi lúc
          <NumberBox value={c.ahead} range={BANK_LIMITS.ahead} disabled={busy} onCommit={(ahead) => onConfig({ ahead })} />
          video (đang viết kịch bản hoặc chờ clip Muse)
        </label>
        <label className="flex flex-wrap items-center gap-2 pl-6">
          <input type="checkbox" checked={c.needSong} disabled={busy} onChange={(e) => onConfig({ needSong: e.target.checked })} />
          Chỉ làm video mới khi kho nhạc còn bài mới cho kênh đó (hết thì ý tưởng của kênh nằm chờ, thêm nhạc là tự chạy). Bỏ tick khi kho nhạc chưa xong:
          cứ làm kịch bản + clip Muse trước, video chờ ở bước Nhạc, có nhạc là tự xếp bài và dựng (MV một bài vẫn chờ có bài mới viết kịch bản)
        </label>
        {noMusic && c.needSong && (
          <p className="flex flex-wrap items-center gap-2 pl-6 text-xs text-cherry-dark">
            Kho nhạc chưa đủ bài mới: ý tưởng đang nằm chờ.
            <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onConfig({ needSong: false })}>
              Làm video trước, ghép nhạc sau
            </button>
          </p>
        )}
        <p className="text-xs text-muted">
          Kho các kênh còn <b>{ideas}</b> ý tưởng chưa dùng — giao việc, xem kế hoạch và kho ý tưởng từng kênh ở trang{" "}
          <Link href="/channels" className="underline">
            Kênh
          </Link>
          . Mỗi video tốn tiền Claude viết kịch bản (khoảng 0,10–0,30 USD) và một lượt Muse cho mỗi cảnh; dây chuyền chỉ lấy việc mới khi các video đang
          làm đã đủ clip, nên tự đi theo tốc độ của Muse.
        </p>
      </div>
    </Card>
  );
}
