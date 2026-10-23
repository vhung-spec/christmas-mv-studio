// KHO Ý TƯỞNG — ý tưởng của bạn (dán bảng) và ý tưởng Claude đề xuất, đánh dấu đã dùng / chưa dùng. MỖI KÊNH MỘT KHO RIÊNG:
// ý tưởng của kênh nào chỉ làm video cho kênh đó; Claude đề xuất theo từng kênh (không trùng ý tưởng của kênh khác).
// Dây chuyền tự lấy dần ý tưởng chưa dùng, lần lượt đều các kênh (xem feedFromBank trong pipeline.ts); kho của kênh sắp hết thì
// nhờ Claude nghĩ thêm cho kênh đó — chờ bạn duyệt, hoặc dùng luôn nếu bật "Tự duyệt". Lưu ở data/ideas.json. Chỉ dùng phía server.

import { randomUUID } from "node:crypto";
import { DEFAULT_CHANNEL_ID } from "./channelTypes";
import { channelStatus, newPerVideo, readChannels, resolveChannel } from "./channels";
import { UserError } from "./errors";
import { generationMode } from "./generate";
import {
  BANK_LIMITS,
  DEFAULT_BANK_CONFIG,
  type BankChannel,
  type BankConfig,
  type BankIdea,
  type BankStatus,
  type BankView,
  type IdeaBank,
  type MusicStock,
} from "./ideaBankTypes";
import { callStructured, hasCredentials } from "./llm";
import { IDEAS_SCHEMA, zIdeaBatch, type RawIdeaBatch } from "./llmSchemas";
import { mockIdeas } from "./mock";
import { loadMusicLibrary } from "./musicLibrary";
import { extractYear, splitThemeCell } from "./parser";
import { IDEAS_SYSTEM, buildIdeasPrompt } from "./prompts";
import { readSongLibrary } from "./songLibrary";
import { IDEAS_FILE, PIPELINE_FILE, listMVs, readJson, readLibraries, readSettings, withLock, writeJson } from "./store";
import type { IdeaRow, Settings } from "./types";

/** Lần đề xuất tự động bị lỗi thì chờ chừng này mới tự thử lại (bấm "Nhờ Claude đề xuất ngay" thì thử luôn). */
const RETRY_MS = 30 * 60 * 1000;
/** Mỗi series 50 ý tưởng, như bảng gốc ("1–50 · …", "51–100 · …"). */
const SERIES_SIZE = 50;

// Trạng thái trong tiến trình: lần đề xuất đang chạy, lỗi và kết quả lần gần nhất.
const g = globalThis as unknown as {
  __mvIdeaBank?: { suggesting: Promise<unknown> | null; error: string | null; failedAt: number; last: BankView["last"] };
};
const mem = (g.__mvIdeaBank ??= { suggesting: null, error: null, failedAt: 0, last: null });

/** Kênh của một ý tưởng trong kho (ý tưởng cũ chưa có kênh → kênh mặc định). */
export const ideaChannel = (x: Pick<BankIdea, "channel" | "idea">) => x.channel ?? x.idea.channel ?? DEFAULT_CHANNEL_ID;

export async function readBank(): Promise<IdeaBank> {
  const b = await readJson<Partial<IdeaBank>>(IDEAS_FILE(), {});
  return { ideas: b.ideas ?? [], config: { ...DEFAULT_BANK_CONFIG, ...b.config } };
}

function updateBank<T>(fn: (b: IdeaBank) => T | Promise<T>): Promise<T> {
  return withLock("ideas", async () => {
    const b = await readBank();
    const result = await fn(b);
    await writeJson(IDEAS_FILE(), b);
    return result;
  });
}

const newKey = () => `idea_${randomUUID().slice(0, 13)}`;
/** Bỏ dấu, chữ thường, chỉ giữ chữ và số — để so trùng. */
const norm = (s = "") =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Khoá so trùng ý tưởng: địa điểm + dàn ý (bỏ dấu, hoa thường, dấu cách). */
export const sameIdea = (i: IdeaRow) => `${norm(i.world_location)}|${norm(i.outline)}`;
/** Khoá so trùng trong cùng kênh: kênh + địa điểm + dàn ý (cùng ý tưởng ở hai kênh là hai việc khác nhau). */
export const ideaKey = (i: IdeaRow, channel = i.channel ?? DEFAULT_CHANNEL_ID) => `${channel}|${sameIdea(i)}`;

/** Ý tưởng chạy thẳng (nút "Chạy ngay", không qua kho) mà cũng có trong kho cùng kênh → đánh dấu đã dùng để kho không lấy lại. */
export async function markIdeasUsed(ideas: IdeaRow[]): Promise<number> {
  const keys = new Set(ideas.map((i) => ideaKey(i)));
  const hit = (x: BankIdea) => (x.status === "new" || x.status === "proposed") && keys.has(ideaKey(x.idea, ideaChannel(x)));
  if (!(await readBank()).ideas.some(hit)) return 0;
  return updateBank((b) => {
    const now = new Date().toISOString();
    let n = 0;
    for (const x of b.ideas) {
      if (!hit(x)) continue;
      Object.assign(x, { status: "used", used_at: now });
      n++;
    }
    return n;
  });
}

/**
 * Thêm ý tưởng của bạn vào kho của kênh `channel` (bỏ qua ý tưởng kênh đó đã có: trùng địa điểm + dàn ý).
 * `channel` = "auto": chia lần lượt cho các kênh đang bật (kênh ít ý tưởng chưa dùng nhất trước).
 */
export async function addIdeas(rows: IdeaRow[], channel = "auto"): Promise<{ added: number; skipped: number }> {
  if (!rows.length) throw new UserError("Chưa có ý tưởng nào.");
  const channels = await readChannels();
  if (channel !== "auto" && !channels.some((c) => c.id === channel)) throw new UserError("Không tìm thấy kênh.", 404);
  const active = channels.filter((c) => c.active);
  return updateBank((b) => {
    const seen = new Set(b.ideas.map((x) => ideaKey(x.idea, ideaChannel(x))));
    const load = new Map(active.map((c) => [c.id, b.ideas.filter((x) => ideaChannel(x) === c.id && (x.status === "new" || x.status === "proposed")).length]));
    const now = new Date().toISOString();
    let added = 0;
    for (const row of rows) {
      // Cột Kênh của dòng (tên hoặc mã kênh) thắng; không có thì kênh đang chọn, hoặc chia lần lượt (kênh ít ý tưởng chưa dùng nhất).
      const target =
        resolveChannel(channels, row.channel) ??
        (channel !== "auto"
          ? channel
          : (active.reduce<(typeof active)[number] | null>((best, c) => (!best || load.get(c.id)! < load.get(best.id)! ? c : best), null)?.id ?? DEFAULT_CHANNEL_ID));
      const idea = { ...row, channel: target };
      const k = ideaKey(idea);
      if (seen.has(k)) continue;
      seen.add(k);
      b.ideas.push({ key: newKey(), idea, channel: target, source: "user", status: "new", added_at: now });
      load.set(target, (load.get(target) ?? 0) + 1);
      added++;
    }
    return { added, skipped: rows.length - added };
  });
}

/** Xét một ý tưởng trước khi lấy: "take" = lấy · "wait" = để nguyên trong kho (vd. hết bài mới) · chuỗi khác = lý do bỏ qua. */
export type TakeCheck = (idea: IdeaRow) => "take" | "wait" | (string & {});

/**
 * Lấy n ý tưởng chưa dùng của kênh (theo thứ tự trong kho) và đánh dấu đã dùng. `check` trả về lý do bỏ qua thì ý tưởng đó cũng được
 * đánh dấu đã dùng (kèm lý do) nhưng không lấy; trả về "wait" thì ý tưởng vẫn chờ trong kho. Ý tưởng trả về mang mã kênh.
 */
export async function takeIdeas(n: number, check?: TakeCheck, channel = DEFAULT_CHANNEL_ID): Promise<IdeaRow[]> {
  const mine = (x: BankIdea) => x.status === "new" && ideaChannel(x) === channel;
  if (n <= 0 || !(await readBank()).ideas.some(mine)) return [];
  return updateBank((b) => {
    const now = new Date().toISOString();
    const out: IdeaRow[] = [];
    for (const x of b.ideas) {
      if (out.length >= n) break;
      if (!mine(x)) continue;
      const idea = { ...x.idea, channel };
      const verdict = check ? check(idea) : "take";
      if (verdict === "wait") continue;
      x.status = "used";
      x.used_at = now;
      if (verdict === "take") out.push(idea);
      else x.note = verdict;
    }
    return out;
  });
}

/**
 * Kho nhạc cho một kênh: bài dùng được (Kho bài hát.xlsx + Thư mục nhạc), theo mức, bài kênh chưa dùng lần nào và đủ bài mới cho khoảng
 * mấy video (mỗi video cần khoảng (100 − % bài cũ)% số bài là bài mới). null khi chưa đặt Thư mục nhạc (hoặc không mở được).
 */
export async function musicStock(settings: Settings, channelId = DEFAULT_CHANNEL_ID): Promise<MusicStock | null> {
  if (!settings.songDir.trim()) return null;
  const lib = await loadMusicLibrary(settings.songDir, settings.songSheet).catch(() => null);
  if (!lib) return null;
  const channels = await readChannels();
  const ch = channels.find((c) => c.id === channelId) ?? channels[0];
  const st = channelStatus(lib.songs, ch.history, newPerVideo(lib.songs, settings.videoMinutes * 60, ch.oldPercent));
  return { songs: st.songs, levels: st.levels, unused: st.unused, videos: st.videosLeft, videoMinutes: settings.videoMinutes, sheet: Boolean(lib.sheet) };
}

/**
 * Kiểm tra theo kho nhạc: `needSong` thì chỉ lấy bấy nhiêu ý tưởng của kênh mà bài mới còn lại cho kênh đủ (trừ `reserved` video của
 * kênh trong dây chuyền đang chờ ghép nhạc), còn lại chờ trong kho. null khi không lọc (tắt, hoặc chưa đặt Thư mục nhạc).
 */
export async function songCheck(settings: Settings, needSong: boolean, channelId = DEFAULT_CHANNEL_ID, reserved = 0): Promise<TakeCheck | null> {
  if (!needSong) return null;
  const stock = await musicStock(settings, channelId);
  if (!stock) return null;
  let left = stock.videos - reserved;
  return () => (left-- > 0 ? "take" : "wait");
}

/** Số video của kênh trong dây chuyền chưa xong mà chưa có nhạc (sẽ lấy bài mới của kênh). */
export async function waitingForMusic(channelId?: string): Promise<number> {
  const st = await readJson<{ items: { done_at?: string; channel?: string; idea?: IdeaRow; steps: { song: { status: string } } }[] }>(PIPELINE_FILE(), { items: [] });
  return st.items.filter((i) => !i.done_at && i.steps.song.status !== "done" && (!channelId || (i.channel ?? i.idea?.channel ?? DEFAULT_CHANNEL_ID) === channelId)).length;
}

/** Duyệt (đề xuất → chưa dùng) hoặc bỏ ý tưởng. keys = "proposed" → mọi ý tưởng đang chờ duyệt (của kênh `channel` nếu có). */
export function setIdeas(keys: string[] | "proposed", action: "approve" | "reject", channel?: string): Promise<number> {
  return updateBank((b) => {
    let n = 0;
    for (const x of b.ideas) {
      if (keys === "proposed" ? x.status !== "proposed" || (channel && ideaChannel(x) !== channel) : !keys.includes(x.key)) continue;
      const to: BankStatus | null =
        action === "approve" ? (x.status === "proposed" ? "new" : null) : x.status === "proposed" || x.status === "new" ? "rejected" : null;
      if (!to) continue;
      x.status = to;
      n++;
    }
    return n;
  });
}

const clamp = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function setBankConfig(patch: Partial<Record<keyof BankConfig, unknown>>): Promise<BankConfig> {
  return updateBank((b) => {
    const c = { ...b.config };
    for (const k of ["feed", "suggest", "autoApprove", "needSong"] as const) if (typeof patch[k] === "boolean") c[k] = patch[k];
    if (patch.ahead !== undefined) c.ahead = clamp(patch.ahead, BANK_LIMITS.ahead, c.ahead);
    if (patch.batch !== undefined) c.batch = clamp(patch.batch, BANK_LIMITS.batch, c.batch);
    b.config = c;
    return c;
  });
}

// ---------- Claude đề xuất ý tưởng mới ----------

/**
 * Mọi ý tưởng app đã biết: các MV đã viết, việc trong dây chuyền, kho (kể cả đã bỏ) — để không đề xuất trùng (ở mọi kênh).
 * `channel` = chỉ lấy ý tưởng của kênh đó (làm mẫu, đánh số tiếp, series).
 */
async function knownIdeas(bank: IdeaBank, channel?: string): Promise<IdeaRow[]> {
  const pipeline = await readJson<{ items: { idea?: IdeaRow; channel?: string }[] }>(PIPELINE_FILE(), { items: [] });
  const all = [
    ...(await listMVs()).map((m) => m.idea),
    ...pipeline.items.flatMap((i) => (i.idea ? [{ ...i.idea, channel: i.channel ?? i.idea.channel }] : [])),
    ...bank.ideas.map((x) => ({ ...x.idea, channel: ideaChannel(x) })),
  ];
  const seen = new Set<string>();
  return all.filter((i) => {
    if (channel && (i.channel ?? DEFAULT_CHANNEL_ID) !== channel) return false;
    const k = channel ? sameIdea(i) : ideaKey(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Chủ đề trong thư viện + chủ đề đã gặp trong kho của kênh (bảng gốc có thể dùng mã chưa có trong thư viện), kèm số lần dùng ở kênh. */
async function themeList(bank: IdeaBank, channel: string) {
  const libs = await readLibraries();
  const names = new Map<string, string>(Object.entries(libs.themes).map(([code, t]) => [code, t.name]));
  const used = new Map<string, number>();
  for (const x of bank.ideas.filter((i) => ideaChannel(i) === channel)) {
    const code = x.idea.theme_code.trim().toUpperCase();
    if (!names.has(code)) names.set(code, x.idea.theme_name || code);
    if (x.status !== "rejected") used.set(code, (used.get(code) ?? 0) + 1);
  }
  const themes = [...names]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([code, name]) => ({ code, name, used: used.get(code) ?? 0 }));
  return { libs, themes };
}

const nextIdeaId = (ideas: IdeaRow[]) => ideas.reduce((max, i) => (/^\d+$/.test(i.id) ? Math.max(max, Number(i.id)) : max), 0) + 1;
const blockStart = (id: number) => Math.floor((id - 1) / SERIES_SIZE) * SERIES_SIZE + 1;

/** Series của khối 50 ý tưởng chứa id này (lấy từ ý tưởng đã có trong khối), nếu có. */
function seriesOf(ideas: IdeaRow[], id: number): string | null {
  const start = blockStart(id);
  const hit = ideas.find((i) => /^\d+$/.test(i.id) && Number(i.id) >= start && Number(i.id) < start + SERIES_SIZE && i.series?.trim());
  return hit?.series ?? null;
}

/** Vài ý tưởng mẫu rải đều trong danh sách (ưu tiên ý tưởng có dàn ý đầy đủ). */
function pickExamples(ideas: IdeaRow[], n = 8): IdeaRow[] {
  const good = ideas.filter((i) => i.outline.trim().length >= 30);
  if (good.length <= n) return good;
  return Array.from({ length: n }, (_, k) => good[Math.floor((k * good.length) / n)]);
}

/** Lọc ý tưởng Claude trả về: năm 1950–1959, mã chủ đề có thật, dàn ý đủ dài, địa điểm + thời điểm chưa có. */
export function cleanSuggestions(raw: RawIdeaBatch["ideas"], known: IdeaRow[], themes: Set<string>) {
  const seen = new Set(known.map((i) => norm(i.world_location)));
  const ideas: RawIdeaBatch["ideas"] = [];
  const problems: string[] = [];
  for (const r of raw) {
    const world_location = r.world_location.replace(/\s+/g, " ").trim();
    const year = extractYear(world_location);
    const theme_code = splitThemeCell(r.theme_code).code;
    const outline = r.outline.replace(/\s+/g, " ").trim();
    if (!year || year < 1950 || year > 1959) problems.push(`"${world_location}": the year must be 1950–1959`);
    else if (!themes.has(theme_code)) problems.push(`"${world_location}": unknown theme_code "${r.theme_code}"`);
    else if (outline.length < 15) problems.push(`"${world_location}": the outline is too short`);
    else if (seen.has(norm(world_location))) problems.push(`"${world_location}" already exists`);
    else {
      seen.add(norm(world_location));
      ideas.push({ world_location, theme_code, outline });
    }
  }
  return { ideas, problems };
}

async function runSuggest(count: number | undefined, channel: string): Promise<NonNullable<BankView["last"]>> {
  const settings = await readSettings();
  const mode = generationMode(settings);
  if (mode === "manual") {
    throw new UserError("Cần Claude API key để đề xuất ý tưởng: vào Cài đặt → “API key của Claude” (hoặc chọn chế độ Demo để thử).");
  }
  if (mode === "claude" && !hasCredentials()) throw new UserError("Chưa có Claude API key — nhập key trong Cài đặt rồi thử lại.");
  if (!(await readChannels()).some((c) => c.id === channel)) throw new UserError("Không tìm thấy kênh.", 404);
  const bank = await readBank();
  const n = clamp(count ?? bank.config.batch, BANK_LIMITS.batch, bank.config.batch);
  const { libs, themes } = await themeList(bank, channel);
  const allowed = new Set(themes.map((t) => t.code));
  // Không trùng ý tưởng nào của mọi kênh; mẫu, số thứ tự và series theo kênh.
  const known = await knownIdeas(bank);
  const mine = await knownIdeas(bank, channel);
  let raw: RawIdeaBatch;
  let cost: number | null = null;
  if (mode === "mock") {
    raw = mockIdeas(n, known, themes);
  } else {
    const res = await callStructured({
      settings,
      system: IDEAS_SYSTEM,
      user: buildIdeasPrompt({ count: n, themes, examples: pickExamples(mine.length ? mine : known), existing: known, series: seriesOf(mine, nextIdeaId(mine)) }),
      schema: IDEAS_SCHEMA,
      validator: zIdeaBatch,
      check: (d) => {
        const c = cleanSuggestions(d.ideas, known, allowed);
        return c.ideas.length < Math.ceil(n / 2) ? `only ${c.ideas.length} of ${n} ideas are usable: ${c.problems.slice(0, 6).join("; ")}` : null;
      },
      maxTokens: 16000,
      price: libs.pricing?.models?.[settings.model],
    });
    raw = res.data;
    cost = res.usage.cost_usd ?? null;
  }

  const at = new Date().toISOString();
  const names = new Map(themes.map((t) => [t.code, t.name]));
  const label = raw.series_name.replace(/^\s*\d+\s*[–-]\s*\d+\s*·\s*/, "").trim() || "Claude đề xuất";
  const added = await updateBank(async (b) => {
    // Đọc lại: trong lúc Claude nghĩ, kho có thể đã thêm ý tưởng.
    const pool = await knownIdeas(b);
    const own = await knownIdeas(b, channel);
    const { ideas } = cleanSuggestions(raw.ideas.slice(0, n), pool, allowed);
    let id = nextIdeaId(own);
    for (const s of ideas) {
      const start = blockStart(id);
      const name = names.get(s.theme_code);
      const idea: IdeaRow = {
        id: String(id++),
        ...s,
        ...(name && name !== s.theme_code ? { theme_name: name } : {}),
        series: seriesOf(own, start) ?? `${start}–${start + SERIES_SIZE - 1} · ${label}`,
        channel,
      };
      own.push(idea);
      pool.push(idea);
      b.ideas.push({ key: newKey(), idea, channel, source: "claude", status: b.config.autoApprove ? "new" : "proposed", added_at: at });
    }
    return ideas.length;
  });
  // Không thêm được ý tưởng nào → báo lỗi (dây chuyền chờ RETRY_MS rồi mới thử lại, không gọi Claude liên tục).
  if (!added) throw new UserError("Claude chưa đưa ra ý tưởng mới nào dùng được (trùng hoặc sai định dạng) — thử lại sau.");
  return { at, channel, added, dropped: raw.ideas.length - added, cost_usd: cost };
}

/** Nhờ Claude (hoặc chế độ Demo) nghĩ thêm ý tưởng cho kênh và đưa vào kho của kênh. Mỗi lúc chỉ một lần; chờ tới khi xong. */
export async function suggestIdeas(count?: number, channel = DEFAULT_CHANNEL_ID): Promise<NonNullable<BankView["last"]>> {
  if (mem.suggesting) throw new UserError("Claude đang nghĩ ý tưởng mới — chờ chút.");
  const run = runSuggest(count, channel);
  mem.suggesting = run.catch(() => {});
  try {
    const last = await run;
    mem.last = last;
    mem.error = null;
    mem.failedAt = 0;
    return last;
  } catch (err) {
    mem.error = (err as Error).message;
    mem.failedAt = Date.now();
    throw err;
  } finally {
    mem.suggesting = null;
  }
}

/**
 * Đề xuất cho kênh, chạy nền; xong (thành công hay lỗi) thì gọi onDone. `force` = người dùng bấm, bỏ qua thời gian chờ sau lỗi.
 * Trả về false nếu không bắt đầu (đang chạy, hoặc vừa lỗi chưa đủ RETRY_MS).
 */
export function startSuggest(onDone: () => void, force = false, channel = DEFAULT_CHANNEL_ID): boolean {
  if (mem.suggesting || (!force && mem.failedAt && Date.now() - mem.failedAt < RETRY_MS)) return false;
  void suggestIdeas(undefined, channel).then(onDone, (err) => {
    console.error("[ideas]", (err as Error).message);
    onDone();
  });
  return true;
}

export const isSuggesting = () => Boolean(mem.suggesting);

/** Chờ lần đề xuất đang chạy xong (dùng cho test). */
export async function suggestIdle(): Promise<void> {
  while (mem.suggesting) await mem.suggesting;
}

const countsOf = (ideas: BankIdea[]) => {
  const counts: Record<BankStatus, number> = { new: 0, proposed: 0, used: 0, rejected: 0 };
  for (const x of ideas) counts[x.status]++;
  return counts;
};

/** Kho ý tưởng của kênh `channel` (không ghi = kênh đầu tiên) + số ý tưởng của từng kênh. */
export async function bankView(channel?: string): Promise<BankView> {
  const b = await readBank();
  const list = await readChannels();
  const current = list.find((c) => c.id === channel) ?? list[0];
  const channels: BankChannel[] = list.map((c) => ({ id: c.id, name: c.name, active: c.active, counts: countsOf(b.ideas.filter((x) => ideaChannel(x) === c.id)) }));
  const mine = b.ideas.filter((x) => ideaChannel(x) === current.id);
  // Bài mới còn lại cho kênh đủ cho mấy video; bật "chỉ lấy ý tưởng khi còn bài mới" thì chỉ bấy nhiêu ý tưởng tới lượt.
  const settings = await readSettings();
  const music = await musicStock(settings, current.id);
  const fresh = mine.filter((x) => x.status === "new");
  const ready = b.config.needSong && music ? fresh.slice(0, Math.max(0, music.videos - (await waitingForMusic(current.id)))) : null;
  return {
    config: b.config,
    channel: current.id,
    channels,
    counts: countsOf(mine),
    ready: ready ? ready.length : null,
    music,
    upcoming: (ready ?? fresh).slice(0, 20),
    proposals: mine.filter((x) => x.status === "proposed"),
    skipped: mine
      .filter((x) => x.note)
      .sort((p, q) => (q.used_at ?? "").localeCompare(p.used_at ?? ""))
      .slice(0, 20),
    library: (await readSongLibrary()).songs.filter((s) => s.lyrics?.trim()).length,
    suggesting: isSuggesting(),
    error: mem.error,
    last: mem.last,
  };
}
