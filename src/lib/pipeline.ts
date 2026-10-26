// DÂY CHUYỀN TỰ ĐỘNG — mỗi việc là một video cho một KÊNH (có sẵn, hoặc viết từ một dòng ý tưởng) chạy qua 4 bước:
//   1. Kịch bản: Claude viết một vòng 20–30 cảnh (cần API key; chế độ Demo cũng chạy được) — làm lần lượt từng video.
//   2. Nhạc: video chưa có nhạc → tự xếp bài kiểu Bokin Playlist Studio theo lịch sử của kênh (channels.ts: bài cũ mức 2–3 nghỉ lâu
//      nhất + bài kênh chưa dùng, mức 3 mở đầu) cho đủ Độ dài video (~1 tiếng), từ kho nhạc chung (Kho bài hát.xlsx + Thư mục nhạc),
//      nối thành một file (playlist.ts), đưa vào video và ghi vào lịch sử kênh.
//   3. Clip: gửi các cảnh chưa có clip sang Muse (Muse trong app), clip xong tự vào đúng cảnh (museJobs).
//   4. Dựng: đủ clip + có nhạc → thêm vào hàng chờ dựng (clip lặp lại cho hết nhạc), chạy, chờ ra MP4.
// Phân luồng: việc mới thuộc kênh của ý tưởng; không ghi kênh thì giao cho kênh đang bật có ít video nhất (đang làm + đã xong).
// Kho ý tưởng (ideaBank.ts, mỗi kênh một kho): dây chuyền tự lấy dần ý tưởng, lần lượt đều các kênh; kho của kênh sắp hết thì nhờ Claude
// đề xuất thêm cho kênh đó. Lưu ở data/pipeline.json; tắt app giữa chừng thì mở lại chạy tiếp. Chỉ dùng phía server.

import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_CHANNEL_ID, type Channel } from "./channelTypes";
import { pickForLength, readChannels, recordChannelVideo, resolveChannel, routeChannel } from "./channels";
import { UserError } from "./errors";
import { generateMV, generationMode } from "./generate";
import { ideaChannel, ideaKey, isSuggesting, markIdeasUsed, readBank, songCheck, startSuggest, takeIdeas, waitingForMusic } from "./ideaBank";
import { addPlaylistAudio, loadProject, mediaDir } from "./media";
import { museCounts } from "./muse";
import { ensureMuseWatch, readMuse, sendToMuse } from "./museJobs";
import { loadMusicLibrary } from "./musicLibrary";
import { buildPlaylistAudio, minutesLabel } from "./playlist";
import { addToQueue, readQueue, startQueue } from "./queue";
import { isRendering } from "./render";
import type { AddResult, PipelineItem, PipelineState, PipelineStep, PipelineView, StepName } from "./pipelineSteps";
import { PIPELINE_FILE, listMVs, loadMV, readJson, readSettings, withLock, writeJson } from "./store";
import type { IdeaRow } from "./types";

const POLL_MS = 5000;
const IDLE_MS = 30000;
/** Cuối lời báo "chờ nhạc": chưa có nhạc không chặn kịch bản / clip. */
const CLIPS_GO_ON = " Kịch bản và clip Muse vẫn làm tiếp; kho có nhạc là app tự xếp bài rồi dựng.";

// Trạng thái trong tiến trình: vòng chạy, việc đang viết kịch bản (mỗi lúc một MV), hàm đánh thức vòng chạy đang nghỉ.
const g = globalThis as unknown as {
  __mvPipeline?: { loop: Promise<void> | null; again: boolean; wake: (() => void) | null; generating: string | null; error: string | null };
};
const mem = (g.__mvPipeline ??= { loop: null, again: false, wake: null, generating: null, error: null });

/** Việc đang được Claude viết kịch bản (tự cập nhật chờ viết xong mới cài); null = không viết gì. */
export const scriptRunning = () => mem.generating;

export function readPipeline(): Promise<PipelineState> {
  return readJson<PipelineState>(PIPELINE_FILE(), { items: [] });
}

function updatePipeline<T>(fn: (s: PipelineState) => T | Promise<T>): Promise<T> {
  return withLock("pipeline", async () => {
    const s = await readPipeline();
    const result = await fn(s);
    await writeJson(PIPELINE_FILE(), s);
    return result;
  });
}

const newId = () => `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const fresh = (): Record<StepName, PipelineStep> => ({ script: { status: "pending" }, song: { status: "pending" }, clips: { status: "pending" }, render: { status: "pending" } });
const finished = (it: PipelineItem) => Boolean(it.done_at);
/** Kênh của một việc. */
export const itemChannel = (it: Pick<PipelineItem, "channel" | "idea">) => it.channel ?? it.idea?.channel ?? DEFAULT_CHANNEL_ID;

/** Số video của từng kênh (dùng để phân luồng): đã có danh sách nhạc (lịch sử kênh) + đang trong dây chuyền mà chưa có trong lịch sử. */
export function channelLoad(channels: Channel[], items: PipelineItem[]): Map<string, number> {
  const load = new Map(channels.map((c) => [c.id, c.history.length]));
  const recorded = new Set(channels.flatMap((c) => c.history.map((v) => v.id)));
  for (const it of items) {
    if (finished(it) || (it.mv_id && recorded.has(it.mv_id))) continue;
    const ch = itemChannel(it);
    load.set(ch, (load.get(ch) ?? 0) + 1);
  }
  return load;
}

/**
 * Thêm việc: MV có sẵn và / hoặc ý tưởng mới, cho kênh `channel` ("auto" = phân luồng: ý tưởng có kênh thì kênh đó, không thì kênh
 * đang bật có ít video nhất). Bỏ qua MV đang chạy dở trong dây chuyền, và ý tưởng kênh đó đã có MV hoặc đang chạy. Ý tưởng thêm vào
 * mà cũng có trong kho cùng kênh thì được đánh dấu đã dùng ở kho.
 */
export async function addToPipeline(input: { mvIds?: string[]; ideas?: IdeaRow[]; channel?: string }): Promise<AddResult> {
  const mvIds = input.mvIds ?? [];
  const ideas = input.ideas ?? [];
  if (!mvIds.length && !ideas.length) throw new UserError("Chưa chọn MV hay ý tưởng nào.");
  const settings = await readSettings();
  if (ideas.length && generationMode(settings) === "manual") {
    throw new UserError("Tự viết kịch bản cần Claude API key: vào Cài đặt → “API key của Claude” (hoặc chọn chế độ Demo để thử). Ở chế độ claude.ai thì viết kịch bản như hiện nay rồi chọn MV có sẵn.");
  }
  const channels = await readChannels();
  const chosen = input.channel && input.channel !== "auto" ? channels.find((c) => c.id === input.channel) : null;
  if (input.channel && input.channel !== "auto" && !chosen) throw new UserError("Không tìm thấy kênh.", 404);
  if (!chosen && !channels.some((c) => c.active)) throw new UserError("Chưa có kênh nào đang bật — bật một kênh ở thẻ Kênh.");
  const load = channelLoad(channels, (await readPipeline()).items);
  // Phân luồng từng việc (việc trước được tính vào số video của kênh khi chia việc sau).
  const route = (own?: string) => {
    const id = resolveChannel(channels, own) ?? chosen?.id ?? routeChannel(channels, load)?.id ?? DEFAULT_CHANNEL_ID;
    load.set(id, (load.get(id) ?? 0) + 1);
    return id;
  };
  const now = new Date().toISOString();
  const items: PipelineItem[] = [];
  for (const id of mvIds) {
    const mv = await loadMV(id);
    if (!mv) throw new UserError(`Không tìm thấy MV ${id}.`, 404);
    const own = channels.find((c) => c.history.some((v) => v.id === id))?.id ?? mv.idea.channel;
    items.push({ id: newId(), title: mv.idea.song_title || mv.idea.world_location, added_at: now, mv_id: id, channel: route(own), steps: { ...fresh(), script: { status: "done", message: `${mv.shots.length} cảnh (có sẵn)` } } });
  }
  for (const row of ideas) {
    const channel = route(row.channel);
    items.push({ id: newId(), title: row.song_title || row.world_location, added_at: now, idea: { ...row, channel }, channel, steps: fresh() });
  }
  const made = ideas.length ? new Set((await listMVs()).map((m) => ideaKey(m.idea))) : new Set<string>();
  const result = await updatePipeline((st) => {
    const open = st.items.filter((i) => !finished(i));
    const busy = new Set(open.flatMap((i) => (i.mv_id ? [i.mv_id] : [])));
    const running = new Set(open.flatMap((i) => (i.idea ? [ideaKey(i.idea, itemChannel(i))] : [])));
    const take: PipelineItem[] = [];
    const skipped: AddResult["skipped"] = [];
    for (const it of items) {
      const key = it.idea ? ideaKey(it.idea, itemChannel(it)) : null;
      const reason =
        it.mv_id && busy.has(it.mv_id)
          ? "MV đang chạy trong dây chuyền"
          : key && made.has(key)
            ? "ý tưởng này đã có MV"
            : key && running.has(key)
              ? "ý tưởng này đang chạy trong dây chuyền (hoặc trùng dòng khác trong bảng)"
              : null;
      if (reason) {
        skipped.push({ title: it.idea?.id && /^\d+$/.test(it.idea.id) ? `#${it.idea.id} · ${it.title}` : it.title, reason });
        continue;
      }
      take.push(it);
      if (key) running.add(key);
    }
    st.items.unshift(...take);
    return { added: take.length, skipped, ideas: take.flatMap((i) => (i.idea ? [i.idea] : [])) };
  });
  if (result.ideas.length) await markIdeasUsed(result.ideas);
  ensurePipelineWatch();
  return { added: result.added, skipped: result.skipped };
}

export function removeFromPipeline(id: string): Promise<void> {
  return updatePipeline((st) => {
    st.items = st.items.filter((i) => i.id !== id);
  });
}

export function clearFinishedPipeline(): Promise<void> {
  return updatePipeline((st) => {
    st.items = st.items.filter((i) => !finished(i));
  });
}

/** Chạy lại các bước lỗi của một việc (bước dựng: dựng lại; bước clip: gửi lại các cảnh còn thiếu clip — tốn lượt). */
export async function retryPipeline(id: string): Promise<void> {
  await updatePipeline((st) => {
    const it = st.items.find((i) => i.id === id);
    if (!it) return;
    for (const name of Object.keys(it.steps) as StepName[]) {
      if (it.steps[name].status !== "error") continue;
      it.steps[name] = { status: "pending" };
      if (name === "clips") it.clips_sent = false;
      if (name === "render") it.render_at = undefined;
    }
  });
  ensurePipelineWatch();
}

/**
 * Viết kịch bản cho một việc (chạy nền, mỗi lúc một video). Kịch bản là một vòng cảnh (Cài đặt → Độ dài một vòng cảnh), không theo
 * độ dài nhạc: khi dựng, vòng cảnh lặp lại cho hết danh sách nhạc.
 */
function startScript(item: PipelineItem) {
  mem.generating = item.id;
  void (async () => {
    try {
      const mv = await generateMV({ ...item.idea! });
      await patch(item.id, (it) => {
        it.mv_id = mv.id;
        it.steps.script = { status: "done", message: `${mv.shots.length} cảnh` };
      });
    } catch (err) {
      await patch(item.id, (it) => {
        it.steps.script = { status: "error", message: (err as Error).message };
      });
    } finally {
      mem.generating = null;
      ensurePipelineWatch();
    }
  })();
}

function patch(id: string, fn: (it: PipelineItem) => void): Promise<void> {
  return updatePipeline((st) => {
    const it = st.items.find((i) => i.id === id);
    if (it) fn(it);
  });
}

/** Một bước của một việc → trạng thái mới (đọc MV, bài hát, tiến độ Muse, hàng chờ dựng). */
async function advance(item: PipelineItem): Promise<Partial<PipelineItem> | null> {
  const settings = await readSettings();
  const steps = { ...item.steps };
  const out: Partial<PipelineItem> = {};

  // 1. Kịch bản
  if (!item.mv_id) {
    if (steps.script.status === "error") return null;
    if (generationMode(settings) === "manual") {
      steps.script = { status: "error", message: "Cần Claude API key để tự viết kịch bản (Cài đặt → API key của Claude)." };
    } else if (!mem.generating) {
      startScript(item);
      steps.script = { status: "running", message: "Claude đang viết kịch bản…" };
    } else if (mem.generating !== item.id) {
      steps.script = { status: "waiting", message: "Chờ tới lượt viết kịch bản" };
    }
    return { steps };
  }
  const mv = await loadMV(item.mv_id);
  if (!mv) return { steps: { ...steps, script: { status: "error", message: "MV đã bị xoá." } } };
  const project = await loadProject(mv.id);

  // 2. Nhạc: tự xếp bài kiểu Bokin theo lịch sử của kênh, cho đủ Độ dài video. Chưa có nhạc thì chỉ bước Dựng chờ —
  // kịch bản và clip Muse vẫn làm tiếp ("làm video trước, ghép nhạc sau"); kho có nhạc là lượt sau tự xếp bài.
  if (project.audio) {
    const n = project.audio.tracks?.length ?? 0;
    if (steps.song.status !== "done") steps.song = { status: "done", message: n > 1 ? `${n} bài · ${minutesLabel(project.audio.duration)}` : project.audio.name };
  } else if (!settings.songDir.trim()) {
    steps.song = { status: "waiting", message: `Chưa có nhạc — tải lên ở trang Ghép video, hoặc đặt “Thư mục nhạc” trong Cài đặt để app tự xếp danh sách nhạc.${CLIPS_GO_ON}` };
  } else if (!isRendering(mv.id)) {
    const title = `${/^\d+$/.test(mv.idea.id) ? `#${mv.idea.id} · ` : ""}${mv.idea.song_title || item.title}`;
    try {
      const lib = await loadMusicLibrary(settings.songDir, settings.songSheet);
      const channels = await readChannels();
      const ch = channels.find((c) => c.id === itemChannel(item)) ?? channels.find((c) => c.id === mv.idea.channel) ?? channels[0];
      const target = settings.videoMinutes * 60;
      // Lịch sử kênh không tính chính video này (ghép lại nhạc cho một video đã có trong lịch sử).
      const history = ch.history.filter((v) => v.id !== mv.id);
      const mix = pickForLength(lib.songs, history, { targetSec: target, oldPercent: ch.oldPercent, newOrder: ch.newOrder, seed: mv.id });
      if (!mix.enough) {
        steps.song = {
          status: "waiting",
          message: mix.picks.length
            ? `Chưa đủ nhạc cho kênh “${ch.name}”: kho chỉ có ${minutesLabel(mix.total)} (${mix.picks.length} bài dùng được), cần khoảng ${minutesLabel(target)} — thêm bài vào kho (hoặc đồng bộ kho nhạc từ Drive), hoặc giảm “Độ dài video” trong Cài đặt.${CLIPS_GO_ON}`
            : `Kho nhạc chưa có bài nào dùng được — thêm nhạc vào Thư mục nhạc (hoặc đồng bộ từ Drive), hoặc tải nhạc lên ở trang Ghép video.${CLIPS_GO_ON}`,
        };
      } else {
        await fs.mkdir(mediaDir(mv.id), { recursive: true });
        const tmp = path.join(mediaDir(mv.id), `playlist-${Date.now().toString(36)}.flac`);
        try {
          const tracks = await buildPlaylistAudio(mix.picks.map((p) => ({ ...p.version, title: p.song.title, code: p.song.code })), tmp);
          const name = mix.picks.length === 1 ? mix.picks[0].version.name : `Danh sách nhạc ${mix.picks.length} bài.flac`;
          await addPlaylistAudio(mv.id, tmp, name, mix.picks.length > 1 ? tracks : []);
        } finally {
          await fs.rm(tmp, { force: true }).catch(() => undefined);
        }
        const files = mix.picks.map((p) => p.version.name);
        await recordChannelVideo(ch.id, { id: mv.id, date: new Date().toISOString(), title, codes: mix.picks.map((p) => p.song.code), files });
        const old = mix.picks.filter((p) => p.role === "old").length;
        const warn = mix.warnings.length ? ` · ⚠ ${mix.warnings.join(" ")}` : "";
        steps.song = { status: "done", message: `Kênh “${ch.name}”: tự xếp ${mix.picks.length} bài (${old} cũ + ${mix.picks.length - old} mới) · ${minutesLabel(mix.total)}${warn}` };
      }
    } catch (err) {
      steps.song = { status: "error", message: (err as Error).message };
    }
  }

  // 3. Clip Muse (cảnh lỗi đã bỏ qua không tính là thiếu: khi dựng, đoạn của cảnh đó mượn / lặp cảnh khác)
  const tracked = (await readMuse()).mvs.find((x) => x.mv_id === mv.id);
  const skipped = new Set((tracked?.shots ?? []).filter((s) => s.status === "skipped").map((s) => s.shot_no));
  const lacking = mv.shots.filter((s) => !project.clips[String(s.shot_no)]);
  const missing = lacking.filter((s) => !skipped.has(s.shot_no)).length;
  if (!missing) {
    const gaps = lacking.map((s) => `#${s.shot_no}`);
    steps.clips = { status: "done", message: gaps.length ? `Đủ clip (bỏ qua ${gaps.length} cảnh lỗi: ${gaps.join(", ")})` : `Đủ ${mv.shots.length} clip` };
  } else if (settings.museMode !== "gateway") {
    steps.clips = { status: "waiting", message: `Thiếu ${missing} clip — đang dùng cách dán tay vào HaoHao: vào trang Clip Muse để copy prompt.` };
  } else if (steps.clips.status !== "error" || item.clips_sent) {
    // Gửi không được (chưa gửi) thì giữ lỗi, không tự gửi lại; cảnh lỗi bên Muse thì cập nhật theo tiến độ
    // (app có thể đang tự kiểm tra lại / tự bỏ qua).
    if (!item.clips_sent) {
      try {
        const r = await sendToMuse([mv.id], { onlyMissing: true });
        out.clips_sent = true;
        steps.clips = { status: "running", message: `Đã gửi ${r.count} cảnh sang Muse${r.reused ? `, nhận lại ${r.reused} video có sẵn` : ""}` };
      } catch (err) {
        // Các cảnh thiếu clip đều đang được Muse làm → coi như đã gửi.
        if (/đang được Muse làm/.test((err as Error).message)) out.clips_sent = true;
        else steps.clips = { status: "error", message: (err as Error).message };
      }
    } else {
      const c = tracked ? museCounts(tracked) : null;
      if (c && c.error && !c.active && !c.waiting) {
        steps.clips = { status: "error", message: `${c.error} cảnh lỗi — vào trang Clip Muse để “Kiểm tra lại” (không tốn lượt), “Gửi lại” hoặc “Bỏ qua cảnh lỗi & dựng”.` };
      } else {
        steps.clips = { status: "running", message: `${mv.shots.length - missing}/${mv.shots.length} cảnh có clip${c?.error ? ` · ${c.error} lỗi` : ""}` };
      }
      ensureMuseWatch(false);
    }
  }

  // 4. Dựng
  if (steps.song.status === "done" && steps.clips.status === "done" && steps.render.status !== "error") {
    const queue = await readQueue();
    const q = queue.items.filter((i) => i.mv_id === mv.id && i.added_at >= item.added_at).sort((a, b) => b.added_at.localeCompare(a.added_at))[0];
    if (!item.render_at && !q) {
      await addToQueue([mv.id]);
      await startQueue();
      out.render_at = new Date().toISOString();
      steps.render = { status: "running", message: "Đã thêm vào hàng chờ dựng" };
    } else if (!q || q.status === "waiting") {
      out.render_at ??= item.render_at ?? new Date().toISOString();
      if (q && !queue.running) await startQueue();
      steps.render = { status: "running", message: "Đang chờ tới lượt dựng" };
    } else if (q.status === "running") {
      steps.render = { status: "running", message: "Đang dựng MP4…" };
    } else if (q.status === "done") {
      steps.render = { status: "done", message: q.output };
      out.output = q.output;
      // Ảnh bìa + tiêu đề + thư mục kết quả của lần dựng này (tạo ngay sau khi dựng).
      const r = project.renders.find((x) => x.file === q.output);
      if (r?.cover) out.cover = r.cover;
      if (r?.youtube_info) out.info = r.youtube_info;
      if (r?.tags?.title) out.yt_title = r.tags.title;
      if (r?.result_dir) out.result_dir = r.result_dir;
      out.done_at = new Date().toISOString();
    } else {
      steps.render = { status: "error", message: q.message || "Dựng không thành công." };
    }
  }
  return { ...out, steps };
}

/**
 * Kho ý tưởng → dây chuyền: luôn giữ đủ `ahead` video đang làm (cả các kênh; chưa xong kịch bản hoặc chưa đủ clip — kể cả việc đang
 * lỗi, để khi API key / Muse hỏng thì không lấy dồn cả kho). Phân luồng lần lượt đều các kênh: mỗi lần lấy một ý tưởng của kênh đang
 * bật có ít video nhất (kênh hết ý tưởng, hoặc hết bài mới khi bật "chỉ lấy khi còn bài mới", thì nhường kênh sau). Kho của kênh sắp
 * hết → nhờ Claude đề xuất thêm cho kênh đó (chạy nền, mỗi lần một kênh). Trả về true khi còn việc cần theo dõi.
 */
async function feedFromBank(): Promise<boolean> {
  const bank = await readBank();
  const cfg = bank.config;
  if (!cfg.feed || !bank.ideas.length) return false;
  const settings = await readSettings();
  if (generationMode(settings) === "manual") return false;
  const items = (await readPipeline()).items;
  const busy = items.filter((i) => !finished(i) && (i.steps.script.status !== "done" || i.steps.clips.status !== "done")).length;
  const channels = (await readChannels()).filter((c) => c.active);
  const load = channelLoad(channels, items);
  const skip = new Set<string>();
  let added = 0;
  for (let free = cfg.ahead - busy; free > 0; ) {
    const ch = routeChannel(channels, load, skip);
    if (!ch) break;
    // Bật "chỉ lấy ý tưởng khi còn bài mới": chỉ lấy khi bài kênh chưa dùng còn đủ cho thêm một video (trừ video của kênh đang chờ nhạc).
    const check = await songCheck(settings, cfg.needSong, ch.id, await waitingForMusic(ch.id));
    const [idea] = await takeIdeas(1, check ?? undefined, ch.id);
    if (!idea) {
      skip.add(ch.id);
      continue;
    }
    await addToPipeline({ ideas: [idea], channel: ch.id });
    load.set(ch.id, (load.get(ch.id) ?? 0) + 1);
    free--;
    added++;
  }
  if (cfg.suggest && !isSuggesting()) {
    // Kênh còn ít ý tưởng chưa dùng nhất (≤ ahead) và không có đề xuất đang chờ duyệt → Claude đề xuất cho kênh đó.
    const ideas = (await readBank()).ideas;
    const left = (id: string) => ideas.filter((x) => ideaChannel(x) === id && x.status === "new").length;
    const low = channels
      .filter((c) => left(c.id) <= cfg.ahead && !ideas.some((x) => ideaChannel(x) === c.id && x.status === "proposed"))
      .sort((a, b) => left(a.id) - left(b.id))[0];
    if (low) startSuggest(() => ensurePipelineWatch(), false, low.id);
  }
  return added > 0 || isSuggesting();
}

/** Một lượt chạy: lấy thêm ý tưởng từ kho, đẩy từng việc chưa xong qua bước kế tiếp. Trả về nhịp chạy tiếp (null = không còn gì để chạy). */
export function pipelineTick(): Promise<"fast" | "slow" | null> {
  return withLock("pipeline-tick", async () => {
    const feeding = await feedFromBank().catch((err) => {
      mem.error = (err as Error).message;
      return false;
    });
    const state = await readPipeline();
    for (const item of state.items.filter((i) => !finished(i))) {
      try {
        const next = await advance(item);
        if (next) await patch(item.id, (it) => Object.assign(it, next, { steps: { ...it.steps, ...next.steps } }));
      } catch (err) {
        mem.error = (err as Error).message;
      }
    }
    const open = (await readPipeline()).items.filter((i) => !finished(i));
    const active = open.some((i) => Object.values(i.steps).some((s) => s.status === "running" || s.status === "pending"));
    if (active || mem.generating || feeding) return "fast";
    // Chỉ còn việc chờ bài hát / chờ người dùng xử lý lỗi → dò thưa.
    return open.some((i) => Object.values(i.steps).some((s) => s.status === "waiting")) ? "slow" : null;
  });
}

/** Bật vòng chạy nền (nếu chưa chạy). `wake` = đang nghỉ thì chạy ngay. */
export function ensurePipelineWatch(wake = true): void {
  if (process.env.PIPELINE_NO_WATCH) return; // test tự gọi pipelineTick từng lượt
  if (mem.loop) {
    if (wake) {
      mem.again = true;
      mem.wake?.();
    }
    return;
  }
  mem.loop = (async () => {
    try {
      for (;;) {
        mem.again = false;
        const pace = await pipelineTick().catch((err) => {
          console.error("[pipeline]", err);
          mem.error = (err as Error).message;
          return "fast" as const;
        });
        if (!pace && !mem.again) return;
        if (mem.again) continue;
        await new Promise<void>((r) => {
          const t = setTimeout(r, pace === "slow" ? IDLE_MS : POLL_MS);
          mem.wake = () => {
            clearTimeout(t);
            r();
          };
        });
        mem.wake = null;
      }
    } finally {
      mem.loop = null;
      mem.wake = null;
    }
  })();
}

export async function pipelineView(): Promise<PipelineView> {
  const state = await readPipeline();
  const bank = await readBank();
  if (state.items.some((i) => !finished(i)) || (bank.config.feed && bank.ideas.some((x) => x.status === "new"))) ensurePipelineWatch(false);
  const channels = (await readChannels()).map((c) => ({ id: c.id, name: c.name, active: c.active }));
  return { items: state.items, error: mem.error, generating: mem.generating, channels };
}

/** Chờ việc viết kịch bản đang chạy xong (dùng cho test). */
export async function pipelineIdle(): Promise<void> {
  while (mem.generating) await new Promise((r) => setTimeout(r, 20));
}
