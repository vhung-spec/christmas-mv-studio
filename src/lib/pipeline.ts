// DÂY CHUYỀN TỰ ĐỘNG — mỗi việc là một video cho một KÊNH (có sẵn, hoặc viết từ một dòng ý tưởng) chạy qua 4 bước:
//   1. Kịch bản: Claude viết một vòng 20–30 cảnh (cần API key; chế độ Demo cũng chạy được) — làm lần lượt từng video.
//   2. Nhạc: video chưa có nhạc → tự xếp bài kiểu Bokin Playlist Studio theo lịch sử của kênh (channels.ts: bài cũ mức 2–3 nghỉ lâu
//      nhất + bài kênh chưa dùng, mức 3 mở đầu) cho đủ Độ dài video (~1 tiếng), từ kho nhạc chung (Kho bài hát.xlsx + Thư mục nhạc),
//      nối thành một file (playlist.ts), đưa vào video và ghi vào lịch sử kênh.
//   3. Clip: gửi các cảnh chưa có clip sang Muse (Muse trong app), clip xong tự vào đúng cảnh (museJobs).
//   4. Dựng: đủ clip + có nhạc → thêm vào hàng chờ dựng (clip lặp lại cho hết nhạc), chạy, chờ ra MP4.
// Phân luồng: việc mới thuộc kênh của ý tưởng; không ghi kênh thì giao cho kênh đang bật có ít video nhất (đang làm + đã xong).
// Thứ tự sản xuất của kênh (channels.ts): mỗi vòng N MV một bài rồi 1 playlist. Cả hai là các cảnh Giáng sinh nối tiếp nhau (ý tưởng
// trong kho của kênh — Giáng sinh ở một vùng đất, thường "chỉ cảnh"), kịch bản là một vòng cảnh nên làm ngay, không chờ nhạc. MV chọn
// bài lúc ghép nhạc: bài Giáng sinh mức hay cao nhất kênh chưa dùng, tên bài đứng đầu tiêu đề YouTube. Playlist cuối vòng mở đầu bằng
// các bài vừa có MV. Việc thêm trước làm trước; nhạc của kênh ghép đúng thứ tự (playlist chờ các MV của vòng, MV vòng sau chờ playlist
// vòng trước) để lịch sử kênh đúng vòng.
// Làm sẵn: mỗi kênh luôn có N video chưa đăng (đã làm + đang làm); bấm "Đã đăng" thì dây chuyền làm bù.
// Kho ý tưởng (ideaBank.ts, mỗi kênh một kho): dây chuyền tự lấy dần ý tưởng, lần lượt đều các kênh chưa đủ video làm sẵn; kho của kênh
// sắp hết (kể cả kho trống) thì nhờ Claude nghĩ thêm cho kênh đó. Lưu ở data/pipeline.json; tắt app giữa chừng thì mở lại chạy tiếp.
// Chỉ dùng phía server.

import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_CHANNEL_ID, type Channel, type VideoKind } from "./channelTypes";
import { channelSequence, nextVideo, pickForLength, pickMvSong, readChannels, recordChannelVideo, resolveChannel, routeChannel, key as songKey, type SeqEntry } from "./channels";
import { UserError } from "./errors";
import { generateMV, generationMode } from "./generate";
import { ideaChannel, ideaKey, isSuggesting, markIdeasUsed, readBank, songCheck, startSuggest, takeIdeas, waitingForMusic } from "./ideaBank";
import { addPlaylistAudio, loadProject, mediaDir } from "./media";
import { museCounts } from "./muse";
import { ensureMuseWatch, readMuse, sendToMuse } from "./museJobs";
import { loadMusicLibrary, type LibSong } from "./musicLibrary";
import { buildPlaylistAudio, chapterTime, minutesLabel } from "./playlist";
import { addToQueue, readQueue, startQueue } from "./queue";
import { isRendering } from "./render";
import type { AddResult, PipelineItem, PipelineState, PipelineStep, PipelineView, StepName } from "./pipelineSteps";
import { PIPELINE_FILE, listMVs, loadMV, readJson, readSettings, saveMV, withLock, writeJson } from "./store";
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

const kindOf = (it: PipelineItem): VideoKind => it.kind ?? it.idea?.video_kind ?? "playlist";
/**
 * Theo thứ tự sản xuất: việc thêm trước đứng trước — theo số thứ tự lúc thêm (việc thêm từ trước khi có số thứ tự đứng trước, theo giờ
 * thêm; cùng một lần thêm thì theo thứ tự trong bảng, như trong pipeline.json).
 */
const inOrder = (items: PipelineItem[]) => [...items].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.added_at.localeCompare(b.added_at));

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
 * Video chưa đăng của từng kênh (làm sẵn): mọi video còn trong dây chuyền (đang làm hoặc đã xong) mà chưa bấm "Đã đăng", và video đã
 * xếp nhạc ghi "chưa đăng" trong lịch sử kênh. Video từ trước khi có phần làm sẵn mà không còn trong dây chuyền coi như đã đăng.
 */
export function channelStock(channels: Channel[], items: PipelineItem[]): Map<string, number> {
  const stock = new Map<string, number>();
  for (const c of channels) {
    const posted = new Set(c.history.filter((v) => v.posted === true).map((v) => v.id));
    const ids = new Set(c.history.filter((v) => v.posted === false).map((v) => v.id));
    for (const it of items) if (itemChannel(it) === c.id && !(it.mv_id && posted.has(it.mv_id))) ids.add(it.mv_id ?? it.id);
    stock.set(c.id, ids.size);
  }
  return stock;
}

// ---------- Thứ tự sản xuất: MV một bài / playlist ----------

/** Video tiếp theo của một kênh: MV thứ mấy trong vòng (bài chọn lúc ghép nhạc), hoặc playlist cuối vòng. */
export type PlannedVideo = { kind: "mv"; index: number } | { kind: "playlist"; index: 0 };

export interface Planner {
  plan(channelId: string): PlannedVideo;
  /** Ghi nhận việc vừa thêm cho kênh (các việc thêm sau trong cùng lượt tính tiếp từ đó). */
  note(channelId: string, entry: SeqEntry): void;
}

/** Lập kế hoạch theo lịch sử từng kênh + các việc đang làm chưa có trong lịch sử kênh (theo thứ tự sản xuất). */
export function planner(channels: Channel[], items: PipelineItem[]): Planner {
  const recorded = new Set(channels.flatMap((c) => c.history.map((v) => v.id)));
  const open = new Map<string, SeqEntry[]>();
  const pending = inOrder(items.filter((i) => !finished(i) && !(i.mv_id && recorded.has(i.mv_id))));
  for (const it of pending) {
    const ch = itemChannel(it);
    open.set(ch, [...(open.get(ch) ?? []), { kind: kindOf(it), codes: it.idea?.mv_song ? [it.idea.mv_song.code] : [] }]);
  }
  return {
    plan(id) {
      const ch = channels.find((c) => c.id === id) ?? channels[0];
      const next = nextVideo(channelSequence(ch.history, open.get(ch.id) ?? []), ch.mvPerRound);
      return next.kind === "mv" ? { kind: "mv", index: next.index } : { kind: "playlist", index: 0 };
    },
    note(id, entry) {
      open.set(id, [...(open.get(id) ?? []), entry]);
    },
  };
}

/** Vòng cảnh của MV một bài (giây): ngắn hơn một bài Giáng sinh (~3–4 phút) để clip nào cũng được dùng — cuối bài lặp lại vài cảnh. */
const MV_LOOP_SEC = 180;

/** Ý tưởng MV một bài: kịch bản là một vòng cảnh (không theo bài nào), bài chọn lúc ghép nhạc. */
function asMv(idea: IdeaRow, loopSec: number): IdeaRow {
  return { ...idea, video_kind: "mv", duration_sec: Math.min(loopSec, MV_LOOP_SEC) };
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
  if (!chosen && !channels.some((c) => c.active)) throw new UserError("Chưa có kênh nào đang bật — bật một kênh ở trang Kênh.");
  const current = (await readPipeline()).items;
  const load = channelLoad(channels, current);
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
    items.push({
      id: newId(),
      title: mv.idea.song_title || mv.idea.world_location,
      added_at: now,
      mv_id: id,
      channel: route(own),
      kind: mv.idea.video_kind === "mv" ? "mv" : "playlist",
      steps: { ...fresh(), script: { status: "done", message: `${mv.shots.length} cảnh (có sẵn)` } },
    });
  }
  // Ý tưởng mới: MV một bài hay playlist theo thứ tự sản xuất của kênh (MV giữ luôn bài). Ý tưởng sẽ bị bỏ qua (đã có MV, đang chạy,
  // trùng dòng khác) không tính vào thứ tự, để không giữ mất bài của MV.
  const made = ideas.length ? new Set((await listMVs()).map((m) => ideaKey(m.idea))) : new Set<string>();
  const plans = ideas.length ? planner(channels, current) : null;
  const seen = new Set(current.flatMap((i) => (!finished(i) && i.idea ? [ideaKey(i.idea, itemChannel(i))] : [])));
  for (const row of ideas) {
    const channel = route(row.channel);
    const key = ideaKey(row, channel);
    const p = plans!.plan(channel);
    const idea = p.kind === "mv" ? asMv({ ...row, channel }, settings.defaultDuration) : { ...row, channel };
    items.push({ id: newId(), title: idea.song_title || idea.world_location, added_at: now, idea, channel, kind: p.kind, steps: fresh() });
    if (!made.has(key) && !seen.has(key)) plans!.note(channel, { kind: p.kind, codes: [] });
    seen.add(key);
  }
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
    let seq = Math.max(0, ...st.items.map((i) => i.seq ?? 0));
    for (const it of take) it.seq = ++seq;
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
 * Viết kịch bản cho việc `id` (chạy nền, mỗi lúc một video) nếu tới lượt: là việc đầu tiên theo thứ tự sản xuất còn chờ kịch bản.
 * Đọc lại trạng thái mới nhất — lượt chạy có thể đang cầm trạng thái cũ, lúc kịch bản trước vừa viết xong — nên không bao giờ viết
 * hai lần cho một việc. Trả về false nếu chưa tới lượt (hoặc đã có kịch bản). Playlist: kịch bản là một vòng cảnh (Cài đặt → Độ dài một
 * vòng cảnh), không theo độ dài nhạc — khi dựng, vòng cảnh lặp lại cho hết danh sách nhạc; MV một bài: dài đúng bài.
 */
async function startScript(id: string): Promise<boolean> {
  mem.generating = id;
  const next = inOrder((await readPipeline()).items).find((i) => !finished(i) && !i.mv_id && i.idea && i.steps.script.status !== "error");
  if (next?.id !== id) {
    mem.generating = null;
    return false;
  }
  void (async () => {
    try {
      const mv = await generateMV({ ...next.idea! });
      await patch(id, (it) => {
        it.mv_id = mv.id;
        it.steps.script = { status: "done", message: `${mv.shots.length} cảnh` };
      });
    } catch (err) {
      await patch(id, (it) => {
        it.steps.script = { status: "error", message: (err as Error).message };
      });
    } finally {
      mem.generating = null;
      ensurePipelineWatch();
    }
  })();
  return true;
}

function patch(id: string, fn: (it: PipelineItem) => void): Promise<void> {
  return updatePipeline((st) => {
    const it = st.items.find((i) => i.id === id);
    if (it) fn(it);
  });
}

type MVOf = NonNullable<Awaited<ReturnType<typeof loadMV>>>;

/** Tiêu đề YouTube của MV một bài khi đã có bài: tên bài đứng đầu (ảnh bìa lấy phần đầu tiêu đề), tối đa 100 ký tự như YouTube. */
export function mvTitle(title: string, song: string): string {
  const t = title.trim();
  const name = song.trim();
  if (!name || t.toLowerCase().includes(name.toLowerCase())) return t;
  const full = `${name} | ${t}`;
  if (full.length <= 100) return full;
  const cut = full.slice(0, 101);
  return cut.slice(0, Math.max(name.length, cut.lastIndexOf(" "))).replace(/[\s|·—–,-]+$/u, "");
}

/** MV một bài vừa có bài: tên bài vào ý tưởng của MV (tên thư mục kết quả) và lên đầu các tiêu đề YouTube. */
async function nameAfterSong(mvId: string, song: string): Promise<void> {
  const mv = await loadMV(mvId);
  if (!mv) return;
  mv.idea.song_title = song;
  mv.youtube_titles = mv.youtube_titles.map((t) => mvTitle(t, song));
  await saveMV(mv);
}

/**
 * Bước Nhạc của MV một bài: lấy bài lúc này — bài Giáng sinh mức hay cao nhất kênh chưa dùng (không lấy bài `held`; MV tạo trước đây đã
 * giữ bài thì đúng bài đó); đặt tên MV theo bài, ghi vào lịch sử kênh là MV làm sẵn chưa đăng.
 */
async function mvSongStep(mv: MVOf, ch: Channel, songs: LibSong[], history: Channel["history"], held: string[]): Promise<{ step: PipelineStep; song?: LibSong }> {
  const wanted = mv.idea.mv_song;
  const song = wanted ? songs.find((s) => s.exists && songKey(s.code) === songKey(wanted.code)) : pickMvSong(songs, history, held);
  const version = song ? ((wanted && song.versions.find((v) => v.name === wanted.file)) || song.versions[0]) : undefined;
  if (!song || !version) {
    return {
      step: {
        status: "waiting",
        message: wanted
          ? `MV chờ bài “${mv.idea.song_title || wanted.code}”: không thấy bài này trong kho nhạc — thêm lại bài (hoặc đồng bộ kho nhạc từ Drive).${CLIPS_GO_ON}`
          : `MV chờ bài: kho nhạc chưa có bài nào kênh “${ch.name}” chưa dùng — thêm bài vào kho (hoặc đồng bộ kho nhạc từ Drive).${CLIPS_GO_ON}`,
      },
    };
  }
  await fs.mkdir(mediaDir(mv.id), { recursive: true });
  const tmp = path.join(mediaDir(mv.id), `bai-${Date.now().toString(36)}.flac`);
  try {
    await buildPlaylistAudio([{ ...version, title: song.title, code: song.code }], tmp);
    await addPlaylistAudio(mv.id, tmp, version.name, []);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
  await nameAfterSong(mv.id, song.title);
  const title = `${/^\d+$/.test(mv.idea.id) ? `#${mv.idea.id} · ` : ""}${song.title}`;
  await recordChannelVideo(ch.id, { id: mv.id, date: new Date().toISOString(), title, codes: [song.code], files: [version.name], kind: "mv", posted: false });
  return { step: { status: "done", message: `Kênh “${ch.name}”: MV bài “${song.title}” (mức ${song.level}) · ${chapterTime(version.duration)}` }, song };
}

/**
 * Bước Nhạc của playlist: tự xếp bài kiểu Bokin cho đủ `target` giây; playlist cuối vòng mở đầu bằng các bài vừa có MV của vòng (các MV
 * cuối lịch sử kênh — nhạc ghép đúng thứ tự nên đó là MV của vòng này), không lấy bài các MV tạo trước đây đang giữ (`avoid`).
 */
async function playlistSongStep(mv: MVOf, ch: Channel, songs: LibSong[], history: Channel["history"], title: string, avoid: string[], target: number): Promise<PipelineStep> {
  const opensWith = nextVideo(channelSequence(history), 0).opensWith;
  const mix = pickForLength(songs, history, { targetSec: target, oldPercent: ch.oldPercent, newOrder: ch.newOrder, seed: mv.id, opensWith, avoid });
  if (!mix.enough) {
    return {
      status: "waiting",
      message: mix.picks.length
        ? `Chưa đủ nhạc cho kênh “${ch.name}”: kho chỉ có ${minutesLabel(mix.total)} (${mix.picks.length} bài dùng được), cần khoảng ${minutesLabel(target)} — thêm bài vào kho (hoặc đồng bộ kho nhạc từ Drive), hoặc giảm “Độ dài video” trong Cài đặt.${CLIPS_GO_ON}`
        : `Kho nhạc chưa có bài nào dùng được — thêm nhạc vào Thư mục nhạc (hoặc đồng bộ từ Drive), hoặc tải nhạc lên ở trang Ghép video.${CLIPS_GO_ON}`,
    };
  }
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
  await recordChannelVideo(ch.id, { id: mv.id, date: new Date().toISOString(), title, codes: mix.picks.map((p) => p.song.code), files, kind: "playlist", posted: false });
  const old = mix.picks.filter((p) => p.role === "old").length;
  const lead = opensWith.length ? mix.picks.filter((p) => opensWith.some((c) => songKey(c) === songKey(p.song.code))).length : 0;
  const warn = mix.warnings.length ? ` · ⚠ ${mix.warnings.join(" ")}` : "";
  return {
    status: "done",
    message: `Kênh “${ch.name}”: tự xếp ${mix.picks.length} bài (${old} cũ + ${mix.picks.length - old} mới) · ${minutesLabel(mix.total)}${lead ? ` · mở đầu bằng ${lead} bài vừa có MV` : ""}${warn}`,
  };
}

/**
 * Nhạc của kênh ghép đúng thứ tự sản xuất, để lịch sử kênh đúng vòng (MV → MV → MV → playlist → MV…): playlist chờ các MV thêm trước nó
 * (MV của vòng) có nhạc trước; MV chờ playlist thêm trước nó (vòng trước) của kênh. Trả về việc phải chờ, null = tới lượt.
 */
function songTurn(item: PipelineItem, items: PipelineItem[]): PipelineItem | null {
  const ch = itemChannel(item);
  const queue = inOrder(items.filter((o) => !finished(o) && itemChannel(o) === ch && o.steps.song.status !== "done"));
  const earlier = queue.slice(0, Math.max(0, queue.findIndex((o) => o.id === item.id)));
  return earlier.find((o) => kindOf(o) !== kindOf(item)) ?? null;
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
      if (!(await startScript(item.id))) return null;
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
    const items = (await readPipeline()).items;
    const before = songTurn(item, items);
    if (before) {
      steps.song = {
        status: "waiting",
        message:
          kindOf(item) === "mv"
            ? `Chờ playlist “${before.title}” (vòng trước) có nhạc trước, để kênh đúng thứ tự. Kịch bản và clip Muse vẫn làm tiếp.`
            : `Chờ MV “${before.title}” có nhạc trước (playlist mở đầu bằng bài của các MV trong vòng). Kịch bản và clip Muse vẫn làm tiếp.`,
      };
    } else {
      const title = `${/^\d+$/.test(mv.idea.id) ? `#${mv.idea.id} · ` : ""}${mv.idea.song_title || item.title}`;
      try {
        const lib = await loadMusicLibrary(settings.songDir, settings.songSheet);
        const channels = await readChannels();
        const ch = channels.find((c) => c.id === itemChannel(item)) ?? channels.find((c) => c.id === mv.idea.channel) ?? channels[0];
        // Lịch sử kênh không tính chính video này (ghép lại nhạc cho một video đã có trong lịch sử).
        const history = ch.history.filter((v) => v.id !== mv.id);
        // Bài các MV tạo trước đây đã giữ lúc thêm việc (MV mới chọn bài lúc ghép nhạc nên không giữ bài).
        const held = items.flatMap((o) =>
          o.id !== item.id && !finished(o) && itemChannel(o) === ch.id && o.steps.song.status !== "done" && o.idea?.mv_song ? [o.idea.mv_song.code] : [],
        );
        if (mv.idea.video_kind === "mv") {
          const r = await mvSongStep(mv, ch, lib.songs, history, held);
          steps.song = r.step;
          if (r.song) out.title = r.song.title;
        } else {
          steps.song = await playlistSongStep(mv, ch, lib.songs, history, title, held, settings.videoMinutes * 60);
        }
      } catch (err) {
        steps.song = { status: "error", message: (err as Error).message };
      }
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
 * Kho ý tưởng → dây chuyền, chỉ cho các kênh đang bật chưa đủ video làm sẵn (chưa đăng): luôn giữ đủ `ahead` video đang làm (cả các
 * kênh; chưa xong kịch bản hoặc chưa đủ clip — kể cả việc đang lỗi, để khi API key / Muse hỏng thì không lấy dồn cả kho). Phân luồng lần
 * lượt đều các kênh: mỗi lần lấy một ý tưởng của kênh có ít video nhất (kênh hết ý tưởng, hết bài mới khi bật "chỉ làm khi còn bài mới",
 * hoặc vừa đủ video làm sẵn thì nhường kênh sau). Kênh cần video mà kho sắp hết (kể cả kho trống) → nhờ Claude nghĩ thêm cho kênh đó
 * (chạy nền, mỗi lần một kênh). Trả về "fast" khi vừa lấy việc / Claude đang nghĩ, "slow" khi còn kênh chưa đủ video làm sẵn (dò lại
 * thưa), null khi không cần làm gì.
 */
async function feedFromBank(): Promise<"fast" | "slow" | null> {
  const cfg = (await readBank()).config;
  if (!cfg.feed) return null;
  const settings = await readSettings();
  if (generationMode(settings) === "manual") return null;
  const items = (await readPipeline()).items;
  const busy = items.filter((i) => !finished(i) && (i.steps.script.status !== "done" || i.steps.clips.status !== "done")).length;
  const channels = (await readChannels()).filter((c) => c.active);
  const load = channelLoad(channels, items);
  const stock = channelStock(channels, items);
  const needs = (c: Channel) => (stock.get(c.id) ?? 0) < c.stock;
  const skip = new Set(channels.filter((c) => !needs(c)).map((c) => c.id));
  let added = 0;
  for (let free = cfg.ahead - busy; free > 0; ) {
    const ch = routeChannel(channels, load, skip);
    if (!ch) break;
    // Bật "chỉ làm video mới khi còn bài mới" thì chỉ lấy khi bài kênh chưa dùng còn đủ cho thêm một video (trừ video đang chờ nhạc).
    const check = await songCheck(settings, cfg.needSong, ch.id, await waitingForMusic(ch.id));
    const [idea] = await takeIdeas(1, check ?? undefined, ch.id);
    if (!idea) {
      skip.add(ch.id);
      continue;
    }
    await addToPipeline({ ideas: [idea], channel: ch.id });
    load.set(ch.id, (load.get(ch.id) ?? 0) + 1);
    stock.set(ch.id, (stock.get(ch.id) ?? 0) + 1);
    if (!needs(ch)) skip.add(ch.id);
    free--;
    added++;
  }
  if (cfg.suggest && !isSuggesting()) {
    // Kênh cần thêm video mà còn ít ý tưởng chưa dùng nhất (≤ ahead, kể cả kho trống), không có đề xuất đang chờ duyệt → Claude nghĩ cho kênh đó.
    const ideas = (await readBank()).ideas;
    const left = (id: string) => ideas.filter((x) => ideaChannel(x) === id && x.status === "new").length;
    const low = channels
      .filter((c) => needs(c) && left(c.id) <= cfg.ahead && !ideas.some((x) => ideaChannel(x) === c.id && x.status === "proposed"))
      .sort((a, b) => left(a.id) - left(b.id))[0];
    if (low) startSuggest(() => ensurePipelineWatch(), false, low.id);
  }
  if (added > 0 || isSuggesting()) return "fast";
  return channels.some(needs) ? "slow" : null;
}

/** Một lượt chạy: lấy thêm ý tưởng từ kho, đẩy từng việc chưa xong qua bước kế tiếp. Trả về nhịp chạy tiếp (null = không còn gì để chạy). */
export function pipelineTick(): Promise<"fast" | "slow" | null> {
  return withLock("pipeline-tick", async () => {
    const feeding = await feedFromBank().catch((err) => {
      mem.error = (err as Error).message;
      return null;
    });
    const state = await readPipeline();
    // Việc thêm trước làm trước (thứ tự sản xuất của các kênh). Đọc lại từng việc ngay trước khi tính (việc trước có thể vừa đổi nó),
    // và chỉ ghi các bước lượt này đổi — kịch bản viết xong giữa chừng không bị ghi đè bằng trạng thái cũ.
    for (const id of inOrder(state.items.filter((i) => !finished(i))).map((i) => i.id)) {
      try {
        const item = (await readPipeline()).items.find((i) => i.id === id);
        if (!item || finished(item)) continue;
        const next = await advance(item);
        if (!next) continue;
        const changed = Object.fromEntries(Object.entries(next.steps ?? {}).filter(([k, v]) => v !== item.steps[k as StepName]));
        await patch(id, (it) => Object.assign(it, next, { steps: { ...it.steps, ...changed } }));
      } catch (err) {
        mem.error = (err as Error).message;
      }
    }
    const open = (await readPipeline()).items.filter((i) => !finished(i));
    const active = open.some((i) => Object.values(i.steps).some((s) => s.status === "running" || s.status === "pending"));
    if (active || mem.generating || feeding === "fast") return "fast";
    // Chỉ còn việc chờ bài hát / chờ người dùng xử lý lỗi, hoặc kênh chưa đủ video làm sẵn mà chưa lấy được việc → dò thưa.
    return feeding === "slow" || open.some((i) => Object.values(i.steps).some((s) => s.status === "waiting")) ? "slow" : null;
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
  const all = await readChannels();
  // Còn việc dở, hoặc đang tự lấy việc mà có kênh đang bật chưa đủ video làm sẵn → dây chuyền chạy (tự nghĩ ý tưởng cả khi kho trống).
  const stock = channelStock(all, state.items);
  const short = all.some((c) => c.active && (stock.get(c.id) ?? 0) < c.stock);
  if (state.items.some((i) => !finished(i)) || (bank.config.feed && short)) ensurePipelineWatch(false);
  const channels = all.map((c) => ({ id: c.id, name: c.name, active: c.active }));
  const posted = all.flatMap((c) => c.history.filter((v) => v.posted).map((v) => v.id));
  return { items: state.items, error: mem.error, generating: mem.generating, channels, posted };
}

/** Chờ việc viết kịch bản đang chạy xong (dùng cho test). */
export async function pipelineIdle(): Promise<void> {
  while (mem.generating) await new Promise((r) => setTimeout(r, 20));
}
