"use client";

// Thẻ "Giao việc" ở trang Kênh: dán bảng ý tưởng → đưa vào kho của kênh đang chọn (hoặc chia lần lượt các kênh) / chạy ngay cả bảng;
// hoặc chạy tự động các MV có sẵn. Video MV hay playlist do thứ tự sản xuất của kênh quyết định.

import { useEffect, useState } from "react";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import type { ChannelSummary } from "@/lib/channelTypes";
import { api } from "@/lib/client";
import type { BankConfig } from "@/lib/ideaBankTypes";
import type { ParseResult } from "@/lib/parser";
import type { AddResult, PipelineView } from "@/lib/pipelineSteps";
import type { IdeaRow } from "@/lib/types";

interface Candidate {
  id: string;
  idea_id: string;
  title: string;
  series: string;
  shot_count: number;
  clip_count: number;
  audio: { name: string; duration: number } | null;
}

export interface AssignSettings {
  mode: "claude" | "mock" | "manual";
  museMode: "gateway" | "haohao";
  minShots: number;
  maxShots: number;
  videoMinutes: number;
}

export function AssignCard({
  channels,
  target,
  onTarget,
  settings,
  bankConfig,
  busyMvs,
  onChanged,
}: {
  channels: ChannelSummary[];
  /** Kênh nhận việc ("auto" = chia lần lượt các kênh đang bật). */
  target: string;
  onTarget: (id: string) => void;
  settings: AssignSettings | null;
  bankConfig: BankConfig | null;
  /** MV đang chạy trong dây chuyền (không chọn lại được). */
  busyMvs: Set<string>;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"ideas" | "mvs">("ideas");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mvs, setMvs] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (tab === "mvs" && !mvs) void api<{ mvs: Candidate[] }>("/api/render-queue").then((r) => setMvs(r.mvs), () => setMvs([]));
  }, [tab, mvs]);

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "";
  const where = target === "auto" ? "các kênh đang bật, chia lần lượt (dòng có cột Kênh thì theo cột đó)" : `kênh “${channelName(target)}”`;
  const range = settings ? (settings.minShots === settings.maxShots ? `${settings.minShots}` : `${settings.minShots}–${settings.maxShots}`) : "20–30";
  const order = (() => {
    const c = channels.find((x) => x.id === target);
    if (!c) return "• Mỗi kênh làm theo thứ tự sản xuất riêng (MV một bài / playlist — xem bảng Các kênh).";
    return c.mvPerRound
      ? `• Thứ tự của kênh: mỗi vòng ${c.mvPerRound} MV một bài rồi 1 playlist; video tiếp theo: ${c.next.kind === "mv" ? `MV ${c.next.index}/${c.mvPerRound}${c.next.song ? ` (bài “${c.next.song}”)` : ""}` : "playlist"}.`
      : `• Kênh chỉ làm playlist ~${settings?.videoMinutes ?? 60} phút.`;
  })();

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addToBank(ideas: IdeaRow[]) {
    const lines = [
      `• Vào kho của ${where}.`,
      bankConfig?.feed ? `• Dây chuyền tự lấy lần lượt đều các kênh, mỗi lúc ${bankConfig.ahead} video.` : "• “Tự lấy việc” đang tắt (trang Dây chuyền): ý tưởng nằm chờ trong kho.",
      order,
      settings?.mode === "mock" ? "• Chế độ Demo: kịch bản ghép từ mẫu (không tốn phí)." : "• Mỗi video: Claude viết kịch bản (khoảng 0,10–0,30 USD qua API).",
      `• Mỗi video ${range} cảnh = ${range} lượt Muse.`,
    ];
    if (!confirm(`Đưa ${ideas.length} ý tưởng vào kho?\n\n${lines.join("\n")}`)) return;
    await run(async () => {
      const r = await api<{ added: number; duplicates: number }>("/api/ideas", { method: "POST", json: { action: "add", ideas, channel: target } });
      setNotice(`Đã thêm ${r.added} ý tưởng vào kho${r.duplicates ? ` (bỏ qua ${r.duplicates} ý tưởng đã có)` : ""}.`);
      setParsed(null);
      onChanged();
    });
  }

  async function start(payload: { ideas?: IdeaRow[]; mvIds?: string[] }) {
    const ideas = payload.ideas?.length ?? 0;
    const chosen = (mvs ?? []).filter((m) => payload.mvIds?.includes(m.id));
    const shots = chosen.reduce((n, m) => n + Math.max(0, m.shot_count - m.clip_count), 0);
    const lines = [
      ideas ? (settings?.mode === "mock" ? `• Chế độ Demo ghép ${ideas} kịch bản từ mẫu (không tốn phí).` : `• Claude viết ${ideas} kịch bản (khoảng 0,10–0,30 USD mỗi video qua API).`) : "",
      ideas ? `• Mỗi video mới ${range} cảnh = ${range} lượt Muse.` : "",
      chosen.length ? `• ${chosen.length} video có sẵn: khoảng ${shots} cảnh thiếu clip = ${shots} lượt Muse.` : "",
      `• Kênh: ${target === "auto" ? "chia lần lượt các kênh đang bật (kênh ít video nhất trước; dòng có cột Kênh thì theo cột đó)" : channelName(target)}.`,
      ideas ? order : "",
      `• Nhạc: MV một bài ghép đúng bài đã chọn; playlist tự xếp bài kiểu Bokin cho đủ khoảng ${settings?.videoMinutes ?? 60} phút. Đủ clip + có nhạc thì tự dựng MP4.`,
    ].filter(Boolean);
    const muse = settings?.museMode === "gateway" ? "Lượt Muse tính vào hạn mức tuần của tài khoản Meta." : "Đang dùng cách dán tay vào HaoHao: bước Clip Muse chờ bạn dán prompt ở trang Clip Muse.";
    if (!confirm(`Chạy tự động ${ideas + chosen.length} việc?\n\n${lines.join("\n")}\n\n${muse}`)) return;
    await run(async () => {
      const r = await api<PipelineView & AddResult>("/api/pipeline", { method: "POST", json: { action: "add", ...payload, channel: target } });
      const skip = r.skipped.length
        ? ` Bỏ qua ${r.skipped.length} việc (tránh làm trùng MV, trùng nhạc): ${r.skipped
            .slice(0, 8)
            .map((s) => `${s.title} — ${s.reason}`)
            .join("; ")}${r.skipped.length > 8 ? "; …" : ""}.`
        : "";
      setNotice(`Đã thêm ${r.added} việc vào dây chuyền (xem ở trang Dây chuyền).${skip}`);
      setParsed(null);
      setSelected(new Set());
      onChanged();
    });
  }

  return (
    <Card
      title="Giao việc"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            Kênh:
            <select className="input w-auto py-0.5 text-xs" value={target} onChange={(e) => onTarget(e.target.value)} data-testid="assign-target">
              <option value="auto">Chia lần lượt các kênh</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : " (đang tắt)"}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            <button className={`btn-sm ${tab === "ideas" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("ideas")}>
              Từ ý tưởng
            </button>
            <button className={`btn-sm ${tab === "mvs" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("mvs")}>
              Từ MV có sẵn
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <ErrorBox error={error} />
        {notice && <p className="text-xs font-semibold text-mint-dark">{notice}</p>}
        {tab === "ideas" ? (
          <>
            <p className="text-xs text-muted">
              Dán bảng ý tưởng như ở trang Nhập ý tưởng (mỗi dòng: id | địa điểm + năm | chủ đề | dàn ý | …; copy thẳng từ Google Docs / Sheets cũng được; bảng có
              dòng tiêu đề thì thêm cột <b>Kênh</b> = tên kênh, dòng đó thuộc kênh đó). Dàn ý ghi rõ nhân vật (cặp đôi, gia đình, trẻ em… hoặc “Chỉ cảnh, không nhân vật
              chính”). Nhạc không cần ghi: MV một bài tự chọn bài, playlist tự xếp bài. <b>Đưa vào kho</b>: vào kho của kênh đã chọn (hoặc chia lần lượt), dây
              chuyền lấy dần lần lượt đều các kênh. <b>Chạy ngay</b>: đưa cả bảng vào dây chuyền một lúc.
            </p>
            <textarea
              className="input min-h-28 font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="1 | Rockefeller Center Christmas Eve 1955 | T02 | Cặp đôi trẻ trượt băng dưới cây thông khổng lồ"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-ghost btn-sm" disabled={busy || !text.trim()} onClick={() => void run(async () => setParsed(await api<ParseResult>("/api/parse", { method: "POST", json: { text } })))}>
                Đọc bảng
              </button>
              {parsed && (
                <>
                  <button className="btn-primary" disabled={busy || !parsed.rows.length} onClick={() => void addToBank(parsed.rows)} data-testid="assign-bank-ideas">
                    {busy && <Spinner />} ＋ Đưa {parsed.rows.length} ý tưởng vào kho
                  </button>
                  <button className="btn-ghost" disabled={busy || !parsed.rows.length} onClick={() => void start({ ideas: parsed.rows })} data-testid="assign-start-ideas">
                    ▶ Chạy ngay cả {parsed.rows.length} ý tưởng
                  </button>
                </>
              )}
            </div>
            {parsed && (
              <div>
                {parsed.warnings.length > 0 && <ErrorBox error={parsed.warnings.join(" · ")} />}
                <ul className="mt-2 space-y-0.5">
                  {parsed.rows.map((r) => (
                    <li key={r.id}>
                      <b>#{r.id}</b> {r.song_title ? `“${r.song_title}” · ` : ""}
                      {r.world_location} · {r.theme_code}
                      {r.channel && <span className="badge ml-1">📺 {r.channel}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : !mvs ? (
          <Spinner />
        ) : !mvs.length ? (
          <p className="text-muted">Chưa có MV nào.</p>
        ) : (
          <>
            <div className="max-h-[24rem] overflow-auto rounded-lg border border-ink/15">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-cream-dark text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="w-8 px-2 py-1.5"></th>
                    <th className="px-2 py-1.5">MV</th>
                    <th className="px-2 py-1.5">Clip</th>
                    <th className="px-2 py-1.5">Bài hát</th>
                  </tr>
                </thead>
                <tbody>
                  {mvs.map((m) => (
                    <tr key={m.id} className="border-t border-ink/10">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          disabled={busyMvs.has(m.id)}
                          title={busyMvs.has(m.id) ? "Đang chạy trong dây chuyền" : ""}
                          checked={selected.has(m.id)}
                          onChange={() =>
                            setSelected((cur) => {
                              const next = new Set(cur);
                              if (next.has(m.id)) next.delete(m.id);
                              else next.add(m.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="font-semibold">
                          #{m.idea_id} · {m.title}
                        </span>
                        {m.series && <div className="text-xs text-muted">{m.series}</div>}
                      </td>
                      <td className="px-2 py-1.5">
                        {m.clip_count}/{m.shot_count}
                      </td>
                      <td className="px-2 py-1.5">{m.audio ? "✓" : <span className="text-muted">chưa có</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-primary" disabled={busy || !selected.size} onClick={() => void start({ mvIds: [...selected] })} data-testid="assign-start-mvs">
              {busy && <Spinner />} ▶ Chạy tự động {selected.size} MV
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
