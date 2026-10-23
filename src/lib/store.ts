// Đọc/ghi thư viện cấu hình, cài đặt và lịch sử MV (file JSON trong /data) — chỉ dùng phía server.

import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_SONG_STRUCTURE } from "./structure";
import { countIssues } from "./validate";
import { DEFAULT_PRICING } from "./cost";
import type {
  Character,
  Draft,
  EraRules,
  Libraries,
  LocationLibrary,
  MVResult,
  MVSummary,
  Pricing,
  Settings,
  StyleLibrary,
  ThemeLibrary,
  VideoModelLibrary,
} from "./types";

// turbopackIgnore: không để lúc build Turbopack đưa cả thư mục dự án (video trong data/media, profile Chrome của Muse…) vào trace.
export const DATA_DIR = process.env.MV_DATA_DIR
  ? path.resolve(/*turbopackIgnore: true*/ process.env.MV_DATA_DIR)
  : path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
/** Đường dẫn trong thư mục data (đánh dấu để Turbopack không trace cả dự án). */
const dataPath = (...parts: string[]) => path.join(/*turbopackIgnore: true*/ DATA_DIR, ...parts);
const HISTORY_DIR = () => dataPath("history");
export const UPLOAD_DIR = () => dataPath("uploads");
/** Nhạc, clip và video đã dựng của từng MV: data/media/<mvId>/ */
export const MEDIA_DIR = () => dataPath("media");
/** Hàng chờ dựng video. */
export const QUEUE_FILE = () => dataPath("render_queue.json");
/** Các cảnh đang tạo clip bằng Muse. */
export const MUSE_FILE = () => dataPath("muse.json");
/** Dây chuyền tự động (kịch bản → bài hát → clip Muse → MP4). */
export const PIPELINE_FILE = () => dataPath("pipeline.json");
/** Kho ý tưởng (của bạn + Claude đề xuất), đánh dấu đã dùng / chưa dùng. */
export const IDEAS_FILE = () => dataPath("ideas.json");
/** Thư viện lời bài hát của kho nhạc (mỗi số bài: địa điểm, chủ đề, dàn ý, lời) — tạo từ thư mục bài hát trên Google Drive. */
export const SONG_LIBRARY_FILE = () => dataPath("song_library.json");
/** Kết quả lần đồng bộ kho nhạc từ Google Drive gần nhất. */
export const DRIVE_SYNC_FILE = () => dataPath("drive_sync.json");
/** Các kênh: cài đặt xếp bài và lịch sử bài từng video của mỗi kênh (thay cho sổ bài đã dùng songs_used.json của bản trước). */
export const CHANNELS_FILE = () => dataPath("channels.json");
/** Phiên đăng nhập cổng điều khiển từ xa (chỉ lưu bản băm của mã phiên, không lưu mật khẩu). */
export const REMOTE_SESSIONS_FILE = () => dataPath("remote_sessions.json");

export const LIBRARY_FILES = {
  themes: "themes.json",
  locations: "locations.json",
  eraRules: "era_rules.json",
  styles: "style_presets.json",
  videoModels: "video_models.json",
  pricing: "pricing.json",
} as const;
export type LibraryName = keyof typeof LIBRARY_FILES;

export const DEFAULT_SETTINGS: Settings = {
  model: "claude-sonnet-5-5",
  effort: "medium",
  useFallback: true,
  videoModel: "muse",
  clipLen: null,
  maxShots: 30,
  minShots: 20,
  loopScenes: true,
  defaultDuration: 250,
  stylePreset: "kodachrome",
  fixedCouple: false,
  concurrency: 2,
  allowVehicleMakes: true,
  channelVoice: "Pull up a chair by the fire… Warm, nostalgic, second-person storytelling that invites the listener into a snowy 1950s American Christmas.",
  engine: "auto",
  songStructure: DEFAULT_SONG_STRUCTURE,
  museMode: "gateway",
  museDataDir: "",
  songDir: "",
  museAutoRender: true,
  museAvoid: true,
  museSkipFailed: 20,
  driveFolder: "",
  driveAutoSync: true,
  monitorEnabled: false,
  // App cũ (MV Prompt Studio) dùng 3300 — app Giáng sinh dùng 3301 để chạy song song trên cùng máy.
  monitorPort: 3301,
  remoteControl: false,
  updateRepo: "vhung-spec/christmas-mv-studio",
  updateBranch: "christmas",
  autoUpdate: true,
  eraShare: 40,
  videoMinutes: 60,
  songSheet: "",
  resultsDir: "KET QUA GIANG SINH",
};

// ---------- Khoá theo tên (tránh ghi đè đồng thời trong cùng tiến trình) ----------

const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  locks.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw new Error(`Không đọc được ${path.basename(file)}: ${(err as Error).message}`);
  }
}

/**
 * Đổi tên file tạm thành file thật. Windows đôi khi chặn trong tích tắc (EPERM / EBUSY / EACCES — file vừa ghi đang bị
 * phần mềm diệt virus / chỉ mục quét) → thử lại vài lần trước khi báo lỗi.
 */
export async function renameWithRetry(from: string, to: string) {
  for (let i = 0; ; i++) {
    try {
      return await fs.rename(from, to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (i >= 10 || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "")) throw err;
      await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    }
  }
}

export async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await renameWithRetry(tmp, file);
}

// ---------- Thư viện ----------

export async function readLibrary<K extends LibraryName>(name: K): Promise<Libraries[K]> {
  const empty = (
    name === "eraRules"
      ? { global_forbidden: [], introduced: [], vehicle_makes: [], brands_and_people: [], on_screen_text_patterns: [], years: {} }
      : name === "pricing"
        ? DEFAULT_PRICING
        : {}
  ) as Libraries[K];
  return readJson(dataPath(LIBRARY_FILES[name]), empty);
}

export async function writeLibrary<K extends LibraryName>(name: K, data: Libraries[K]) {
  await withLock(`lib:${name}`, () => writeJson(dataPath(LIBRARY_FILES[name]), data));
}

export async function readLibraries(): Promise<Libraries> {
  const [themes, locations, eraRules, styles, videoModels, pricing] = await Promise.all([
    readLibrary("themes") as Promise<ThemeLibrary>,
    readLibrary("locations") as Promise<LocationLibrary>,
    readLibrary("eraRules") as Promise<EraRules>,
    readLibrary("styles") as Promise<StyleLibrary>,
    readLibrary("videoModels") as Promise<VideoModelLibrary>,
    readLibrary("pricing") as Promise<Pricing>,
  ]);
  return { themes, locations, eraRules, styles, videoModels, pricing };
}

/** Thêm/cập nhật một địa điểm (dùng cho địa điểm LLM tự suy luận). */
export async function upsertLocation(key: string, data: LocationLibrary[string]) {
  await withLock("lib:locations", async () => {
    const file = dataPath(LIBRARY_FILES.locations);
    const lib = await readJson<LocationLibrary>(file, {});
    lib[key] = data;
    await writeJson(file, lib);
  });
}

// ---------- Cài đặt ----------

export async function readSettings(): Promise<Settings> {
  const saved = await readJson<Partial<Settings> & { mockMode?: boolean }>(dataPath("settings.json"), {});
  const { mockMode, ...rest } = saved;
  const merged: Settings = { ...DEFAULT_SETTINGS, ...rest };
  // Cài đặt cũ dùng mockMode (true/false) thay cho engine.
  if (!rest.engine && mockMode) merged.engine = "demo";
  if (!merged.songStructure?.length) merged.songStructure = DEFAULT_SONG_STRUCTURE;
  // Thư mục nhạc / kết quả ghi dạng tương đối (vd. "KHO NHAC") = thư mục cạnh thư mục app, ổ nào cũng chạy được.
  for (const k of ["songDir", "resultsDir"] as const) {
    if (merged[k].trim() && !path.isAbsolute(merged[k].trim())) merged[k] = path.resolve(/*turbopackIgnore: true*/ path.dirname(process.cwd()), merged[k].trim());
  }
  return merged;
}

export async function writeSettings(settings: Settings) {
  await withLock("settings", () => writeJson(dataPath("settings.json"), settings));
}

// ---------- Cặp đôi cố định theo series ----------

export type CoupleLibrary = Record<string, { characters: Character[]; created_at: string }>;

export async function readCouples(): Promise<CoupleLibrary> {
  return readJson<CoupleLibrary>(dataPath("couples.json"), {});
}

export async function writeCouples(data: CoupleLibrary) {
  await withLock("couples", () => writeJson(dataPath("couples.json"), data));
}

// ---------- Lịch sử MV ----------

export const SAFE_ID = /^[a-z0-9_-]{4,80}$/i;

export function newMvId(): string {
  return `mv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mvFile(id: string) {
  if (!SAFE_ID.test(id)) throw new Error("ID MV không hợp lệ");
  return path.join(/*turbopackIgnore: true*/ HISTORY_DIR(), `${id}.json`);
}

export async function saveMV(mv: MVResult) {
  await withLock(`mv:${mv.id}`, () => writeJson(mvFile(mv.id), mv));
}

export async function loadMV(id: string): Promise<MVResult | null> {
  return readJson<MVResult | null>(mvFile(id), null);
}

export async function deleteMV(id: string) {
  await fs.rm(mvFile(id), { force: true });
  // Xoá luôn nhạc / clip / video đã dựng của MV (file đang mở trên Windows thì bỏ qua).
  await fs.rm(path.join(/*turbopackIgnore: true*/ MEDIA_DIR(), id), { recursive: true, force: true }).catch(() => undefined);
}

export async function listMVs(): Promise<MVResult[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(HISTORY_DIR())).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const all = await Promise.all(files.map((f) => readJson<MVResult | null>(path.join(/*turbopackIgnore: true*/ HISTORY_DIR(), f), null).catch(() => null)));
  return all.filter((m): m is MVResult => Boolean(m)).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function summarize(mv: MVResult): MVSummary {
  const { errors, warnings } = countIssues(mv.issues);
  return {
    id: mv.id,
    created_at: mv.created_at,
    updated_at: mv.updated_at,
    idea_id: mv.idea.id,
    song_title: mv.idea.song_title ?? "",
    world_location: mv.idea.world_location,
    year: mv.year,
    theme_code: mv.theme_code,
    theme_name: mv.theme.name,
    series: mv.idea.series ?? "",
    shot_count: mv.shots.length,
    error_count: errors,
    warning_count: warnings,
    generator: mv.generator,
    cost_usd: mv.usage?.cost_usd ?? 0,
  };
}

// ---------- Bản nháp chờ câu trả lời từ claude.ai ----------

const DRAFT_DIR = () => dataPath("drafts");

export function newDraftId(): string {
  return `dr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function draftFile(id: string) {
  if (!SAFE_ID.test(id)) throw new Error("ID bản nháp không hợp lệ");
  return path.join(/*turbopackIgnore: true*/ DRAFT_DIR(), `${id}.json`);
}

export async function saveDraft(d: Draft) {
  await withLock(`draft:${d.id}`, () => writeJson(draftFile(d.id), d));
}

export async function loadDraft(id: string): Promise<Draft | null> {
  return readJson<Draft | null>(draftFile(id), null);
}

export async function deleteDraft(id: string) {
  await fs.rm(draftFile(id), { force: true });
}

export async function listDrafts(): Promise<Draft[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(DRAFT_DIR())).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const all = await Promise.all(files.map((f) => readJson<Draft | null>(path.join(/*turbopackIgnore: true*/ DRAFT_DIR(), f), null).catch(() => null)));
  return all.filter((d): d is Draft => Boolean(d)).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
