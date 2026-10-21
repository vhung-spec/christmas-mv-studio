// Kho ý tưởng: thêm / bỏ trùng / lấy dần vào dây chuyền, Claude (chế độ Demo) đề xuất ý tưởng mới khi kho sắp hết.
// Không gọi Claude, không gửi Muse (cách gửi "haohao" = chờ dán tay, dây chuyền dừng ở bước clip).
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { IdeaRow } from "@/lib/types";

const tmp = mkdtempSync(path.join(tmpdir(), "mvps-ideas-"));
for (const f of readdirSync("data").filter((f) => f.endsWith(".json"))) cpSync(path.join("data", f), path.join(tmp, f));
const settingsFile = path.join(tmp, "settings.json");
const base = { ...JSON.parse(readFileSync(settingsFile, "utf8")), engine: "demo", museMode: "haohao", songDir: "" };
const setSettings = (patch: Record<string, unknown> = {}) => writeFileSync(settingsFile, JSON.stringify({ ...base, ...patch }));
setSettings();
process.env.MV_DATA_DIR = tmp;
process.env.PIPELINE_NO_WATCH = "1";
process.env.MUSE_NO_WATCH = "1";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const idea = (id: string, world_location: string, outline = `Hai người gặp nhau ở ${world_location} và không muốn buổi tối kết thúc.`): IdeaRow => ({
  id,
  world_location,
  theme_code: "T01",
  theme_name: "Sét ái tình",
  outline,
  series: "1–50 · California – Las Vegas – Route 66 – New York",
});

afterAll(async () => {
  await (await import("@/lib/pipeline")).pipelineIdle();
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(async () => {
  setSettings();
  await (await import("@/lib/pipeline")).pipelineIdle();
  writeFileSync(path.join(tmp, "ideas.json"), "{}");
  writeFileSync(path.join(tmp, "pipeline.json"), JSON.stringify({ items: [] }));
  // MV và sổ bài đã dùng của test trước: ý tưởng đã có MV thì không chạy lại được.
  for (const f of ["history", "media", "songs_used.json"]) rmSync(path.join(tmp, f), { recursive: true, force: true });
});

describe("kho ý tưởng", () => {
  it("thêm vào kho, bỏ ý tưởng trùng, lấy dần theo thứ tự", async () => {
    const bank = await import("@/lib/ideaBank");
    const r = await bank.addIdeas([idea("1", "Hollywood Boulevard Summer 1954"), idea("2", "Santa Monica Pier Summer 1954"), idea("3", "Las Vegas Strip 1955")]);
    expect(r).toEqual({ added: 3, skipped: 0 });
    // Dán lại cùng bảng (khác dấu cách / hoa thường) → không thêm lần nữa.
    expect(await bank.addIdeas([{ ...idea("1", "hollywood  boulevard summer 1954"), outline: idea("1", "Hollywood Boulevard Summer 1954").outline.toUpperCase() }])).toEqual({ added: 0, skipped: 1 });
    expect((await bank.takeIdeas(2)).map((i) => i.id)).toEqual(["1", "2"]);
    const v = await bank.bankView();
    expect(v.counts).toMatchObject({ new: 1, used: 2, proposed: 0 });
    expect(v.upcoming.map((x) => x.idea.id)).toEqual(["3"]);
    // Bỏ một ý tưởng chưa dùng.
    expect(await bank.setIdeas([v.upcoming[0].key], "reject")).toBe(1);
    expect((await bank.bankView()).counts).toMatchObject({ new: 0, rejected: 1 });
  });

  it("“Chạy ngay” ý tưởng cũng có trong kho → kho đánh dấu đã dùng, không lấy lại", async () => {
    const bank = await import("@/lib/ideaBank");
    const pl = await import("@/lib/pipeline");
    await bank.addIdeas([idea("1", "Hollywood Boulevard Summer 1954"), idea("2", "Santa Monica Pier Summer 1954")]);
    const r = await pl.addToPipeline({ ideas: [{ ...idea("1", "Hollywood Boulevard Summer 1954"), outline: idea("1", "hollywood boulevard summer 1954").outline }] });
    expect(r).toEqual({ added: 1, skipped: [] });
    expect((await bank.readBank()).ideas.map((x) => [x.idea.id, x.status])).toEqual([
      ["1", "used"],
      ["2", "new"],
    ]);
    expect((await bank.takeIdeas(5)).map((i) => i.id)).toEqual(["2"]);
  });

  it("lọc ý tưởng Claude trả về: năm 1950–1959, mã chủ đề có thật, không trùng địa điểm", async () => {
    const { cleanSuggestions } = await import("@/lib/ideaBank");
    const outline = "Hai người lỡ chuyến xe cuối và cùng đi bộ về dưới mưa.";
    const r = cleanSuggestions(
      [
        { world_location: "Times Square Winter 1955", theme_code: "T03", outline },
        { world_location: "times square  winter 1955", theme_code: "T03", outline },
        { world_location: "Hollywood Boulevard Summer 1954", theme_code: "T01", outline },
        { world_location: "Paris Spring 1962", theme_code: "T01", outline },
        { world_location: "Miami Beach 1957", theme_code: "T99", outline },
        { world_location: "Chicago Navy Pier 1956", theme_code: "t1 Sét ái tình", outline },
      ],
      [idea("1", "Hollywood Boulevard Summer 1954")],
      new Set(["T01", "T03"]),
    );
    expect(r.ideas).toEqual([
      { world_location: "Times Square Winter 1955", theme_code: "T03", outline },
      { world_location: "Chicago Navy Pier 1956", theme_code: "T01", outline },
    ]);
    expect(r.problems).toHaveLength(4);
  });

  it("Demo: đề xuất nối tiếp số thứ tự, mở series mới theo khối 50, chờ duyệt", async () => {
    const bank = await import("@/lib/ideaBank");
    await bank.addIdeas([idea("48", "Hollywood Boulevard Summer 1954"), idea("49", "Santa Monica Pier Summer 1954"), idea("50", "Las Vegas Strip 1955")]);
    const last = await bank.suggestIdeas(4);
    expect(last).toMatchObject({ added: 4, cost_usd: null });
    const v = await bank.bankView();
    expect(v.counts).toMatchObject({ new: 3, proposed: 4 });
    expect(v.proposals.map((x) => x.idea.id)).toEqual(["51", "52", "53", "54"]);
    for (const x of v.proposals) {
      expect(x.source).toBe("claude");
      expect(x.idea.series).toBe("51–100 · Demo – California – New York – Miami");
      expect(x.idea.world_location).toMatch(/195\d$/);
      expect(x.idea.theme_name).toBeTruthy();
    }
    // Đề xuất lần nữa: không trùng ý tưởng cũ, cùng series 51–100.
    await bank.suggestIdeas(3);
    const all = (await bank.readBank()).ideas.map((x) => x.idea);
    expect(new Set(all.map((i) => i.world_location.toLowerCase())).size).toBe(all.length);
    expect(all.slice(-3).map((i) => [i.id, i.series])).toEqual([
      ["55", "51–100 · Demo – California – New York – Miami"],
      ["56", "51–100 · Demo – California – New York – Miami"],
      ["57", "51–100 · Demo – California – New York – Miami"],
    ]);
    expect(await bank.setIdeas("proposed", "approve")).toBe(7);
    expect((await bank.bankView()).counts).toMatchObject({ new: 10, proposed: 0 });
  });

  it("mùa của ý tưởng đề xuất nghiêng dần sang thu → đông", async () => {
    const { seasonPlan, ideaSeason, SEASON_RAMP } = await import("@/lib/ideaBankTypes");
    // Lúc đầu 4/10 thu–đông (chủ yếu thu) → tăng dần → gần hết là mùa đông.
    expect(seasonPlan(10, 0)).toEqual({ autumn: 3, winter: 1, other: 6 });
    expect(seasonPlan(10, SEASON_RAMP / 2)).toEqual({ autumn: 3, winter: 4, other: 3 });
    expect(seasonPlan(10, SEASON_RAMP)).toEqual({ autumn: 2, winter: 7, other: 1 });
    expect(seasonPlan(10, SEASON_RAMP * 5)).toEqual(seasonPlan(10, SEASON_RAMP));
    expect(seasonPlan(3, 0)).toEqual({ autumn: 1, winter: 0, other: 2 });
    let cold = 0;
    for (let done = 0; done <= SEASON_RAMP; done += 10) {
      const p = seasonPlan(10, done);
      expect(p.autumn + p.winter).toBeGreaterThanOrEqual(cold);
      cold = p.autumn + p.winter;
    }
    expect(ideaSeason("Vermont Covered Bridge Autumn 1953")).toBe("autumn");
    expect(ideaSeason("Harvard Football Homecoming 1955")).toBe("autumn");
    expect(ideaSeason("Rockefeller Center Christmas Eve 1954")).toBe("winter");
    expect(ideaSeason("Sun Valley Ski Lodge 1956")).toBe("winter");
    expect(ideaSeason("Times Square New Year's Eve 1957")).toBe("winter");
    expect(ideaSeason("Niagara Falls Honeymoon 1952")).toBeNull();
    expect(ideaSeason("Hollywood Boulevard Summer 1954")).toBeNull();

    // Prompt gửi Claude ghi rõ số ý tưởng thu / đông; tắt thì như cũ (đa dạng mùa).
    const { buildIdeasPrompt } = await import("@/lib/prompts");
    const input = { count: 10, themes: [{ code: "T01", name: "Sét ái tình", used: 0 }], examples: [], existing: [], series: null };
    const on = buildIdeasPrompt({ ...input, seasons: seasonPlan(10, 0) });
    expect(on).toContain("exactly 3 ideas set in autumn and 1 set in winter; the other 6 in any season");
    expect(on).not.toContain("vary regions, seasons,");
    const off = buildIdeasPrompt(input);
    expect(off).toContain("vary regions, seasons, years");
    expect(off).not.toContain("autumn");

    // Demo: đề xuất đúng số ý tưởng thu / đông; càng về sau càng nhiều mùa đông.
    const bank = await import("@/lib/ideaBank");
    await bank.addIdeas([idea("1", "Hollywood Boulevard Summer 1954")]);
    expect((await bank.bankView()).season).toEqual({ autumn: 3, winter: 1, other: 6 });
    const seasonsOf = async () => (await bank.bankView()).proposals.map((x) => ideaSeason(x.idea.world_location));
    await bank.suggestIdeas(10);
    expect(await seasonsOf()).toEqual(["autumn", "autumn", "autumn", "winter", null, null, null, null, null, null]);
    await bank.setIdeas("proposed", "approve");
    for (let k = 0; k < 5; k++) {
      await bank.suggestIdeas(10);
      await bank.setIdeas("proposed", "approve");
    }
    expect((await bank.bankView()).season).toEqual({ autumn: 2, winter: 7, other: 1 });
    await bank.suggestIdeas(10);
    const late = await seasonsOf();
    expect(late.filter((s) => s === "winter")).toHaveLength(7);
    expect(late.filter((s) => s === "autumn")).toHaveLength(2);
    // Ý tưởng đã bỏ không tính; tắt thì không chia mùa.
    await bank.setIdeas("proposed", "reject");
    await bank.setBankConfig({ seasonShift: false });
    expect((await bank.bankView()).season).toBeNull();
  });

  it("dây chuyền tự lấy ý tưởng mỗi lúc `ahead` MV; kho sắp hết → tự đề xuất, chờ duyệt mới dùng", async () => {
    const bank = await import("@/lib/ideaBank");
    const pl = await import("@/lib/pipeline");
    await bank.setBankConfig({ ahead: 2, batch: 3 });
    await bank.addIdeas([idea("1", "Hollywood Boulevard Summer 1954"), idea("2", "Santa Monica Pier Summer 1954"), idea("3", "Las Vegas Strip 1955")]);

    // Lượt 1: lấy 2 ý tưởng; còn 1 ≤ 2 → Claude (Demo) đề xuất 3 ý tưởng, chờ duyệt.
    expect(await pl.pipelineTick()).toBe("fast");
    await bank.suggestIdle();
    await pl.pipelineIdle();
    expect((await pl.readPipeline()).items.map((i) => i.idea?.id).sort()).toEqual(["1", "2"]);
    let v = await bank.bankView();
    expect(v.counts).toMatchObject({ new: 1, used: 2, proposed: 3 });

    // 2 MV đang làm (chờ clip) → không lấy thêm; đang có đề xuất chờ duyệt → không đề xuất nữa.
    for (let k = 0; k < 3; k++) {
      await pl.pipelineTick();
      await pl.pipelineIdle();
    }
    expect((await pl.readPipeline()).items).toHaveLength(2);
    expect((await bank.bankView()).counts).toMatchObject({ new: 1, proposed: 3 });

    // Duyệt + 2 MV xong (bỏ khỏi dây chuyền) → lấy tiếp 2 ý tưởng theo thứ tự trong kho.
    await bank.setIdeas("proposed", "approve");
    for (const it of (await pl.readPipeline()).items) await pl.removeFromPipeline(it.id);
    await pl.pipelineTick();
    await bank.suggestIdle();
    await pl.pipelineIdle();
    expect((await pl.readPipeline()).items.map((i) => i.idea?.id).sort()).toEqual(["3", "4"]);
    v = await bank.bankView();
    expect(v.counts).toMatchObject({ new: 2, used: 4 });
    // Còn 2 ≤ 2 → lại đề xuất thêm (chờ duyệt).
    expect(v.counts.proposed).toBe(3);
  });

  it("“Dùng luôn, không cần duyệt”: ý tưởng đề xuất vào thẳng kho và được lấy tiếp", async () => {
    const bank = await import("@/lib/ideaBank");
    const pl = await import("@/lib/pipeline");
    await bank.setBankConfig({ ahead: 1, batch: 3, autoApprove: true });
    await bank.addIdeas([idea("1", "Hollywood Boulevard Summer 1954")]);
    await pl.pipelineTick();
    await bank.suggestIdle();
    await pl.pipelineIdle();
    const v = await bank.bankView();
    expect(v.counts).toMatchObject({ used: 1, new: 3, proposed: 0 });
    expect(v.upcoming.every((x) => x.source === "claude")).toBe(true);
    for (const it of (await pl.readPipeline()).items) await pl.removeFromPipeline(it.id);
    await pl.pipelineTick();
    await pl.pipelineIdle();
    expect((await pl.readPipeline()).items.map((i) => i.idea?.id)).toEqual([v.upcoming[0].idea.id]);
  });

  it("tắt “Tự lấy ý tưởng” hoặc chưa có API key (chế độ claude.ai) → không lấy, không đề xuất", async () => {
    const bank = await import("@/lib/ideaBank");
    const pl = await import("@/lib/pipeline");
    await bank.addIdeas([idea("1", "Hollywood Boulevard Summer 1954")]);
    await bank.setBankConfig({ feed: false });
    expect(await pl.pipelineTick()).toBeNull();
    await bank.setBankConfig({ feed: true });
    setSettings({ engine: "manual" });
    expect(await pl.pipelineTick()).toBeNull();
    expect(bank.isSuggesting()).toBe(false);
    expect((await pl.readPipeline()).items).toHaveLength(0);
    await expect(bank.suggestIdeas()).rejects.toThrow(/API key/);
  });

  it("kho nhạc đánh số: bỏ qua ý tưởng nhạc đã dùng hết, ý tưởng chưa có nhạc chờ trong kho, ghép đúng bài, lấy lời từ thư viện", async () => {
    const bank = await import("@/lib/ideaBank");
    const pl = await import("@/lib/pipeline");
    const store = await import("@/lib/store");
    const songs = path.join(tmp, "kho-nhac");
    mkdirSync(songs, { recursive: true });
    // Bài 1: cả hai bản đã dùng. Bài 2: bản đầu đã dùng, bản "(1)" chưa dùng (file nhạc thật 12 giây).
    for (const f of ["1 đã dùng.wav", "1 (2)đã dùng.wav", "2 đã dùng.wav"]) writeFileSync(path.join(songs, f), "x");
    const bin = (await import("@/lib/ffmpeg")).findFfmpeg().path!;
    const r = spawnSync(bin, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=12", "-c:a", "libmp3lame", path.join(songs, "2 (1).mp3")]);
    expect(r.status).toBe(0);
    const lyrics = "[Intro - bright, hand claps in]\nSha-la-la\n[Verse 1]\nMet you on the pier\n[Chorus]\nFind you on the pier";
    const lib = { songs: [{ n: 2, world_location: "Santa Monica Pier Summer 1954", theme_code: "T01", theme_name: "Sét ái tình", outline: "o", hook: "Find You on the Pier", mood: "", lyrics }] };
    writeFileSync(path.join(tmp, "song_library.json"), JSON.stringify(lib));
    setSettings({ songDir: songs });
    await bank.setBankConfig({ ahead: 2, suggest: false });
    await bank.addIdeas([idea("1", "Hollywood Boulevard Summer 1954"), idea("2", "Santa Monica Pier Summer 1954"), idea("3", "Las Vegas Strip 1955")]);
    expect((await bank.bankView()).ready).toBe(1);

    await pl.pipelineTick();
    await pl.pipelineIdle();
    const items = (await pl.readPipeline()).items;
    expect(items.map((i) => i.idea?.id)).toEqual(["2"]);
    const v = await bank.bankView();
    expect(v.library).toBe(1);
    // Ý tưởng 3 chưa có nhạc: vẫn chờ trong kho, chưa vào dây chuyền.
    expect(v.counts).toMatchObject({ new: 1, used: 2 });
    expect(v.ready).toBe(0);
    expect(v.skipped.map((x) => [x.idea.id, x.note])).toEqual([["1", expect.stringMatching(/bài số 1 đều đã dùng \(ghi “đã dùng” hoặc đã ghép vào MV khác\)/)]]);
    const mv = (await store.loadMV(items[0].mv_id!))!;
    expect(mv.idea.lyrics).toBe(lyrics);
    expect(mv.idea.duration_sec).toBe(12);

    await pl.pipelineTick();
    const song = (await pl.readPipeline()).items[0].steps.song;
    expect(song).toMatchObject({ status: "done", message: expect.stringMatching(/2 \(1\)\.mp3 \(bài số 2\)/) });
    // Tắt "chỉ lấy ý tưởng đã có nhạc" → ý tưởng 3 được lấy (bước bài hát sẽ chờ).
    await bank.setBankConfig({ needSong: false });
    await pl.pipelineTick();
    await pl.pipelineIdle();
    expect((await pl.readPipeline()).items.map((i) => i.idea?.id).sort()).toEqual(["2", "3"]);
    rmSync(path.join(tmp, "song_library.json"));
  }, 120000);

  it("đề xuất lỗi (chưa có key) → không tự gọi lại liên tục; bấm “Nhờ Claude đề xuất ngay” thì thử lại", async () => {
    const bank = await import("@/lib/ideaBank");
    setSettings({ engine: "api" });
    await expect(bank.suggestIdeas()).rejects.toThrow(/API key/);
    expect((await bank.bankView()).error).toMatch(/API key/);
    expect(bank.startSuggest(() => {})).toBe(false);
    expect(bank.startSuggest(() => {}, true)).toBe(true);
    await bank.suggestIdle();
    expect((await bank.bankView()).error).toMatch(/API key/);
  });
});
