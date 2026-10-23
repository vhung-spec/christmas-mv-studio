// KÊNH — mỗi kênh YouTube một lịch sử riêng: video nào dùng những bài nào, theo thứ tự. Các kênh dùng chung một kho nhạc
// (musicLibrary.ts); "bài mới" / "bài cũ" tính theo lịch sử của từng kênh.
// Tự xếp bài cho video mới: chuyển từ Bokin Playlist Studio (loop_music/channels.py — pick, quyết định cùng người dùng 2026-10-20):
//   bài cũ = bài mức 2–3 kênh đã dùng, bài nghỉ lâu nhất trước (bài "Thưa hơn" nghỉ gấp đôi…); bài mới = bài kênh chưa dùng lần nào,
//   mặc định rải đều các mức như trong kho ("Cân bằng các mức"), hoặc "Mức cao trước"; bài mức 1 chỉ dùng làm bài mới, không dùng
//   lại; danh sách nhạc xếp mức 3 → 2 → 1 (bài hay nhất mở đầu), bài mở đầu không trùng bài mở đầu của video trước; hết bài mới thì
//   lấy thêm bài cũ mức 2–3 (rồi mới tới mức 1), kèm cảnh báo.
// App này thêm: lấy bao nhiêu bài cho đủ Độ dài video (~60 phút), tỉ lệ bài cũ theo % (Bokin: 6 / 13), bài nhiều bản thì khi dùng lại
// lấy bản ít dùng nhất. Phân luồng: video mới giao cho kênh đang có ít video nhất (routeChannel).
// Lưu ở data/channels.json. Phần xếp bài là hàm thuần (test được), phần đọc / ghi chỉ dùng phía server.

import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  DEFAULT_CHANNEL_ID,
  DEFAULT_CHANNEL_NAME,
  DEFAULT_OLD_PERCENT,
  NEW_ORDERS,
  OLD_PERCENT_RANGE,
  type Channel,
  type ChannelVideo,
  type NewOrder,
} from "./channelTypes";
import { UserError } from "./errors";
import { hashSeed, rng } from "./mock";
import type { LibSong, LibVersion } from "./musicLibrary";
import { ENOUGH_RATIO } from "./playlist";
import { REUSE, REUSED_FROM, plain, type Level, type ReuseRule } from "./songSheet";
import { CHANNELS_FILE, readJson, withLock, writeJson } from "./store";

// ---------- Tự xếp bài (thuần) ----------

/** Khoá so mã bài (không dấu, không phân biệt hoa thường) — như key() của Bokin. */
export const key = (code: string) => plain(code);

export interface PickSong {
  code: string;
  level: Level;
  /** false = không có file nhạc → không dùng. */
  exists?: boolean;
  /** Loại khỏi kho (cột Dùng lại). */
  excluded?: boolean;
  reuse?: ReuseRule;
}

export interface PickOptions {
  /** Số bài của video. */
  total: number;
  /** Số bài cũ mong muốn (< total). */
  old: number;
  newOrder?: NewOrder;
  /** Quyết định thứ tự giữa các bài ngang nhau (cùng seed → cùng kết quả). */
  seed?: string | number;
  /** Mã bài phải giữ (Bokin: "Khóa" trong bảng xem trước). */
  keep?: string[];
  /** Mã bài để ra lần này (Bokin: "Đổi bài khác"). */
  avoid?: string[];
}

export interface SongPick<S> {
  song: S;
  role: "old" | "new";
  /** Video gần nhất của kênh đã dùng bài (0 = video đầu), null = bài mới. */
  last: number | null;
}

export interface PickStats {
  videos: number;
  songs: number;
  excluded: number;
  missing: number;
  levels: Record<Level, number>;
  unused: number;
  newLeft: number;
  videosLeft: number;
}

export interface PickResult<S> {
  picks: SongPick<S>[];
  warnings: string[];
  stats: PickStats;
}

type History = Pick<ChannelVideo, "codes">[];

/** {mã: số thứ tự video gần nhất đã dùng (0 = video đầu)}. */
export function lastUse(history: History): Map<string, number> {
  const found = new Map<string, number>();
  history.forEach((video, index) => {
    for (const code of video.codes) found.set(key(code), index);
  });
  return found;
}

/** Thời gian nghỉ của một bài đã dùng: số video kể từ lần dùng gần nhất × hệ số Dùng lại (0 với "Không dùng lại"). */
export function resting(history: History) {
  const last = lastUse(history);
  const videos = history.length;
  return (s: PickSong) => (videos - (last.get(key(s.code)) ?? videos)) * REUSE[s.reuse ?? "normal"].factor;
}

/** Kho có gì cho kênh: số bài dùng được, theo mức, bài kênh chưa dùng (như status() của Bokin). */
export function channelStatus(songs: PickSong[], history: History, newPerVideo: number): Omit<PickStats, "newLeft"> {
  const last = lastUse(history);
  const usable = songs.filter((s) => s.exists !== false && !s.excluded);
  const unused = usable.filter((s) => !last.has(key(s.code))).length;
  return {
    videos: history.length,
    songs: usable.length,
    excluded: songs.filter((s) => s.excluded).length,
    missing: songs.filter((s) => s.exists === false).length,
    levels: { 3: usable.filter((s) => s.level === 3).length, 2: usable.filter((s) => s.level === 2).length, 1: usable.filter((s) => s.level === 1).length },
    unused,
    videosLeft: Math.floor(unused / Math.max(1, newPerVideo)),
  };
}

/**
 * Bài cho video tiếp theo của kênh, `total` bài trong đó `old` bài cũ — chuyển từ pick() của Bokin Playlist Studio.
 * Trả về các bài theo thứ tự trong danh sách nhạc (mức 3, rồi 2, rồi 1; bài mở đầu không trùng bài mở đầu của video trước),
 * cảnh báo và thống kê kho cho kênh.
 */
export function pickSongs<S extends PickSong>(songs: S[], history: History, opts: PickOptions): PickResult<S> {
  const random = rng(hashSeed(String(opts.seed ?? Math.random())));
  const total = opts.total;
  const oldTarget = opts.old;
  const last = lastUse(history);
  const rested = resting(history);
  const avoided = new Set((opts.avoid ?? []).map(key));
  const usable = songs.filter((s) => s.exists !== false && !s.excluded);
  const byCode = new Map(usable.map((s) => [key(s.code), s]));
  const kept = (opts.keep ?? []).flatMap((c) => (byCode.has(key(c)) ? [byCode.get(key(c))!] : [])).slice(0, total);
  const taken = new Set(kept.map((s) => key(s.code)));
  const noise = new Map(usable.map((s) => [key(s.code), random()]));
  const n = (s: S) => noise.get(key(s.code)) ?? 0;

  const free = (candidates: S[]) => candidates.filter((s) => !taken.has(key(s.code)) && !avoided.has(key(s.code)));
  const used = (s: S) => last.has(key(s.code));
  // Bài nghỉ lâu nhất trước (hệ số Dùng lại nhân vào thời gian nghỉ); rồi mức cao hơn.
  const lru = (candidates: S[]) => free(candidates).filter((s) => rested(s) > 0).sort((a, b) => rested(b) - rested(a) || b.level - a.level || n(a) - n(b));
  const bestFirst = (candidates: S[]) => free(candidates).sort((a, b) => b.level - a.level || n(a) - n(b));
  // `count` bài rải đều các mức như trong `candidates` (chia phần dư lớn nhất), để các mức trong kho hết cùng lúc, các video đều nhau.
  const balanced = (candidates: S[], count: number) => {
    const list = bestFirst(candidates);
    if (list.length <= count) return list;
    const levels: Level[] = [3, 2, 1];
    const groups = new Map(levels.map((lv) => [lv, list.filter((s) => s.level === lv)]));
    const shares = new Map(levels.map((lv) => [lv, { whole: Math.floor((count * groups.get(lv)!.length) / list.length), rest: (count * groups.get(lv)!.length) % list.length }]));
    const quota = new Map(levels.map((lv) => [lv, shares.get(lv)!.whole]));
    const extra = count - [...quota.values()].reduce((a, b) => a + b, 0);
    for (const lv of [...levels].sort((a, b) => shares.get(b)!.rest - shares.get(a)!.rest || b - a).slice(0, extra)) quota.set(lv, quota.get(lv)! + 1);
    return levels.flatMap((lv) => groups.get(lv)!.slice(0, quota.get(lv)));
  };

  const oldPool = lru(usable.filter((s) => used(s) && s.level >= REUSED_FROM));
  const unused = usable.filter((s) => !used(s));
  const lastResort = lru(usable.filter((s) => used(s) && s.level < REUSED_FROM));
  const keptOld = kept.filter(used).length;
  const oldSlots = Math.max(0, Math.min(oldTarget - keptOld, total - kept.length));
  let newSlots = total - kept.length - oldSlots;
  const warnings: string[] = [];
  const chosenOld = oldPool.slice(0, oldSlots);
  newSlots += oldSlots - chosenOld.length; // ít bài cũ mức 2–3 quá: lấy thêm bài mới
  const chosenNew = opts.newOrder === "best_first" ? bestFirst(unused).slice(0, newSlots) : balanced(unused, newSlots);
  let short = newSlots - chosenNew.length;
  if (short) {
    const more = oldPool.slice(chosenOld.length, chosenOld.length + short);
    chosenOld.push(...more);
    short -= more.length;
    if (more.length) warnings.push("Kho đã hết bài mới cho kênh này: dùng lại thêm bài mức 2–3 đã dùng.");
  }
  if (short) {
    const again = lastResort.slice(0, short);
    chosenOld.push(...again);
    short -= again.length;
    if (again.length) warnings.push(`Dùng lại ${again.length} bài mức 1 vì kho không còn đủ bài.`);
  }
  if (short) warnings.push(`Kho chỉ đủ ${total - short} bài cho video này (cần ${total}).`);
  const chosen = [...kept, ...chosenOld, ...chosenNew];
  const ordered = [...chosen].sort((a, b) => b.level - a.level || n(a) - n(b));
  const previous = history.at(-1)?.codes ?? [];
  if (previous.length && ordered.length > 1 && key(ordered[0].code) === key(previous[0])) [ordered[0], ordered[1]] = [ordered[1], ordered[0]]; // bài mở đầu mới, hay nhất có thể
  const picks = ordered.map((s) => ({ song: s, role: used(s) ? ("old" as const) : ("new" as const), last: last.get(key(s.code)) ?? null }));
  if (ordered.length && ordered[0].level < REUSED_FROM) warnings.push("Không có bài mức 2–3 nào để mở đầu video.");
  const base = channelStatus(songs, history, total - oldTarget);
  const newLeft = Math.max(0, base.unused - chosen.filter((s) => !used(s)).length);
  const stats: PickStats = { ...base, newLeft, videosLeft: Math.floor(newLeft / Math.max(1, total - oldTarget)) };
  if (newLeft > 0 && stats.videosLeft <= 3 && !short) {
    const enough = stats.videosLeft ? `khoảng ${stats.videosLeft} video nữa` : "chưa đủ cho video sau";
    warnings.push(`Kho chỉ còn ${newLeft} bài mới cho kênh này (${enough}): nên thêm bài vào kho.`);
  }
  return { picks, warnings, stats };
}

/** Bản dùng cho bài: bài mới → bản chính; bài dùng lại → bản kênh ít dùng nhất (bản chính trước nếu ngang nhau). */
export function chooseVersion(song: LibSong, role: "old" | "new", fileUses: Map<string, number>): LibVersion {
  if (role === "new" || song.versions.length < 2) return song.versions[0];
  return song.versions.reduce((best, v) => ((fileUses.get(plain(v.name)) ?? 0) < (fileUses.get(plain(best.name)) ?? 0) ? v : best), song.versions[0]);
}

export interface MixPick extends SongPick<LibSong> {
  version: LibVersion;
}

export interface MixResult {
  picks: MixPick[];
  /** Tổng thời lượng (giây). */
  total: number;
  /** Đủ ít nhất 90% độ dài video. */
  enough: boolean;
  /** Số bài và số bài cũ đã nhắm. */
  count: number;
  old: number;
  warnings: string[];
  stats: PickStats;
}

/**
 * Bài cho video dài `targetSec` giây: tăng dần số bài (bài cũ = `oldPercent`% số bài, như 6 / 13 của Bokin) tới khi tổng thời lượng đủ
 * độ dài video (bài cuối có thể vượt một chút). Hết bài thì dừng, `enough` cho biết đã đủ 90% độ dài chưa.
 */
export function pickForLength(songs: LibSong[], history: ChannelVideo[], opts: { targetSec: number; oldPercent: number; newOrder?: NewOrder; seed?: string }): MixResult {
  const usable = songs.filter((s) => s.exists && !s.excluded).length;
  const fileUses = new Map<string, number>();
  for (const v of history) for (const f of v.files) fileUses.set(plain(path.basename(f)), (fileUses.get(plain(path.basename(f))) ?? 0) + 1);
  let result: MixResult | null = null;
  for (let count = 1; count <= Math.max(1, usable); count++) {
    const old = Math.min(count - 1, Math.round((count * opts.oldPercent) / 100));
    const r = pickSongs(songs, history, { total: count, old, newOrder: opts.newOrder, seed: opts.seed });
    const picks = r.picks.map((p) => ({ ...p, version: chooseVersion(p.song, p.role, fileUses) }));
    const total = picks.reduce((a, p) => a + p.version.duration, 0);
    result = { picks, total, enough: total >= opts.targetSec * ENOUGH_RATIO, count, old, warnings: r.warnings, stats: r.stats };
    if (total >= opts.targetSec || picks.length < count) break;
  }
  return result ?? { picks: [], total: 0, enough: false, count: 0, old: 0, warnings: ["Kho nhạc chưa có bài nào."], stats: { ...channelStatus(songs, history, 1), newLeft: 0 } };
}

/** Ước tính số bài mới mỗi video (độ dài video ÷ thời lượng trung bình một bài, trừ phần bài cũ) — để tính "còn đủ cho mấy video". */
export function newPerVideo(songs: LibSong[], targetSec: number, oldPercent: number): number {
  const usable = songs.filter((s) => s.exists && !s.excluded);
  if (!usable.length) return 1;
  const avg = usable.reduce((a, s) => a + s.versions[0].duration, 0) / usable.length;
  const count = Math.max(1, Math.ceil(targetSec / Math.max(1, avg)));
  return Math.max(1, count - Math.min(count - 1, Math.round((count * oldPercent) / 100)));
}

/** Phân luồng: kênh đang bật có ít video nhất (đang làm + đã xong) — bằng nhau thì kênh đứng trước trong danh sách. */
export function routeChannel<C extends Pick<Channel, "id" | "active">>(channels: C[], load: Map<string, number>, skip: Set<string> = new Set()): C | null {
  let best: C | null = null;
  for (const c of channels) {
    if (!c.active || skip.has(c.id)) continue;
    if (!best || (load.get(c.id) ?? 0) < (load.get(best.id) ?? 0)) best = c;
  }
  return best;
}

// ---------- Lưu kênh (data/channels.json) ----------

interface ChannelsFile {
  channels: Channel[];
}

const defaultChannel = (): Channel => ({
  id: DEFAULT_CHANNEL_ID,
  name: DEFAULT_CHANNEL_NAME,
  active: true,
  oldPercent: DEFAULT_OLD_PERCENT,
  newOrder: "balanced",
  created_at: new Date(0).toISOString(),
  history: [],
});

const clampPercent = (v: unknown, fallback: number) => {
  const x = Math.round(Number(v));
  return Number.isFinite(x) ? Math.min(OLD_PERCENT_RANGE[1], Math.max(OLD_PERCENT_RANGE[0], x)) : fallback;
};

function normalize(c: Partial<Channel>): Channel {
  const d = defaultChannel();
  return {
    id: typeof c.id === "string" && c.id ? c.id : d.id,
    name: typeof c.name === "string" && c.name.trim() ? c.name.trim().split(/\s+/).join(" ") : d.name,
    active: c.active !== false,
    oldPercent: clampPercent(c.oldPercent, d.oldPercent),
    newOrder: c.newOrder && c.newOrder in NEW_ORDERS ? c.newOrder : d.newOrder,
    created_at: c.created_at ?? d.created_at,
    history: Array.isArray(c.history) ? c.history.filter((v) => v && typeof v.id === "string" && Array.isArray(v.codes)).map((v) => ({ ...v, files: v.files ?? [] })) : [],
  };
}

/** Các kênh (chưa tạo kênh nào → một kênh mặc định). */
export async function readChannels(): Promise<Channel[]> {
  const f = await readJson<Partial<ChannelsFile>>(CHANNELS_FILE(), {});
  const list = (f.channels ?? []).map(normalize);
  return list.length ? list : [defaultChannel()];
}

function updateChannels<T>(fn: (list: Channel[]) => T): Promise<T> {
  return withLock("channels", async () => {
    const list = await readChannels();
    const out = fn(list);
    await writeJson(CHANNELS_FILE(), { channels: list });
    return out;
  });
}

const checkName = (list: Channel[], name: string, self?: string) => {
  const clean = name.trim().split(/\s+/).join(" ");
  if (!clean) throw new UserError("Kênh cần có tên.");
  if (list.some((c) => c.id !== self && c.name.toLowerCase() === clean.toLowerCase())) throw new UserError(`Đã có kênh tên “${clean}”.`);
  return clean;
};

export function addChannel(name: string): Promise<Channel> {
  return updateChannels((list) => {
    const c = normalize({ id: `kenh-${randomUUID().slice(0, 8)}`, name: checkName(list, name), created_at: new Date().toISOString() });
    list.push(c);
    return c;
  });
}

/** Đổi tên / bật tắt / tỉ lệ bài cũ / cách chọn bài mới của một kênh. */
export function updateChannel(id: string, patch: Partial<Pick<Channel, "name" | "active" | "oldPercent" | "newOrder">>): Promise<Channel> {
  return updateChannels((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) throw new UserError("Không tìm thấy kênh.", 404);
    if (patch.name !== undefined) c.name = checkName(list, patch.name, id);
    if (typeof patch.active === "boolean") {
      if (!patch.active && !list.some((x) => x.id !== id && x.active)) throw new UserError("Cần ít nhất một kênh đang bật.");
      c.active = patch.active;
    }
    if (patch.oldPercent !== undefined) c.oldPercent = clampPercent(patch.oldPercent, c.oldPercent);
    if (patch.newOrder && patch.newOrder in NEW_ORDERS) c.newOrder = patch.newOrder;
    return c;
  });
}

/** Ghi video vào lịch sử kênh (cùng mã MV thì thay bản cũ — vd. ghép lại danh sách nhạc). */
export function recordChannelVideo(channelId: string, video: ChannelVideo): Promise<void> {
  return updateChannels((list) => {
    for (const c of list) c.history = c.history.filter((v) => v.id !== video.id);
    const c = list.find((x) => x.id === channelId) ?? list[0];
    c.history.push(video);
  });
}

/** Mã kênh từ mã hoặc tên kênh (cột Kênh trong bảng ý tưởng ghi tên) — so không dấu, không phân biệt hoa thường; null nếu không thấy. */
export function resolveChannel(channels: Pick<Channel, "id" | "name">[], value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return (channels.find((c) => c.id === value.trim()) ?? channels.find((c) => plain(c.name) === plain(value)))?.id ?? null;
}

/** Kênh của một MV: kênh có MV trong lịch sử, không thì kênh ghi trong ý tưởng, không thì kênh đầu tiên. */
export async function channelFor(mv: { id: string; idea: { channel?: string } }): Promise<Channel> {
  const list = await readChannels();
  return list.find((c) => c.history.some((v) => v.id === mv.id)) ?? list.find((c) => c.id === mv.idea.channel) ?? list[0];
}
