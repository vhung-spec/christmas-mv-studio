// KHO Ý TƯỞNG — ý tưởng của bạn (dán bảng) và ý tưởng Claude đề xuất, đánh dấu đã dùng / chưa dùng.
// Dây chuyền tự động lấy dần ý tưởng chưa dùng (mỗi lúc vài MV, xem feedFromBank trong pipeline.ts); kho sắp hết thì
// nhờ Claude nghĩ thêm — chờ bạn duyệt, hoặc dùng luôn nếu bật "Tự duyệt". Lưu ở data/ideas.json. Chỉ dùng phía server.

import { randomUUID } from "node:crypto";
import { UserError } from "./errors";
import { generationMode } from "./generate";
import { BANK_LIMITS, DEFAULT_BANK_CONFIG, type BankConfig, type BankStatus, type BankView, type IdeaBank } from "./ideaBankTypes";
import { callStructured, hasCredentials } from "./llm";
import { IDEAS_SCHEMA, zIdeaBatch, type RawIdeaBatch } from "./llmSchemas";
import { mockIdeas } from "./mock";
import { extractYear, splitThemeCell } from "./parser";
import { IDEAS_SYSTEM, buildIdeasPrompt } from "./prompts";
import { readSongLibrary } from "./songLibrary";
import { IDEAS_FILE, PIPELINE_FILE, listMVs, readJson, readLibraries, readSettings, withLock, writeJson } from "./store";
import type { IdeaRow } from "./types";

/** Lần đề xuất tự động bị lỗi thì chờ chừng này mới tự thử lại (bấm "Nhờ Claude đề xuất ngay" thì thử luôn). */
const RETRY_MS = 30 * 60 * 1000;
/** Mỗi series 50 ý tưởng, như bảng gốc ("1–50 · …", "51–100 · …"). */
const SERIES_SIZE = 50;

// Trạng thái trong tiến trình: lần đề xuất đang chạy, lỗi và kết quả lần gần nhất.
const g = globalThis as unknown as {
  __mvIdeaBank?: { suggesting: Promise<unknown> | null; error: string | null; failedAt: number; last: BankView["last"] };
};
const mem = (g.__mvIdeaBank ??= { suggesting: null, error: null, failedAt: 0, last: null });

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
const sameIdea = (i: IdeaRow) => `${norm(i.world_location)}|${norm(i.outline)}`;

/** Thêm ý tưởng của bạn vào kho (bỏ qua ý tưởng đã có: trùng địa điểm + dàn ý). */
export async function addIdeas(rows: IdeaRow[]): Promise<{ added: number; skipped: number }> {
  if (!rows.length) throw new UserError("Chưa có ý tưởng nào.");
  return updateBank((b) => {
    const seen = new Set(b.ideas.map((x) => sameIdea(x.idea)));
    const now = new Date().toISOString();
    let added = 0;
    for (const idea of rows) {
      const k = sameIdea(idea);
      if (seen.has(k)) continue;
      seen.add(k);
      b.ideas.push({ key: newKey(), idea, source: "user", status: "new", added_at: now });
      added++;
    }
    return { added, skipped: rows.length - added };
  });
}

/**
 * Lấy n ý tưởng chưa dùng (theo thứ tự trong kho) và đánh dấu đã dùng. `skip` trả về lý do thì ý tưởng đó cũng được đánh dấu
 * đã dùng (kèm lý do) nhưng không lấy — vd. nhạc của bài đã dùng hết.
 */
export async function takeIdeas(n: number, skip?: (idea: IdeaRow) => Promise<string | null>): Promise<IdeaRow[]> {
  if (n <= 0 || !(await readBank()).ideas.some((x) => x.status === "new")) return [];
  return updateBank(async (b) => {
    const now = new Date().toISOString();
    const out: IdeaRow[] = [];
    for (const x of b.ideas) {
      if (out.length >= n) break;
      if (x.status !== "new") continue;
      const reason = skip ? await skip(x.idea) : null;
      x.status = "used";
      x.used_at = now;
      if (reason) x.note = reason;
      else out.push(x.idea);
    }
    return out;
  });
}

/** Duyệt (đề xuất → chưa dùng) hoặc bỏ ý tưởng. keys = "proposed" → mọi ý tưởng đang chờ duyệt. Trả về số ý tưởng đã đổi. */
export function setIdeas(keys: string[] | "proposed", action: "approve" | "reject"): Promise<number> {
  return updateBank((b) => {
    let n = 0;
    for (const x of b.ideas) {
      if (keys === "proposed" ? x.status !== "proposed" : !keys.includes(x.key)) continue;
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
    for (const k of ["feed", "suggest", "autoApprove"] as const) if (typeof patch[k] === "boolean") c[k] = patch[k];
    if (patch.ahead !== undefined) c.ahead = clamp(patch.ahead, BANK_LIMITS.ahead, c.ahead);
    if (patch.batch !== undefined) c.batch = clamp(patch.batch, BANK_LIMITS.batch, c.batch);
    b.config = c;
    return c;
  });
}

// ---------- Claude đề xuất ý tưởng mới ----------

/** Mọi ý tưởng app đã biết: các MV đã viết, việc trong dây chuyền, kho (kể cả đã bỏ) — để không đề xuất trùng. */
async function knownIdeas(bank: IdeaBank): Promise<IdeaRow[]> {
  const pipeline = await readJson<{ items: { idea?: IdeaRow }[] }>(PIPELINE_FILE(), { items: [] });
  const all = [...(await listMVs()).map((m) => m.idea), ...pipeline.items.flatMap((i) => (i.idea ? [i.idea] : [])), ...bank.ideas.map((x) => x.idea)];
  const seen = new Set<string>();
  return all.filter((i) => {
    const k = sameIdea(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Chủ đề trong thư viện + chủ đề đã gặp trong kho (bảng gốc có thể dùng mã chưa có trong thư viện), kèm số lần dùng. */
async function themeList(bank: IdeaBank) {
  const libs = await readLibraries();
  const names = new Map<string, string>(Object.entries(libs.themes).map(([code, t]) => [code, t.name]));
  const used = new Map<string, number>();
  for (const x of bank.ideas) {
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

async function runSuggest(count?: number): Promise<NonNullable<BankView["last"]>> {
  const settings = await readSettings();
  const mode = generationMode(settings);
  if (mode === "manual") {
    throw new UserError("Cần Claude API key để đề xuất ý tưởng: vào Cài đặt → “API key của Claude” (hoặc chọn chế độ Demo để thử).");
  }
  if (mode === "claude" && !hasCredentials()) throw new UserError("Chưa có Claude API key — nhập key trong Cài đặt rồi thử lại.");
  const bank = await readBank();
  const n = clamp(count ?? bank.config.batch, BANK_LIMITS.batch, bank.config.batch);
  const { libs, themes } = await themeList(bank);
  const allowed = new Set(themes.map((t) => t.code));
  const known = await knownIdeas(bank);
  let raw: RawIdeaBatch;
  let cost: number | null = null;
  if (mode === "mock") {
    raw = mockIdeas(n, known, themes);
  } else {
    const res = await callStructured({
      settings,
      system: IDEAS_SYSTEM,
      user: buildIdeasPrompt({ count: n, themes, examples: pickExamples(known), existing: known, series: seriesOf(known, nextIdeaId(known)) }),
      schema: IDEAS_SCHEMA,
      validator: zIdeaBatch,
      check: (d) => {
        const c = cleanSuggestions(d.ideas, known, allowed);
        return c.ideas.length >= Math.ceil(n / 2) ? null : `only ${c.ideas.length} of ${n} ideas are usable: ${c.problems.slice(0, 6).join("; ")}`;
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
    const { ideas } = cleanSuggestions(raw.ideas.slice(0, n), pool, allowed);
    let id = nextIdeaId(pool);
    for (const s of ideas) {
      const start = blockStart(id);
      const name = names.get(s.theme_code);
      const idea: IdeaRow = {
        id: String(id++),
        ...s,
        ...(name && name !== s.theme_code ? { theme_name: name } : {}),
        series: seriesOf(pool, start) ?? `${start}–${start + SERIES_SIZE - 1} · ${label}`,
      };
      pool.push(idea);
      b.ideas.push({ key: newKey(), idea, source: "claude", status: b.config.autoApprove ? "new" : "proposed", added_at: at });
    }
    return ideas.length;
  });
  // Không thêm được ý tưởng nào → báo lỗi (dây chuyền chờ RETRY_MS rồi mới thử lại, không gọi Claude liên tục).
  if (!added) throw new UserError("Claude chưa đưa ra ý tưởng mới nào dùng được (trùng hoặc sai định dạng) — thử lại sau.");
  return { at, added, dropped: raw.ideas.length - added, cost_usd: cost };
}

/** Nhờ Claude (hoặc chế độ Demo) nghĩ thêm ý tưởng và đưa vào kho. Mỗi lúc chỉ một lần; chờ tới khi xong. */
export async function suggestIdeas(count?: number): Promise<NonNullable<BankView["last"]>> {
  if (mem.suggesting) throw new UserError("Claude đang nghĩ ý tưởng mới — chờ chút.");
  const run = runSuggest(count);
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
 * Đề xuất chạy nền; xong (thành công hay lỗi) thì gọi onDone. `force` = người dùng bấm, bỏ qua thời gian chờ sau lỗi.
 * Trả về false nếu không bắt đầu (đang chạy, hoặc vừa lỗi chưa đủ RETRY_MS).
 */
export function startSuggest(onDone: () => void, force = false): boolean {
  if (mem.suggesting || (!force && mem.failedAt && Date.now() - mem.failedAt < RETRY_MS)) return false;
  void suggestIdeas().then(onDone, (err) => {
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

export async function bankView(): Promise<BankView> {
  const b = await readBank();
  const counts: Record<BankStatus, number> = { new: 0, proposed: 0, used: 0, rejected: 0 };
  for (const x of b.ideas) counts[x.status]++;
  return {
    config: b.config,
    counts,
    upcoming: b.ideas.filter((x) => x.status === "new").slice(0, 20),
    proposals: b.ideas.filter((x) => x.status === "proposed"),
    skipped: b.ideas
      .filter((x) => x.note)
      .sort((p, q) => (q.used_at ?? "").localeCompare(p.used_at ?? ""))
      .slice(0, 20),
    library: (await readSongLibrary()).songs.filter((s) => s.lyrics?.trim()).length,
    suggesting: isSuggesting(),
    error: mem.error,
    last: mem.last,
  };
}
