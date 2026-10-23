// DÂY CHUYỀN TỰ ĐỘNG — mỗi việc là một video (có sẵn, hoặc viết từ một dòng ý tưởng) chạy qua 4 bước:
//   1. Kịch bản: Claude viết một vòng 20–30 cảnh (cần API key; chế độ Demo cũng chạy được) — làm lần lượt từng video.
//   2. Nhạc: video chưa có nhạc → lấy lần lượt các bài chưa dùng trong Thư mục nhạc (Cài đặt) cho đủ Độ dài video (~1 tiếng),
//      mỗi bài một bản, bỏ qua bản có chữ "đã dùng" và bản đã ghép vào video khác (sổ bài đã dùng, songsUsed.ts), nối thành
//      một file (playlist.ts) và đưa vào video.
//   3. Clip: gửi các cảnh chưa có clip sang Muse (Muse trong app), clip xong tự vào đúng cảnh (museJobs).
//   4. Dựng: đủ clip + có nhạc → thêm vào hàng chờ dựng (clip lặp lại cho hết nhạc), chạy, chờ ra MP4.
// Kho ý tưởng (ideaBank.ts): dây chuyền tự lấy dần ý tưởng chưa dùng, kho sắp hết thì nhờ Claude đề xuất thêm.
// Lưu ở data/pipeline.json; tắt app giữa chừng thì mở lại chạy tiếp. Chỉ dùng phía server.

import { promises as fs } from "node:fs";
import path from "node:path";
import { UserError } from "./errors";
import { generateMV, generationMode } from "./generate";
import { isSuggesting, markIdeasUsed, readBank, sameIdea, songCheck, startSuggest, takeIdeas, waitingForMusic } from "./ideaBank";
import { addPlaylistAudio, loadProject, mediaDir } from "./media";
import { museCounts } from "./muse";
import { ensureMuseWatch, readMuse, sendToMuse } from "./museJobs";
import { buildPlaylistAudio, libraryHooks, minutesLabel, pickPlaylist, songDurations } from "./playlist";
import { addToQueue, readQueue, startQueue } from "./queue";
import { isRendering } from "./render";
import { listSongs } from "./songs";
import { readUsedSongs, recordUsedSongs, takenBy } from "./songsUsed";
import type { AddResult, PipelineItem, PipelineState, PipelineStep, PipelineView, StepName } from "./pipelineSteps";
import { PIPELINE_FILE, listMVs, loadMV, readJson, readSettings, withLock, writeJson } from "./store";
import type { IdeaRow } from "./types";

const POLL_MS = 5000;
const IDLE_MS = 30000;

// Trạng thái trong tiến trình: vòng chạy, việc đang viết kịch bản (mỗi lúc một MV), hàm đánh thức vòng chạy đang nghỉ.
const g = globalThis as unknown as {
  __mvPipeline?: { loop: Promise<void> | null; again: boolean; wake: (() => void) | null; generating: string | null; error: string | null };
};
const mem = (g.__mvPipeline ??= { loop: null, again: false, wake: null, generating: null, error: null });

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

/**
 * Thêm việc: MV có sẵn và / hoặc ý tưởng mới. Bỏ qua MV đang chạy dở trong dây chuyền, và ý tưởng đã có MV hoặc đang chạy
 * (tránh hai MV cùng ý tưởng — cùng bài nhạc). Ý tưởng thêm vào mà cũng có trong kho thì được đánh dấu đã dùng ở kho.
 */
export async function addToPipeline(input: { mvIds?: string[]; ideas?: IdeaRow[] }): Promise<AddResult> {
  const mvIds = input.mvIds ?? [];
  const ideas = input.ideas ?? [];
  if (!mvIds.length && !ideas.length) throw new UserError("Chưa chọn MV hay ý tưởng nào.");
  const settings = await readSettings();
  if (ideas.length && generationMode(settings) === "manual") {
    throw new UserError("Tự viết kịch bản cần Claude API key: vào Cài đặt → “API key của Claude” (hoặc chọn chế độ Demo để thử). Ở chế độ claude.ai thì viết kịch bản như hiện nay rồi chọn MV có sẵn.");
  }
  const now = new Date().toISOString();
  const items: PipelineItem[] = [];
  for (const id of mvIds) {
    const mv = await loadMV(id);
    if (!mv) throw new UserError(`Không tìm thấy MV ${id}.`, 404);
    items.push({ id: newId(), title: mv.idea.song_title || mv.idea.world_location, added_at: now, mv_id: id, steps: { ...fresh(), script: { status: "done", message: `${mv.shots.length} cảnh (có sẵn)` } } });
  }
  for (const idea of ideas) items.push({ id: newId(), title: idea.song_title || idea.world_location, added_at: now, idea, steps: fresh() });
  const made = ideas.length ? new Set((await listMVs()).map((m) => sameIdea(m.idea))) : new Set<string>();
  const result = await updatePipeline((st) => {
    const open = st.items.filter((i) => !finished(i));
    const busy = new Set(open.flatMap((i) => (i.mv_id ? [i.mv_id] : [])));
    const running = new Set(open.flatMap((i) => (i.idea ? [sameIdea(i.idea)] : [])));
    const take: PipelineItem[] = [];
    const skipped: AddResult["skipped"] = [];
    for (const it of items) {
      const key = it.idea ? sameIdea(it.idea) : null;
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

  // 2. Nhạc: danh sách nhạc ghép từ các bài chưa dùng cho đủ Độ dài video.
  if (project.audio) {
    const n = project.audio.tracks?.length ?? 0;
    if (steps.song.status !== "done") steps.song = { status: "done", message: n > 1 ? `${n} bài · ${minutesLabel(project.audio.duration)}` : project.audio.name };
  } else if (!settings.songDir.trim()) {
    steps.song = { status: "waiting", message: "Chưa có nhạc — tải lên ở trang Ghép video, hoặc đặt “Thư mục nhạc” trong Cài đặt để app tự ghép danh sách nhạc." };
  } else if (!isRendering(mv.id)) {
    const title = `${/^\d+$/.test(mv.idea.id) ? `#${mv.idea.id} · ` : ""}${mv.idea.song_title || item.title}`;
    try {
      // Sổ bài đã dùng: bài đã ghép vào video khác thì không lấy lại (dù tên file chưa ghi "đã dùng").
      const used = await readUsedSongs();
      const target = settings.videoMinutes * 60;
      const pick = pickPlaylist(await songDurations(await listSongs(settings.songDir.trim())), target, { first: mv.idea.song_title, taken: takenBy(used, mv.id) });
      if (!pick.enough) {
        steps.song = {
          status: "waiting",
          message: pick.songs.length
            ? `Chưa đủ nhạc: các bài chưa dùng trong thư mục nhạc chỉ có ${minutesLabel(pick.available)} (${pick.songs.length} bài), cần khoảng ${minutesLabel(target)} — thêm bài (hoặc đồng bộ kho nhạc từ Drive), hoặc giảm “Độ dài video” trong Cài đặt.`
            : "Thư mục nhạc không còn bài nào chưa dùng (mọi bài đã ghi “đã dùng” hoặc đã ghép vào video khác) — thêm bài mới, hoặc tải nhạc lên ở trang Ghép video.",
        };
      } else {
        await fs.mkdir(mediaDir(mv.id), { recursive: true });
        const tmp = path.join(mediaDir(mv.id), `playlist-${Date.now().toString(36)}.flac`);
        try {
          const tracks = await buildPlaylistAudio(pick.songs, tmp, await libraryHooks());
          const name = pick.songs.length === 1 ? path.basename(pick.songs[0].file) : `Danh sách nhạc ${pick.songs.length} bài.flac`;
          await addPlaylistAudio(mv.id, tmp, name, pick.songs.length > 1 ? tracks : []);
        } finally {
          await fs.rm(tmp, { force: true }).catch(() => undefined);
        }
        await recordUsedSongs(mv.id, pick.songs.map((s) => path.basename(s.file)), title);
        steps.song = { status: "done", message: `Tự ghép ${pick.songs.length} bài · ${minutesLabel(pick.total)}` };
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
 * Kho ý tưởng → dây chuyền: luôn giữ đủ `ahead` MV đang làm (chưa xong kịch bản hoặc chưa đủ clip — kể cả việc đang lỗi,
 * để khi API key / Muse hỏng thì không lấy dồn cả kho). Kho sắp hết → nhờ Claude đề xuất thêm (chạy nền).
 * Trả về true khi còn việc cần theo dõi (vừa thêm việc, hoặc Claude đang đề xuất).
 */
async function feedFromBank(): Promise<boolean> {
  const bank = await readBank();
  const cfg = bank.config;
  if (!cfg.feed || !bank.ideas.length) return false;
  const settings = await readSettings();
  if (generationMode(settings) === "manual") return false;
  const busy = (await readPipeline()).items.filter((i) => !finished(i) && (i.steps.script.status !== "done" || i.steps.clips.status !== "done")).length;
  // Bật "chỉ lấy ý tưởng khi đủ nhạc": chỉ lấy bấy nhiêu ý tưởng mà nhạc chưa dùng còn đủ (trừ video đang chờ ghép nhạc), còn lại chờ trong kho.
  const check = busy < cfg.ahead ? await songCheck(settings.songDir, cfg.needSong, settings.videoMinutes, await waitingForMusic()) : null;
  const ideas = busy < cfg.ahead ? await takeIdeas(cfg.ahead - busy, check ?? undefined) : [];
  if (ideas.length) await addToPipeline({ ideas });
  const left = bank.ideas.filter((x) => x.status === "new").length - ideas.length;
  const waiting = bank.ideas.some((x) => x.status === "proposed");
  if (cfg.suggest && left <= cfg.ahead && !waiting) startSuggest(() => ensurePipelineWatch());
  return ideas.length > 0 || isSuggesting();
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
  return { items: state.items, error: mem.error, generating: mem.generating };
}

/** Chờ việc viết kịch bản đang chạy xong (dùng cho test). */
export async function pipelineIdle(): Promise<void> {
  while (mem.generating) await new Promise((r) => setTimeout(r, 20));
}
