// Kho ý tưởng: thêm / bỏ trùng / lấy dần vào dây chuyền, Claude (chế độ Demo) đề xuất ý tưởng mới khi kho sắp hết.
// Không gọi Claude, không gửi Muse (cách gửi "haohao" = chờ dán tay, dây chuyền dừng ở bước clip).
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
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
  // MV và kênh (lịch sử bài) của test trước: ý tưởng đã có MV thì không chạy lại được.
  for (const f of ["history", "media", "channels.json"]) rmSync(path.join(tmp, f), { recursive: true, force: true });
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
      expect(x.idea.series).toBe("51–100 · Demo – New York – New England – Chicago");
      expect(x.idea.world_location).toMatch(/195\d$/);
      expect(x.idea.theme_name).toBeTruthy();
    }
    // Đề xuất lần nữa: không trùng ý tưởng cũ, cùng series 51–100.
    await bank.suggestIdeas(3);
    const all = (await bank.readBank()).ideas.map((x) => x.idea);
    expect(new Set(all.map((i) => i.world_location.toLowerCase())).size).toBe(all.length);
    expect(all.slice(-3).map((i) => [i.id, i.series])).toEqual([
      ["55", "51–100 · Demo – New York – New England – Chicago"],
      ["56", "51–100 · Demo – New York – New England – Chicago"],
      ["57", "51–100 · Demo – New York – New England – Chicago"],
    ]);
    expect(await bank.setIdeas("proposed", "approve")).toBe(7);
    expect((await bank.bankView()).counts).toMatchObject({ new: 10, proposed: 0 });
  });

  it("ý tưởng Giáng sinh: prompt dặn dịp lễ 1950–1959 và đa dạng nhân vật; Demo đề xuất đủ kiểu nhân vật", async () => {
    const { buildIdeasPrompt } = await import("@/lib/prompts");
    const input = { count: 10, themes: [{ code: "T01", name: "Đêm Giáng sinh lãng mạn", used: 0 }], examples: [], existing: [], series: null };
    const p = buildIdeasPrompt(input);
    expect(p).toContain("Christmas-season moment");
    expect(p).toContain("Chỉ cảnh, không nhân vật chính");
    expect(p).not.toMatch(/autumn|summer/i);

    const bank = await import("@/lib/ideaBank");
    const { castKind } = await import("@/lib/mock");
    await bank.addIdeas([idea("1", "Rockefeller Center Christmas Eve 1954")]);
    await bank.suggestIdeas(10);
    const proposals = (await bank.bankView()).proposals.map((x) => x.idea);
    expect(proposals).toHaveLength(10);
    for (const i of proposals) expect(i.world_location).toMatch(/(Christmas|Snow|Tree Lot|Carol|New Year's).* 195\d$/);
    expect(new Set(proposals.map((i) => castKind(i.outline)))).toEqual(new Set(["couple", "family", "kids", "none", "grandparents"]));
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

  it("hai kênh: ý tưởng chia lần lượt đều các kênh, mỗi kênh tự xếp bài kiểu Bokin theo lịch sử riêng; kênh hết bài mới thì ý tưởng của kênh chờ", async () => {
    const bank = await import("@/lib/ideaBank");
    const pl = await import("@/lib/pipeline");
    const ch = await import("@/lib/channels");
    const media = await import("@/lib/media");
    const songs = path.join(tmp, "kho-nhac-kenh");
    mkdirSync(songs, { recursive: true });
    const bin = (await import("@/lib/ffmpeg")).findFfmpeg().path!;
    // Kho chung 6 bài 20 giây, mức 3 / 2 / 2 / 1 / 1 / 1 (Kho bài hát.xlsx). Video 1 phút = 3 bài: 1 bài cũ (46%) + 2 bài mới.
    for (let n = 1; n <= 6; n++) {
      const r = spawnSync(bin, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${300 + n * 20}:duration=20`, "-c:a", "libmp3lame", path.join(songs, `${n}.mp3`)]);
      expect(r.status).toBe(0);
    }
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Kho bài hát").addRows([
      ["Mã bài", "Tên bài", "Mức hay"],
      ["1", "Snow On Main Street", 3],
      ["2", "Carol Night", 2],
      ["3", "Sleigh Ride Home", 2],
      ["4", "Quiet Fireplace", 1],
      ["5", "Paper Stars", 1],
      ["6", "Midnight Bells", 1],
    ]);
    await wb.xlsx.writeFile(path.join(songs, "Kho bài hát.xlsx"));
    setSettings({ songDir: songs, videoMinutes: 1 });
    const b = await ch.addChannel("Kênh B");
    // Test này về playlist: hai kênh chỉ làm playlist (MV mỗi vòng = 0).
    for (const c of await ch.readChannels()) await ch.updateChannel(c.id, { mvPerRound: 0 });
    await bank.setBankConfig({ ahead: 2, suggest: false });
    // Cột Kênh (tên kênh) thắng; dòng không ghi kênh → chia lần lượt (kênh ít ý tưởng chưa dùng nhất).
    const rows = [{ ...idea("1", "Rockefeller Center Christmas Eve 1954"), channel: "kênh b" }, idea("2", "Woodstock Vermont First Snow 1952"), idea("3", "Beacon Hill Boston Carol Night 1953")];
    expect(await bank.addIdeas(rows)).toEqual({ added: 3, skipped: 0 });
    let v = await bank.bankView("kenh-1");
    expect(v.channels.map((c) => [c.name, c.counts.new])).toEqual([
      ["Kênh Giáng sinh", 2],
      ["Kênh B", 1],
    ]);
    expect(v.music).toMatchObject({ songs: 6, unused: 6, videos: 3, sheet: true });

    // Lượt đầu: hai ý tưởng, mỗi kênh một (phân luồng lần lượt).
    for (let k = 0; k < 5; k++) {
      await pl.pipelineTick();
      await pl.pipelineIdle();
    }
    let items = (await pl.readPipeline()).items;
    expect(items.map((i) => [i.idea?.id, i.channel]).sort()).toEqual([
      ["1", b.id],
      ["2", "kenh-1"],
    ]);
    // Mỗi kênh có lịch sử riêng: cả hai video đều 3 bài mới, bài mức 3 mở đầu, tên bài theo Kho bài hát.
    for (const it of items) {
      expect(it.steps.song).toMatchObject({ status: "done", message: expect.stringMatching(/tự xếp 3 bài \(0 cũ \+ 3 mới\)/) });
      const audio = (await media.loadProject(it.mv_id!)).audio!;
      expect(audio.tracks!.map((t) => t.title)[0]).toBe("Snow On Main Street");
      expect(audio.tracks).toHaveLength(3);
    }
    expect((await ch.readChannels()).map((c) => c.history.length)).toEqual([1, 1]);
    v = await bank.bankView("kenh-1");
    expect(v.music).toMatchObject({ unused: 3, videos: 1 });

    // Video thứ hai của kênh Giáng sinh: 1 bài cũ (bài mức 3 nghỉ lâu nhất) + 2 bài mới, bài mở đầu khác video trước.
    for (const it of items) await pl.removeFromPipeline(it.id);
    for (let k = 0; k < 4; k++) {
      await pl.pipelineTick();
      await pl.pipelineIdle();
    }
    const third = (await pl.readPipeline()).items.find((i) => i.idea?.id === "3")!;
    expect(third.channel).toBe("kenh-1");
    expect(third.steps.song).toMatchObject({ status: "done", message: expect.stringMatching(/Kênh “Kênh Giáng sinh”: tự xếp 3 bài \(1 cũ \+ 2 mới\)/) });
    const titles = (await media.loadProject(third.mv_id!)).audio!.tracks!.map((t) => t.title);
    expect(titles).toContain("Snow On Main Street");
    expect(titles[0]).not.toBe("Snow On Main Street");

    // Kênh Giáng sinh còn 1 bài mới (chưa đủ cho một video) → ý tưởng mới của kênh chờ; kênh B còn bài mới → lấy ý tưởng của B.
    await pl.removeFromPipeline(third.id);
    await bank.addIdeas([idea("4", "Times Square New Year's Eve 1955")], "kenh-1");
    await pl.pipelineTick();
    await pl.pipelineIdle();
    expect((await pl.readPipeline()).items).toHaveLength(0);
    expect((await bank.bankView("kenh-1")).ready).toBe(0);
    await bank.addIdeas([idea("5", "Central Park Christmas Eve 1956")], b.id);
    await pl.pipelineTick();
    await pl.pipelineIdle();
    expect((await pl.readPipeline()).items.map((i) => [i.idea?.id, i.channel])).toEqual([["5", b.id]]);
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
