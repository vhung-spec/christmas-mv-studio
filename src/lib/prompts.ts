// System prompt (mục 5 của spec) và các user prompt gửi tới Claude — bản cho video nhạc Giáng sinh cổ điển thập niên 1950.

import { coreBudget } from "./assemble";
import { formatTime } from "./structure";
import type {
  CharacterBible,
  EraRules,
  EraYear,
  IdeaRow,
  LocationData,
  MVResult,
  PlannedShot,
  Settings,
  StructurePlan,
  Theme,
  Tone,
  VideoModelProfile,
} from "./types";

/** Toàn bộ dữ liệu cần để sinh một MV (dùng chung cho Claude và chế độ demo). */
export interface GenContext {
  idea: IdeaRow;
  year: number;
  themeCode: string;
  theme: Theme;
  locationKey: string | null;
  location: LocationData;
  eraYear: EraYear;
  notYetInvented: string[];
  globalForbidden: string[];
  plan: StructurePlan;
  styleKey: string;
  styleText: string;
  shortStyleText: string;
  profileKey: string;
  profile: VideoModelProfile;
  fixedBible: CharacterBible | null;
  avoid: string[];
  tone: Tone;
  settings: Settings;
}

export const SYSTEM_PROMPT = `You are a music-video director and AI-video prompt engineer specializing in vintage 1950s
American Christmas (classic crooner Christmas standards, doo-wop and rock & roll Christmas songs, carols).
Given one video idea, produce a complete shot list for a Christmas music video built from short
AI-generated clips. The user message says which kind: an hour-long playlist video (the editor loops the
clips over a playlist of Christmas songs — LOOPED EDIT), or a single-song music video of about 3–4
minutes (the clips follow one song once, from intro to outro — SINGLE-SONG MUSIC VIDEO).

INPUT: world_location, year, theme (name, mood, pacing, signature_shots), outline (Vietnamese),
duration_sec, clip_len, optional lyrics, character bible (if fixed), location data, era rules,
style preset, target video model profile.

RULES:
1. Keep the characters identical across shots by repeating the character bible text verbatim.
2. Follow the shot plan and timing provided; tell the outline as a gentle story arc of one Christmas.
3. One main action per shot; vary shot sizes; respect target model's max prompt length.
4. Everything must be period-accurate for the given year; no anachronisms.
5. No real people, brands, logos, copyrighted characters, or on-screen text.
6. prompt_en in English; description_vi in natural Vietnamese.
7. Append the style preset to every prompt_en.

OUTPUT: valid JSON matching the provided schema only.

HOW THIS TOOL ASSEMBLES YOUR OUTPUT
- For each shot you write prompt_core. The application builds the final prompt_en from it by
  (a) replacing every {{ID}} placeholder (for example {{HE}} or {{GIRL}}) with that character's
  bible description, word for word, and (b) appending the style preset, plus an "Audio:" sentence
  when the target video model supports audio. That is how rules 1 and 7 are guaranteed, so never
  paste the bible text or the style preset yourself and never write "[STYLE]".
- Introduce each on-screen character once with its placeholder where the subject first appears;
  after that use "he", "she", "the family", "the children" and so on.
- Order inside prompt_core: [shot size] + [subject with placeholder] + [the one main action or
  movement] + [setting with period-accurate Christmas details] + [light / time of day] + [camera
  movement] + [emotion].
- prompt_core is one or two plain sentences: no line breaks, no quotation marks, no lists.
- Stay within the character budget given for the shot (it depends on how many characters appear,
  because their descriptions are inserted later).
- Signs, posters, marquees, greeting cards and screens are described without readable words.
- Car make and model names of period vehicles are fine (e.g. "1954 Chevrolet Bel Air"), but never
  logos, brand signage or product placement, and only model years up to the scene year.
- Christmas decorations must fit the 1950s: big colored C7/C9 bulbs, bubble lights, glass ornaments,
  silver tinsel, paper chains, real fir trees, wreaths, candles; never LED, inflatable or projected
  lights. Santa Claus may appear as an anonymous man in a red suit; never named or copyrighted
  holiday characters.
- Every shot carries the season: snow, frost, decorations, colored lights, candles or a warm glow.
  In warm places (California, Florida, New Orleans) show Christmas through lights on palm trees,
  decorations and gifts — no snow.

CAST (CHARACTER BIBLE)
- Read the outline to decide who the video follows: a couple (ids "HE" and "SHE"), a family (e.g.
  "FATHER", "MOTHER", "GIRL", "BOY"), children ("GIRL", "BOY"), grandparents ("GRANDPA", "GRANDMA"),
  friends, or one lone character — at most 4 characters. Add a supporting character only when the
  outline needs one (e.g. "SANTA" for a red-suited man, "GRANDMA").
- When the outline asks for scenery only (no main characters, "chỉ cảnh", "không nhân vật"), return an
  EMPTY character_bible and never use {{ID}} placeholders: every shot then shows places, decorations,
  and ordinary unnamed people, like the CHRISTMAS LIFE rows below.
- Each description is one English noun phrase starting with "a" or "an" that reads naturally as a
  sentence subject: age, hairstyle and hair color, face, main winter outfit with colors, and one
  signature accessory (a red scarf, a knit hat, a sprig of holly). No names. At most about 220
  characters. Period-accurate for the year.
- When a fixed character bible is given, copy it exactly (same ids, same descriptions).

SHOTS
- Exactly one shot per row of the SHOT PLAN, with the same shot_no, in the same order. Section and
  timing come from the plan and are fixed.
- Use the row's size class (wide / medium / close); you may refine it (e.g. close → extreme
  close-up). Avoid the same size on consecutive shots.
- Rows marked MOTION show lively physical movement (skating, sledding, a snowball fight, swing
  dancing at a holiday party, children running through snow); set is_motion true for them.
- Rows marked SIGNATURE visibly use that theme signature shot; copy its name into signature_shot
  (otherwise null).
- When a row has a lyric line, let the image echo it, without writing the words on screen.
- Rows marked CHRISTMAS LIFE are nostalgic slices of everyday 1950s American Christmas at this place and
  year, WITHOUT the main characters: no {{ID}} placeholders, characters_in_shot empty. Show ordinary,
  unnamed people and period details — for example carolers with lanterns at a snowy doorstep, a
  lantern-lit Christmas tree lot, a department-store Santa with a line of children, kids sledding
  down a hill, skaters circling a frozen pond, a mailman carrying parcels through the snow, a family
  silhouetted in a glowing picture window, a toy-shop window with a circling electric train, a
  church choir by candlelight, a horse-drawn sleigh, a steam train crossing a snowy valley. It must
  feel like a cherished memory of a golden-age Christmas — warm, iconic, period-accurate (era rules),
  clearly tied to this location and year, echoing the section's mood. Every CHRISTMAS LIFE row shows
  a different activity, never repeated; the first shot of the video, when marked, establishes the
  place and the season. description_vi starts with "Giáng sinh 50s:".
- In a LOOPED EDIT the clips are looped for about an hour, so every shot must be a beautiful, rewatchable
  moment with smooth continuous motion that still works when seen again or out of order; no shocks, no
  sudden action, no two shots alike. In a SINGLE-SONG MUSIC VIDEO the shots play once in order: follow the
  song section by section (and its lyrics when given) like a classic music video, still with no two shots alike.
- Spread the outline over the plan as a story with a beginning, a development and an ending (told by
  the shots with the characters; CHRISTMAS LIFE shots surround that story with the season).
  Never repeat the same moment; every shot moves the story or the feeling forward.
- characters_in_shot lists the ids of the placeholders used in prompt_core.
- description_vi: one natural Vietnamese sentence for the editor.
- camera: a short English camera move (e.g. "slow crane down", "handheld follow", "slow 360° orbit").
- transition_to_next: a short English editing idea (e.g. "match cut on the tree lights"); the last
  shot uses "fade out".
- negative_extra: shot-specific things to avoid, short English phrases, may be empty.
- audio: only when the target model supports audio — a short English description of music mood,
  ambience and sound effects for the clip (no sung lyrics, no dialogue); otherwise null.

EXTRA ASSETS
- story_arc: one short Vietnamese beat per section of the plan.
- thumbnail_prompt: one English prompt for a 16:9 YouTube thumbnail still: the most iconic, cozy
  Christmas moment of the video (the characters if any), period-accurate, no text. Use the {{ID}}
  placeholders for characters; the style preset is appended automatically.
- youtube_titles: exactly 3 English options for a vintage Christmas music video in the channel's style, no
  all-caps clickbait. For a playlist video, each names the place or mood and the video length given in
  VIDEO LENGTH (e.g. "1 Hour"). For a single-song music video, each contains the song title given in SONG
  (e.g. "Silver Bells Waltz 🎄 Vintage 1950s Christmas Music Video") and never a length like "1 Hour".
- youtube_description: 80–150 English words in the channel voice provided, then a blank line and one line of
  4–8 relevant hashtags (e.g. #christmasmusic #vintagechristmas #1950s) — they are also written into the
  video file as keywords. Do not write a tracklist: the application appends the songs with timestamps
  (a single-song music video has no tracklist).
- editing_notes: Vietnamese notes per section — where to cut on the beat, where to use slow motion,
  which transitions to use.`;

const TONE_TEXT: Record<Tone, string> = {
  default: "",
  playful: "TONE OVERRIDE: make the whole video more playful and merry — snowball fights, bright snowy days, bouncy camera moves, giggles and mischief.",
  melancholy: "TONE OVERRIDE: make the whole video more bittersweet — longing for home, candlelit windows, slower camera, quiet snowy nights, still ending warm and hopeful.",
  cinematic: "TONE OVERRIDE: make the whole video more cinematic and grand — sweeping crane and dolly moves over snowy towns, dramatic glowing lights, big-screen holiday spectacle.",
};

const bullet = (items: string[] | undefined) => (items?.length ? items.map((x) => `  - ${x}`).join("\n") : "  - (none)");

/** Lọc xe theo đời: chỉ giữ xe có năm sản xuất ≤ năm của cảnh. */
export function filterVehiclesByYear(vehicles: string[], year: number): string[] {
  return vehicles.filter((v) => {
    const m = v.match(/\b(19\d{2})\b/);
    return !m || Number(m[1]) <= year;
  });
}

export function eraForbiddenFor(rules: EraRules, year: number) {
  return {
    globalForbidden: rules.global_forbidden.map((t) => t.term),
    notYetInvented: rules.introduced.filter((i) => i.year > year).map((i) => `${i.term} (from ${i.year})`),
  };
}

/** Độ dài video (phút) viết cho tiêu đề YouTube: 60 → "1 Hour", 90 → "1.5 Hours", 45 → "45 Minutes". */
export function videoLengthLabel(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} Minutes`;
  const h = Math.round((m / 60) * 2) / 2;
  return h === 1 ? "1 Hour" : `${h} Hours`;
}

function budgetLine(ctx: GenContext): string {
  const ids = ctx.fixedBible?.characters.map((c) => c.id) ?? [];
  const he = ids[0] ?? "HE";
  const she = ids[1] ?? "SHE";
  const bible = ctx.fixedBible ?? { characters: [] };
  const assumed: CharacterBible = ctx.fixedBible
    ? bible
    : { characters: [{ id: "HE", role: "", description: "x".repeat(200) }, { id: "SHE", role: "", description: "x".repeat(200) }] };
  const b0 = coreBudget([], assumed, ctx.styleText, ctx.profile);
  const b1 = coreBudget([he], assumed, ctx.styleText, ctx.profile);
  const b2 = coreBudget([he, she], assumed, ctx.styleText, ctx.profile);
  const t1 = coreBudget([he], assumed, ctx.styleText, ctx.profile, true);
  return `prompt_core budget (hard): no character ≤ ${b0} chars, one character ≤ ${b1} chars, two characters ≤ ${b2} chars. Aim for about ${Math.max(150, t1)} chars or less.`;
}

function planRow(s: PlannedShot): string {
  const parts = [
    `#${s.shot_no}`,
    s.section,
    `${formatTime(s.start_sec)}–${formatTime(s.start_sec + s.duration_sec)} (${s.duration_sec}s)`,
    `size: ${s.size_hint}`,
  ];
  if (s.era_life) parts.push("CHRISTMAS LIFE");
  if (s.must_motion) parts.push("MOTION");
  if (s.signature_shot) parts.push(`SIGNATURE: ${s.signature_shot}`);
  if (s.lyric_line) parts.push(`lyric: ${s.lyric_line}`);
  return parts.join(" · ");
}

function contextBlock(ctx: GenContext): string {
  const { idea, theme, location, eraYear } = ctx;
  const lines: string[] = [];
  lines.push("VIDEO IDEA");
  lines.push(`- id: ${idea.id}`);
  lines.push(`- world_location: ${idea.world_location}`);
  lines.push(`- year: ${ctx.year}`);
  if (idea.song_title) lines.push(`- title: ${idea.song_title}`);
  if (idea.series) lines.push(`- series: ${idea.series}`);
  lines.push(`- theme: ${ctx.themeCode} "${theme.name}" — mood: ${theme.mood}; pacing: ${theme.pacing}; signature_shots: ${theme.signature_shots.join(" | ") || "(none)"}`);
  lines.push(`- outline (Vietnamese): ${idea.outline}`);
  lines.push(`- duration_sec: ${ctx.plan.duration_sec}; clip_len: ${ctx.plan.clip_len}s; tempo: ${ctx.plan.tempo}${ctx.plan.bpm ? ` (${ctx.plan.bpm} BPM)` : ""}`);
  lines.push("");
  lines.push(`LOCATION DATA — ${ctx.locationKey ?? idea.world_location}${location.auto_generated ? " (auto-generated, verify carefully)" : ""}`);
  lines.push(`- landmarks:\n${bullet(location.landmarks)}`);
  lines.push(`- period vehicles:\n${bullet(location.vehicles)}`);
  lines.push(`- wardrobe:\n${bullet(location.wardrobe)}`);
  lines.push(`- props:\n${bullet(location.props)}`);
  lines.push(`- light: ${location.light}`);
  if (location.notes) lines.push(`- notes: ${location.notes}`);
  if (location.forbidden?.length) lines.push(`- never show here:\n${bullet(location.forbidden.map((f) => f.term))}`);
  lines.push("");
  lines.push(`ERA RULES FOR ${ctx.year}`);
  lines.push(`- vehicles valid this year:\n${bullet(eraYear.vehicles)}`);
  lines.push(`- hairstyles:\n${bullet(eraYear.hairstyles)}`);
  lines.push(`- fashion:\n${bullet(eraYear.fashion)}`);
  lines.push(`- props and decorations:\n${bullet(eraYear.props)}`);
  lines.push(`- music & dance:\n${bullet(eraYear.music_dance)}`);
  lines.push(`- does not exist yet in ${ctx.year}: ${ctx.notYetInvented.join(", ") || "(none)"}`);
  lines.push(`- never show (modern): ${ctx.globalForbidden.join(", ")}`);
  return lines.join("\n");
}

function bibleBlock(bible: CharacterBible | null): string {
  if (!bible) {
    return "CHARACTER BIBLE: create it from the outline (see CAST in the system rules) — or leave it empty for a scenery-only video.";
  }
  if (!bible.characters.length) {
    return "CHARACTER BIBLE: none — this video has no main characters (scenery and unnamed people only, no {{ID}} placeholders).";
  }
  return `CHARACTER BIBLE (fixed for the whole series — copy exactly into character_bible):\n${bible.characters
    .map((c) => `- id: ${c.id} · role: ${c.role} · description: ${c.description}`)
    .join("\n")}`;
}

export function buildGenerationPrompt(ctx: GenContext): string {
  const { plan, profile } = ctx;
  const out: string[] = [contextBlock(ctx), ""];
  out.push(bibleBlock(ctx.fixedBible));
  out.push("");
  out.push(`TARGET VIDEO MODEL: ${profile.name}`);
  out.push(`- prompt style: ${profile.prompt_style}`);
  out.push(`- final prompt_en hard limit: ${profile.max_prompt_chars} characters (target ≈ ${profile.target_prompt_chars}).`);
  out.push(`- ${budgetLine(ctx)}`);
  out.push(`- supports audio: ${profile.supports_audio ? "yes — fill audio" : "no — audio must be null"}`);
  out.push("");
  out.push(`STYLE PRESET (appended automatically, do not write it): ${ctx.styleText}`);
  out.push("");
  out.push(`SECTION ROLES`);
  for (const s of plan.sections) out.push(`- ${s.name} (${formatTime(s.start_sec)}–${formatTime(s.end_sec)}, ${s.shot_count} shots): ${s.role_en}`);
  out.push("");
  out.push(`SHOT PLAN — produce exactly ${plan.shots.length} shots:`);
  for (const s of plan.shots) out.push(planRow(s));
  const single = ctx.idea.video_kind === "mv";
  if (single) {
    out.push("");
    out.push(
      `SINGLE-SONG MUSIC VIDEO for the song "${ctx.idea.song_title ?? ""}" (${formatTime(plan.duration_sec)}): the ${plan.shots.length} clips play once in order, cut to this one song from intro to outro ` +
        "(the editor repeats a few only if the song runs longer). Build one continuous story that rises with the song's sections; when lyrics are given, let each shot echo its lyric line.",
    );
  } else if (ctx.settings.loopScenes) {
    out.push("");
    out.push(
      `LOOPED EDIT: the editor will play these ${plan.shots.length} clips one after another and repeat them (in shuffled rounds) to fill a Christmas playlist of about ${Math.round(ctx.settings.videoMinutes)} minutes. ` +
        "So every shot must stand on its own as a complete, visually distinct moment that still makes sense when repeated or seen out of order; " +
        "no two shots may look alike; favour iconic, rewatchable, calming moments with smooth continuous motion. Keep the story arc across the plan for the first pass. " +
        "In editing_notes, add one note with section \"Lặp cảnh\" saying (in Vietnamese, by shot number) which shots work best to open the video and which to repeat most.",
    );
  }
  if (ctx.idea.lyrics?.trim()) {
    out.push("");
    out.push("FULL LYRICS (for mood; lines are already mapped to shots above):");
    out.push(ctx.idea.lyrics.trim());
  }
  if (ctx.avoid.length) {
    out.push("");
    out.push("ALREADY USED IN OTHER VIDEOS OF THIS SERIES — avoid repeating these set pieces and camera ideas:");
    out.push(bullet(ctx.avoid));
  }
  const tone = TONE_TEXT[ctx.tone];
  if (tone) {
    out.push("");
    out.push(tone);
  }
  out.push("");
  if (single) out.push(`SONG for youtube_titles: "${ctx.idea.song_title ?? ""}" — a single-song music video (no video length in the titles).`);
  else out.push(`VIDEO LENGTH for youtube_titles: about ${Math.round(ctx.settings.videoMinutes)} minutes ("${videoLengthLabel(ctx.settings.videoMinutes)}").`);
  out.push(`CHANNEL VOICE for youtube_description: ${ctx.settings.channelVoice}`);
  return out.join("\n");
}

export function buildShotRegenPrompt(ctx: GenContext, mv: MVResult, shotNo: number, instruction: string): string {
  const idx = mv.shots.findIndex((s) => s.shot_no === shotNo);
  const slot = mv.structure.shots[idx] ?? mv.structure.shots.find((s) => s.shot_no === shotNo)!;
  const current = mv.shots[idx];
  const neighbor = (i: number) => {
    const s = mv.shots[i];
    return s ? `#${s.shot_no} ${s.section} [${s.shot_size}, ${s.camera}]: ${s.prompt_core}` : "(none)";
  };
  const out: string[] = [contextBlock(ctx), ""];
  out.push(bibleBlock(mv.character_bible).replace("fixed for the whole series — copy exactly into character_bible", "fixed for this video"));
  out.push("");
  out.push(`TARGET VIDEO MODEL: ${ctx.profile.name} — ${ctx.profile.prompt_style}`);
  out.push(`- ${budgetLine({ ...ctx, fixedBible: mv.character_bible })}`);
  out.push(`- supports audio: ${ctx.profile.supports_audio ? "yes — fill audio" : "no — audio must be null"}`);
  out.push("");
  out.push("STORY ARC OF THIS VIDEO:");
  out.push(bullet(mv.story_arc.map((b) => `${b.section}: ${b.beat_vi}`)));
  out.push("");
  out.push(`REWRITE ONE SHOT. Plan row: ${planRow(slot)}`);
  out.push(`Current version (to be replaced): [${current.shot_size}, ${current.camera}] ${current.prompt_core}`);
  out.push(`Previous shot: ${neighbor(idx - 1)}`);
  out.push(`Next shot: ${neighbor(idx + 1)}`);
  out.push(`User request (Vietnamese, may be empty): ${instruction || "(không có — hãy tạo một phiên bản khác, mới mẻ hơn)"}`);
  out.push("Write a clearly different shot that still fits the story at this point, keeps shot_no, keeps the plan's MOTION/SIGNATURE requirements and does not repeat the neighbouring shots.");
  if (ctx.avoid.length) {
    out.push("Also avoid ideas already used in this series:");
    out.push(bullet(ctx.avoid.slice(0, 15)));
  }
  return out.join("\n");
}

export function buildShortenPrompt(items: { shot_no: number; prompt_core: string; budget: number }[], profile: VideoModelProfile): string {
  return [
    `These prompt_core texts are too long for ${profile.name}. Rewrite each to fit its character budget.`,
    "Keep the {{ID}} placeholders exactly, keep the shot size, the one main action, the key period detail and the camera move; drop secondary details first.",
    "",
    ...items.map((i) => `#${i.shot_no} (budget ${i.budget} chars, now ${i.prompt_core.length}): ${i.prompt_core}`),
  ].join("\n");
}

export function buildLocationPrompt(worldLocation: string, name: string, year: number): string {
  return [
    `Describe the place "${name}" (from the video idea "${worldLocation}") as it looked at Christmastime in ${year}, for a vintage 1950s Christmas music video.`,
    "Give period-accurate landmarks with their holiday decorations (visual descriptions, no brand names, no readable text), period vehicles with model year ≤ the scene year, winter wardrobe, Christmas props and characteristic light (snow only if it really snows there).",
    "In forbidden, list things people often wrongly show for this place at Christmas in the 1950s (buildings, attractions or decorations that came later, modern objects).",
  ].join("\n");
}

export const LOCATION_SYSTEM = "You are a meticulous production designer and historian of 1950s America at Christmastime. Answer only with JSON matching the schema.";

export function buildCouplePrompt(series: string, sampleIdea: IdeaRow | null): string {
  return [
    `Create ONE fixed couple who will star in every video of the series "${series === "__default__" ? "(default series)" : series}" — vintage 1950s American Christmas music videos.`,
    sampleIdea ? `First video of the series: ${sampleIdea.world_location} — ${sampleIdea.outline}` : "",
    'Return two characters with ids "HE" and "SHE". Each description: one English noun phrase starting with "a"/"an", age, hairstyle and hair color, face, main winter outfit with colors that suits the whole decade, one signature accessory; no names; at most about 220 characters.',
  ]
    .filter(Boolean)
    .join("\n");
}

export const COUPLE_SYSTEM = "You are a costume designer and casting director for 1950s-style Christmas music videos. Answer only with JSON matching the schema.";

// ---------- Đề xuất ý tưởng mới (kho ý tưởng sắp hết) ----------

export interface IdeasPromptInput {
  count: number;
  /** Các chủ đề được dùng, kèm số lần đã dùng (để Claude ưu tiên chủ đề ít dùng). */
  themes: { code: string; name: string; used: number }[];
  /** Vài ý tưởng mẫu của kênh. */
  examples: IdeaRow[];
  /** Mọi ý tưởng đã có (kể cả đã bỏ) — không được lặp lại. */
  existing: IdeaRow[];
  /** Series đang dở (ý tưởng mới nối tiếp series này), nếu có. */
  series: string | null;
}

export const IDEAS_SYSTEM =
  "You are the creative lead of a YouTube channel of hour-long vintage 1950s American Christmas music videos. You invent fresh, specific, period-accurate video ideas. Answer only with JSON matching the schema.";

export function buildIdeasPrompt(input: IdeasPromptInput): string {
  const line = (i: IdeaRow) => `${i.world_location} | ${i.theme_code} | ${i.outline.replace(/\s+/g, " ").slice(0, 160)}`;
  return [
    `Write ${input.count} NEW Christmas video ideas for the channel, in the same format and spirit as the examples.`,
    "Each idea:",
    '- world_location: English, "<real American place> <Christmas-season moment> <year>", year between 1950 and 1959 (e.g. "Woodstock Vermont Christmas Eve 1952", "Rockefeller Center First Snow 1955"). The place must have existed in that year; the moment falls in the holiday season, from the first snow and the tree lots of late November to New Year\'s Eve.',
    "- theme_code: one code from the theme list. Prefer the least-used themes so the channel stays varied.",
    "- outline: Vietnamese, one or two sentences — who the video follows and the specific little Christmas story (where they are, what happens, the feeling). Say the cast clearly: a couple, a family with children, children, grandparents, friends, someone far from home — or \"Chỉ cảnh, không nhân vật chính: …\" for a scenery-only video.",
    "Rules: every world_location must be new (not a place + moment already listed below) and every story different from the listed ones; vary regions, years, holiday moments and casts (include a few scenery-only ideas); no brand names, no real people, no copyrighted characters.",
    "- In warm places (California, Florida, New Orleans) the story shows Christmas through lights, palm trees and gifts, not snow.",
    input.series
      ? `These ideas continue the series "${input.series}": stay with these regions, return series_name as the regions part of that label.`
      : 'series_name: a short label of the regions these ideas cover, like "New England – New York – Chicago".',
    "",
    "Themes (code · name · times used):",
    ...input.themes.map((t) => `${t.code} · ${t.name} · ${t.used}`),
    "",
    "Examples of the channel's ideas:",
    ...input.examples.map(line),
    "",
    "Ideas that already exist — do not repeat them:",
    ...input.existing.slice(-400).map(line),
  ].join("\n");
}
