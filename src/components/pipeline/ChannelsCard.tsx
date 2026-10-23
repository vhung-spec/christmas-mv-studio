"use client";

// Thẻ "Kênh & kho nhạc" ở trang Tự động: các kênh (bật / tắt, tỉ lệ bài cũ, cách chọn bài mới, số video, bài mới còn lại), thêm kênh,
// và tình trạng kho nhạc chung (Kho bài hát.xlsx mẫu Bokin: số bài theo mức hay, lỗi trong tệp).

import { useCallback, useEffect, useState } from "react";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { NEW_ORDERS, OLD_PERCENT_RANGE, type ChannelSummary, type LibrarySummary, type NewOrder } from "@/lib/channelTypes";
import { api } from "@/lib/client";

interface ChannelsData {
  channels: ChannelSummary[];
  library: LibrarySummary | null;
  videoMinutes: number;
  songDir: string;
}

/** Ô chữ / số chỉ lưu khi rời ô hoặc bấm Enter. */
function CommitInput({ value, onCommit, className, type = "text", min, max, disabled }: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  type?: "text" | "number";
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text.trim() && text !== value) onCommit(text.trim());
    else setText(value);
  };
  return (
    <input
      className={`input py-0.5 ${className ?? ""}`}
      type={type}
      min={min}
      max={max}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

export function ChannelsCard({ onChanged, refresh = 0 }: { onChanged?: () => void; refresh?: number }) {
  const [data, setData] = useState<ChannelsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(() => api<ChannelsData>("/api/channels").then(setData, (e) => setError((e as Error).message)), []);
  useEffect(() => {
    void load();
  }, [load, refresh]);

  async function post(json: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      setData(await api<ChannelsData>("/api/channels", { method: "POST", json }));
      onChanged?.();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Card title="Kênh & kho nhạc">
        {error ? <ErrorBox error={error} /> : <Spinner />}
      </Card>
    );
  }
  const lib = data.library;
  const update = (id: string, patch: Record<string, unknown>) => void post({ action: "update", id, ...patch });
  return (
    <Card title="Kênh & kho nhạc" actions={<button className="btn-ghost btn-sm" onClick={() => void load()}>↻ Xem lại</button>}>
      <div className="space-y-3 text-sm" data-testid="channels-card">
        <ErrorBox error={error} />
        <p className="text-xs text-muted">
          Tự xếp bài như <b>Bokin Playlist Studio</b>: mỗi video gồm bài cũ (bài mức 2–3 kênh đã dùng, bài lâu chưa dùng trước) và bài mới (kênh chưa dùng
          lần nào), đủ khoảng <b>{data.videoMinutes} phút</b>; bài mức 1 chỉ dùng làm bài mới; danh sách xếp mức 3 → 2 → 1, bài mở đầu khác video trước. Các
          kênh dùng chung một kho nhạc, bài cũ / mới tính theo lịch sử riêng của từng kênh. Video mới tự chia lần lượt cho kênh đang có ít video nhất.
        </p>

        {!lib ? (
          <p className="text-amber-800">Chưa đặt “Thư mục nhạc” trong Cài đặt — chưa có kho nhạc.</p>
        ) : (
          <div className={`rounded-lg border p-3 ${lib.sheet ? "border-ink/15" : "border-amber-500 bg-amber-50"}`}>
            <p>
              <b>Kho nhạc:</b> {lib.songs} bài dùng được · khoảng {lib.minutes} phút · mức 3 / 2 / 1:{" "}
              <b>
                {lib.levels[3]} / {lib.levels[2]} / {lib.levels[1]}
              </b>
              {lib.excluded ? ` · loại khỏi kho ${lib.excluded}` : ""}
              {lib.missing ? ` · thiếu file nhạc ${lib.missing}` : ""}
            </p>
            {lib.sheet ? (
              <p className="text-xs text-muted">
                Mức hay, tên bài, mã bài đọc từ <code>{lib.sheet}</code> ({lib.inSheet} dòng). Bài có trong thư mục nhạc mà chưa có trong tệp = mức 1.
              </p>
            ) : (
              <p className="text-xs text-amber-900">
                Chưa có <b>Kho bài hát.xlsx</b> → mọi bài coi là mức 1 (không có bài cũ để dùng lại, không có bài hay mở đầu). Đặt tệp Kho bài hát.xlsx cùng mẫu
                Bokin (cột Mã bài, Tên bài, Tệp nhạc, Mức hay 3 / 2 / 1) vào thư mục nhạc trên Drive rồi bấm Đồng bộ, hoặc chép vào <code>{data.songDir}</code>.
              </p>
            )}
            {lib.problems.length > 0 && (
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-cherry-dark">{lib.problems.length} dòng cần sửa trong kho</summary>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
                  {lib.problems.map((p, k) => (
                    <li key={k}>
                      {p.row ? `Dòng ${p.row}: ` : ""}
                      {p.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-ink/15">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-2 py-1.5">Bật</th>
                <th className="px-2 py-1.5">Kênh</th>
                <th className="px-2 py-1.5" title="Phần trăm số bài mỗi video là bài cũ (Bokin: 6 / 13 ≈ 46%)">
                  Bài cũ %
                </th>
                <th className="px-2 py-1.5">Chọn bài mới</th>
                <th className="px-2 py-1.5" title="Video của kênh (đã làm + đang làm): video mới vào kênh có ít video nhất">
                  Video
                </th>
                <th className="px-2 py-1.5">Bài mới còn</th>
              </tr>
            </thead>
            <tbody>
              {data.channels.map((c) => (
                <tr key={c.id} className="border-t border-ink/10" data-testid={`channel-${c.id}`}>
                  <td className="px-2 py-1.5">
                    <input type="checkbox" checked={c.active} disabled={busy} onChange={(e) => update(c.id, { active: e.target.checked })} title="Tắt = tạm không làm video mới cho kênh này" />
                  </td>
                  <td className="px-2 py-1.5">
                    <CommitInput value={c.name} disabled={busy} onCommit={(v) => update(c.id, { name: v })} className="w-44" />
                  </td>
                  <td className="px-2 py-1.5">
                    <CommitInput
                      type="number"
                      min={OLD_PERCENT_RANGE[0]}
                      max={OLD_PERCENT_RANGE[1]}
                      value={String(c.oldPercent)}
                      disabled={busy}
                      onCommit={(v) => update(c.id, { oldPercent: Number(v) })}
                      className="w-16 text-center"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select className="input w-auto py-0.5 text-xs" value={c.newOrder} disabled={busy} onChange={(e) => update(c.id, { newOrder: e.target.value as NewOrder })}>
                      {(Object.keys(NEW_ORDERS) as NewOrder[]).map((k) => (
                        <option key={k} value={k}>
                          {NEW_ORDERS[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {c.videos} video{c.inProgress ? ` (${c.inProgress} đang làm)` : ""}
                  </td>
                  <td className={`px-2 py-1.5 text-xs ${lib && c.videosLeft <= 3 ? "font-semibold text-cherry-dark" : ""}`}>
                    {lib ? `${c.unused} bài (~${c.videosLeft} video)` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Cân bằng các mức: bài mới của mỗi video có mức 3, 2, 1 theo tỉ lệ trong kho, các video đều nhau. Mức cao trước: video đầu dùng hết bài mức cao, các video
          sau chỉ còn bài mới mức thấp. Bài nào nên thưa hơn / không dùng lại / loại khỏi kho: ghi ở cột <b>Dùng lại</b> trong Kho bài hát.xlsx.
        </p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post({ action: "add", name }).then((ok) => ok && setName(""));
          }}
        >
          <input className="input w-56 py-1" placeholder="Tên kênh mới" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-ghost btn-sm" disabled={busy || !name.trim()} type="submit">
            {busy && <Spinner />} ＋ Thêm kênh
          </button>
        </form>
      </div>
    </Card>
  );
}
