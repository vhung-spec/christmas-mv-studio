// Dây chuyền tự động (ý tưởng → kịch bản → danh sách nhạc / bài của MV → clip Muse → MP4) với chế độ Demo + "Muse giả" + thư mục nhạc tạm:
// chạy thật từ đầu tới cuối (dựng MP4 bằng ffmpeg), không tốn lượt Muse, không gọi Claude.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FAST, FakeMuse, waitFor } from "./fakeMuse";

const tmp = mkdtempSync(path.join(tmpdir(), "mvps-auto-"));
for (const f of readdirSync("data").filter((f) => f.endsWith(".json"))) cpSync(path.join("data", f), path.join(tmp, f));
const songs = path.join(tmp, "nhac");
const settingsFile = path.join(tmp, "settings.json");
// Video dài 1 phút cho test (thật: ~60 phút).
const base = { ...JSON.parse(readFileSync(settingsFile, "utf8")), engine: "demo", museMode: "gateway", songDir: songs, museAutoRender: false, museAvoid: true, resultsDir: path.join(tmp, "ket-qua"), videoMinutes: 1 };
const setSettings = (patch: Record<string, unknown> = {}) => writeFileSync(settingsFile, JSON.stringify({ ...base, ...patch }));
setSettings();
process.env.MV_DATA_DIR = tmp;
process.env.MUSE_NO_WATCH = "1";
process.env.PIPELINE_NO_WATCH = "1";

let bin: string;
const make = (args: string[], out: string) => {
  const r = spawnSync(bin, ["-hide_banner", "-loglevel", "error", "-y", ...args, out]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return out;
};

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("dây chuyền: ý tưởng → MP4 (video Giáng sinh, tự xếp bài kiểu Bokin theo kênh)", () => {
  let fake: FakeMuse;
  let engine: Awaited<ReturnType<typeof import("@/lib/museEngine")["initMuseEngine"]>>;
  const tone = (name: string, seconds: number, hz = 330) => make(["-f", "lavfi", "-i", `sine=frequency=${hz}:duration=${seconds}`, "-c:a", "libmp3lame"], path.join(songs, name));
  const sheet = async (rows: (string | number)[][]) => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Kho bài hát").addRows([["Mã bài", "Tên bài", "Mức hay"], ...rows]);
    await wb.xlsx.writeFile(path.join(songs, "Kho bài hát.xlsx"));
  };

  beforeAll(async () => {
    bin = (await import("@/lib/ffmpeg")).findFfmpeg().path!;
    mkdirSync(songs, { recursive: true });
    // Kho đánh số: bài 1 có hai bản. Mức hay trong Kho bài hát.xlsx: 3 = rất hay, 2 = hay, 1 = bình thường. Video dài 1 phút.
    tone("1.mp3", 25);
    tone("1 (1).mp3", 25, 360);
    tone("2.mp3", 20, 392);
    tone("3.mp3", 15, 440);
    await sheet([
      ["1", "Silver Bells Waltz", 3],
      ["2", "Snow On Main Street", 2],
      ["3", "Candle In The Window", 1],
    ]);
    // Các test playlist: kênh mặc định chỉ làm playlist (MV mỗi vòng = 0); thứ tự MV → playlist và tự sản xuất có test riêng ở cuối.
    await (await import("@/lib/channels")).updateChannel("kenh-1", { mvPerRound: 0 });
    // Không tự lấy việc / tự nghĩ ý tưởng (kho trống) trong các test chạy tay từng việc.
    await (await import("@/lib/ideaBank")).setBankConfig({ feed: false, suggest: false });
    const clip = make(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=2", "-c:v", "libx264", "-preset", "ultrafast"], path.join(tmp, "clip.mp4"));
    fake = new FakeMuse(readFileSync(clip));
    engine = (await import("@/lib/museEngine")).initMuseEngine({ dir: path.join(tmp, "muse-engine"), page: fake, worker: FAST });
    // Dựng nhanh cho test: 720p, chất lượng "Nhanh".
    const media = await import("@/lib/media");
    const shared = await media.loadProject("_shared");
    await media.setOptions("_shared", { ...shared.options, size: "720p", quality: "fast" });
  }, 120000);

  afterAll(async () => (await import("@/lib/museEngine")).closeMuseEngine());

  /** Muse giả làm xong lần lượt mọi lệnh đã nhận (cổng chạy từng lệnh một); lệnh thứ `fail` thì Muse trả lời không có video. */
  async function museFinishAll(fail = 0) {
    for (let k = 1; k <= engine.store.list().length; k++) {
      await waitFor(() => fake.sent.length >= k, 5000, `Muse nhận lệnh ${k}`);
      fake.finish(k, k !== fail);
    }
    await waitFor(() => engine.store.list().every((t) => t.status === "succeeded" || t.status === "failed"), 5000, "Muse làm xong");
  }

  it("chế độ claude.ai (chưa có API key) → không nhận ý tưởng", async () => {
    const pl = await import("@/lib/pipeline");
    setSettings({ engine: "manual" });
    await expect(pl.addToPipeline({ ideas: [{ id: "x", world_location: "Main Street Christmas 1956", theme_code: "T01", outline: "o" }] })).rejects.toThrow(/API key/);
    setSettings();
  });

  it("viết kịch bản (Demo) → tự xếp 3 bài cho kênh (mức 3 mở đầu) → gửi Muse → nhận clip → dựng MP4 lặp clip, mô tả có danh sách bài", async () => {
    const pl = await import("@/lib/pipeline");
    const jobs = await import("@/lib/museJobs");
    const queue = await import("@/lib/queue");
    const media = await import("@/lib/media");
    const channels = await import("@/lib/channels");
    const { added } = await pl.addToPipeline({
      ideas: [{ id: "1", world_location: "Rockefeller Center Christmas Eve 1955", theme_code: "T02", outline: "Cặp đôi trẻ trượt băng dưới cây thông khổng lồ" }],
    });
    expect(added).toBe(1);
    const item = async (n: number) => (await pl.readPipeline()).items.find((i) => i.idea?.id === String(n))!;
    expect((await item(1)).channel).toBe("kenh-1");

    // 1. Kịch bản: một vòng 20–30 cảnh (không theo độ dài nhạc).
    await pl.pipelineTick();
    await pl.pipelineIdle();
    const a = await item(1);
    expect(a.steps.script).toMatchObject({ status: "done" });
    const store = await import("@/lib/store");
    const mv = (await store.loadMV(a.mv_id!))!;
    expect(mv.idea.duration_sec).toBeUndefined();
    expect(mv.idea.channel).toBe("kenh-1");
    expect(mv.structure.total_shots).toBeGreaterThanOrEqual(20);
    expect(mv.structure.total_shots).toBeLessThanOrEqual(30);

    // 2–3. Nhạc: kênh chưa dùng bài nào → 3 bài mới, mức 3 → 2 → 1, tên bài theo Kho bài hát.xlsx; ghi vào lịch sử kênh. Cảnh gửi sang Muse.
    await pl.pipelineTick();
    const a2 = await item(1);
    expect(a2.steps.song).toMatchObject({ status: "done", message: "Kênh “Kênh Giáng sinh”: tự xếp 3 bài (0 cũ + 3 mới) · 1 phút" });
    expect(a2.clips_sent).toBe(true);
    const audio = (await media.loadProject(mv.id)).audio!;
    expect(audio.tracks!.map((t) => [t.title, t.name, t.code])).toEqual([
      ["Silver Bells Waltz", "1.mp3", "1"],
      ["Snow On Main Street", "2.mp3", "2"],
      ["Candle In The Window", "3.mp3", "3"],
    ]);
    expect(audio.duration).toBeCloseTo(60, 0);
    const ch = (await channels.readChannels())[0];
    expect(ch.history.map((v) => [v.id, v.codes, v.files])).toEqual([[mv.id, ["1", "2", "3"], ["1.mp3", "2.mp3", "3.mp3"]]]);

    // Muse giả làm xong → clip vào MV; riêng cảnh cuối Muse không làm được video (cổng gửi lần lượt; danh sách task mới nhất đứng đầu).
    const lastShot = mv.shots[mv.shots.length - 1].shot_no;
    const lastTask = (await jobs.readMuse()).mvs.find((m) => m.mv_id === mv.id)!.shots.find((s) => s.shot_no === lastShot)!.task_id!;
    const tasks = engine.store.list().length;
    await museFinishAll(tasks - engine.store.list().findIndex((t) => t.id === lastTask));
    await jobs.museTick();
    expect(Object.keys((await media.loadProject(mv.id)).clips)).toHaveLength(mv.shots.length - 1);
    // Cảnh lỗi: app tự kiểm tra lại một lần (không gửi lại), vẫn lỗi thì tự bỏ qua.
    await pl.pipelineTick();
    expect((await item(1)).steps.clips.status).toBe("running");
    await waitFor(() => engine.store.list().every((t) => t.status === "succeeded" || t.status === "failed"), 5000, "kiểm tra lại xong");
    await jobs.museTick();
    expect((await jobs.readMuse()).mvs.find((m) => m.mv_id === mv.id)!.shots.find((s) => s.shot_no === lastShot)).toMatchObject({ status: "skipped" });
    expect(fake.sent).toHaveLength(tasks);

    // 4. Đủ clip (trừ cảnh bỏ qua) + có nhạc → dựng MP4: clip 2 giây lặp lại cho hết 1 phút nhạc.
    await pl.pipelineTick();
    expect((await item(1)).steps.clips).toMatchObject({ status: "done", message: `Đủ clip (bỏ qua 1 cảnh lỗi: #${lastShot})` });
    expect((await item(1)).steps.render.status).toBe("running");
    await queue.idle();
    await pl.pipelineTick();
    const done = await item(1);
    expect(done.steps.render.status).toBe("done");
    expect(done.done_at).toBeTruthy();
    expect(existsSync(media.mediaPath(mv.id, done.output!))).toBe(true);
    const rendered = (await media.loadProject(mv.id)).renders[0];
    expect(rendered).toMatchObject({ file: done.output, verification: { passed: true } });
    expect(rendered.duration).toBeCloseTo(60, 0);
    // Có clip lặp lại: số đoạn nhiều hơn số clip (mọi cảnh trừ cảnh bỏ qua).
    expect(rendered.segments).toBeGreaterThan(mv.shots.length - 1);

    // Mô tả YouTube (file .txt và thông tin MP4) kèm danh sách bài + mốc thời gian, hashtag vẫn ở cuối; file .txt ghi kênh.
    expect(rendered.tags!.description).toMatch(/Tracklist:\n0:00 Silver Bells Waltz\n0:25 Snow On Main Street\n0:45 Candle In The Window\n\n#christmasmusic/);
    const info = readFileSync(media.mediaPath(mv.id, rendered.youtube_info!), "utf8");
    expect(info).toMatch(/^﻿KÊNH\r\nKênh Giáng sinh\r\n/);
    expect(info).toContain(mv.youtube_titles[0]);
    expect(info).toContain("0:25 Snow On Main Street");

    // Ảnh bìa 1280×720 + thư mục kết quả (trong thư mục của kênh) đủ 3 file.
    expect(rendered.cover).toMatch(/-cover\.jpg$/);
    const cover = await (await import("@/lib/ffmpeg")).probe(media.mediaPath(mv.id, rendered.cover!), { still: true });
    expect([cover.video?.width, cover.video?.height]).toEqual([1280, 720]);
    expect(rendered.result_dir).toBe(path.join(tmp, "ket-qua", "Kênh Giáng sinh", "001 - Rockefeller Center Christmas Eve 1955"));
    expect(readdirSync(rendered.result_dir!).sort()).toEqual(["Tiêu đề - mô tả.txt", "Ảnh bìa.jpg", rendered.download_name!].sort());
    if (process.env.KEEP_COVER_TEST) {
      cpSync(media.mediaPath(mv.id, rendered.cover!), path.join(process.env.KEEP_COVER_TEST, "cover.jpg"));
      cpSync(media.mediaPath(mv.id, done.output!), path.join(process.env.KEEP_COVER_TEST, "video.mp4"));
    }
    await pl.clearFinishedPipeline();
    expect((await pl.readPipeline()).items).toHaveLength(0);
  }, 300000);

  it("video sau của kênh: bài cũ (bản chưa dùng của bài) + bài mới, bài mở đầu khác video trước; ý tưởng đã có MV không chạy lại; kênh khác có lịch sử riêng", async () => {
    const pl = await import("@/lib/pipeline");
    const channels = await import("@/lib/channels");
    const media = await import("@/lib/media");
    const store = await import("@/lib/store");
    const item = async (n: string) => (await pl.readPipeline()).items.find((i) => i.idea?.id === n)!;
    const mv1 = (await store.listMVs()).find((m) => m.idea.id === "1")!;

    // "Chạy ngay" lại ý tưởng 1 (đã có MV ở kênh này) → bỏ qua; ý tưởng 3 dán hai lần → chỉ chạy một.
    const one = { id: "1", world_location: "Rockefeller Center Christmas Eve 1955", theme_code: "T02", outline: "Cặp đôi trẻ trượt băng dưới cây thông khổng lồ" };
    const three = { id: "3", world_location: "Beacon Hill Boston Carol Night 1956", theme_code: "T12", outline: "Hai đứa trẻ đi hát mừng cùng hàng xóm" };
    // Thêm bài 4 (mức 2) vào kho trước: video 2 = 1 bài cũ + 1 bài mới cho đủ 1 phút.
    tone("4.mp3", 35, 494);
    await sheet([
      ["1", "Silver Bells Waltz", 3],
      ["2", "Snow On Main Street", 2],
      ["3", "Candle In The Window", 1],
      ["4", "Sleigh Ride Home", 2],
    ]);
    const r = await pl.addToPipeline({ ideas: [one, three, { ...three, outline: " hai đứa trẻ  đi hát mừng cùng hàng xóm" }] });
    expect(r.added).toBe(1);
    expect(r.skipped).toEqual([
      { title: "#1 · Rockefeller Center Christmas Eve 1955", reason: "ý tưởng này đã có MV" },
      { title: "#3 · Beacon Hill Boston Carol Night 1956", reason: expect.stringMatching(/đang chạy/) },
    ]);
    for (let k = 0; k < 2; k++) {
      await pl.pipelineTick();
      await pl.pipelineIdle();
    }
    await pl.pipelineTick();
    const s3 = await item("3");
    expect(s3.steps.script.status).toBe("done");
    // Bài 1 (mức 3) dùng lại làm bài cũ — bản "1 (1)" kênh chưa dùng; bài 4 mới mở đầu (bài 1 đã mở đầu video trước).
    expect(s3.steps.song).toMatchObject({ status: "done", message: expect.stringMatching(/tự xếp 2 bài \(1 cũ \+ 1 mới\) · 1 phút/) });
    expect((await media.loadProject(s3.mv_id!)).audio!.tracks!.map((t) => [t.title, t.name])).toEqual([
      ["Sleigh Ride Home", "4.mp3"],
      ["Silver Bells Waltz", "1 (1).mp3"],
    ]);
    const ch = (await channels.readChannels())[0];
    expect(ch.history.map((v) => v.id)).toEqual([mv1.id, s3.mv_id]);

    // Kênh mới có lịch sử riêng: ý tưởng 1 (đã có MV ở kênh Giáng sinh) chạy được cho kênh mới, xếp toàn bài mới.
    const b = await channels.addChannel("Kênh B");
    await channels.updateChannel(b.id, { mvPerRound: 0 });
    const r2 = await pl.addToPipeline({ ideas: [one], channel: b.id });
    expect(r2.added).toBe(1);
    for (let k = 0; k < 2; k++) {
      await pl.pipelineTick();
      await pl.pipelineIdle();
    }
    await pl.pipelineTick();
    const forB = (await pl.readPipeline()).items.find((i) => i.channel === b.id)!;
    expect(forB.steps.song).toMatchObject({ status: "done", message: expect.stringMatching(/^Kênh “Kênh B”: tự xếp \d bài \(0 cũ \+ \d mới\)/) });
    expect((await media.loadProject(forB.mv_id!)).audio!.tracks![0].title).toBe("Silver Bells Waltz");
    for (const it of (await pl.readPipeline()).items) await pl.removeFromPipeline(it.id);
  }, 120000);

  it("kho nhạc chưa xong: làm video trước (kịch bản + clip), chờ ở bước Nhạc; kho có nhạc → tự xếp bài rồi dựng", async () => {
    const pl = await import("@/lib/pipeline");
    const bank = await import("@/lib/ideaBank");
    const jobs = await import("@/lib/museJobs");
    const queue = await import("@/lib/queue");
    const media = await import("@/lib/media");
    // Thư mục nhạc chưa có (kho trên Drive chưa xong).
    const later = path.join(tmp, "nhac-sau");
    setSettings({ songDir: later });
    await bank.setBankConfig({ feed: true, ahead: 1, needSong: true, suggest: false });
    await bank.addIdeas([{ id: "7", world_location: "Woodstock Vermont First Snow 1952", theme_code: "T05", outline: "Chỉ cảnh, không nhân vật chính: làng tuyết" }], "kenh-1");
    const item = async () => (await pl.readPipeline()).items.find((i) => i.idea?.id === "7");

    // Bật "chỉ làm video mới khi kho nhạc còn bài mới" + kho trống → ý tưởng nằm chờ.
    await pl.pipelineTick();
    expect(await item()).toBeUndefined();

    // "Làm video trước, ghép nhạc sau": lấy ý tưởng, viết kịch bản, gửi cảnh sang Muse; bước Nhạc chờ (không lỗi).
    await bank.setBankConfig({ needSong: false });
    await pl.pipelineTick();
    await pl.pipelineIdle();
    await pl.pipelineTick();
    const a = (await item())!;
    expect(a.steps.script.status).toBe("done");
    expect(a.steps.song).toMatchObject({ status: "waiting", message: expect.stringMatching(/chưa có bài nào.*clip Muse vẫn làm tiếp/) });
    expect(a.clips_sent).toBe(true);

    // Muse làm xong → đủ clip; chưa có nhạc nên chưa dựng.
    await museFinishAll();
    await jobs.museTick();
    await pl.pipelineTick();
    const b = (await item())!;
    expect(b.steps.clips.status).toBe("done");
    expect(b.steps.song.status).toBe("waiting");
    expect(b.steps.render.status).toBe("pending");

    // Kho có nhạc (vd. vừa đồng bộ Drive) → lượt sau tự xếp bài cho video đang chờ rồi dựng MP4.
    mkdirSync(later, { recursive: true });
    // Bài số 8, 9: kênh chưa dùng (bài 1–4 đã có trong lịch sử kênh từ các test trên).
    make(["-f", "lavfi", "-i", "sine=frequency=523:duration=35", "-c:a", "libmp3lame"], path.join(later, "8.mp3"));
    make(["-f", "lavfi", "-i", "sine=frequency=587:duration=30", "-c:a", "libmp3lame"], path.join(later, "9.mp3"));
    await pl.pipelineTick();
    const c = (await item())!;
    expect(c.steps.song).toMatchObject({ status: "done", message: expect.stringMatching(/tự xếp 2 bài \(0 cũ \+ 2 mới\)/) });
    expect(c.steps.render.status).toBe("running");
    await queue.idle();
    await pl.pipelineTick();
    const d = (await item())!;
    expect(d.steps.render.status).toBe("done");
    expect(existsSync(media.mediaPath(d.mv_id!, d.output!))).toBe(true);
    for (const it of (await pl.readPipeline()).items) await pl.removeFromPipeline(it.id);
  }, 300000);

  it("thứ tự sản xuất: kênh 2 MV mỗi vòng → MV (cảnh Giáng sinh, bài hay nhất kênh chưa dùng chọn lúc ghép nhạc) → MV → playlist mở đầu bằng 2 bài đó → MV vòng sau chờ playlist", async () => {
    const pl = await import("@/lib/pipeline");
    const bank = await import("@/lib/ideaBank");
    const jobs = await import("@/lib/museJobs");
    const queue = await import("@/lib/queue");
    const media = await import("@/lib/media");
    const store = await import("@/lib/store");
    const channels = await import("@/lib/channels");
    const { channelsView, usedSongsView } = await import("@/lib/channelsView");
    // Playlist 1 tiếng: kho chưa đủ nhạc (MV một bài thì đủ).
    setSettings({ videoMinutes: 60 });
    await bank.setBankConfig({ feed: false });
    // Thêm bài 5, 6 (mức 3, ngắn).
    tone("5.mp3", 12, 523);
    tone("6.mp3", 12, 587);
    await sheet([
      ["1", "Silver Bells Waltz", 3],
      ["2", "Snow On Main Street", 2],
      ["3", "Candle In The Window", 1],
      ["4", "Sleigh Ride Home", 2],
      ["5", "Jingle Bell Jamboree", 3],
      ["6", "Mistletoe Moonlight", 3],
    ]);
    const c = await channels.addChannel("Kênh MV");
    await channels.updateChannel(c.id, { mvPerRound: 2 });
    const idea = (id: string, place: string) => ({ id, world_location: place, theme_code: "T03", outline: `Chỉ cảnh, không nhân vật chính: Giáng sinh ở ${place}` });
    const r = await pl.addToPipeline({
      ideas: [idea("21", "Chicago Union Station 1953"), idea("22", "Vermont Covered Bridge 1951"), idea("23", "Times Square Toy Shop 1954"), idea("24", "San Francisco Cable Car 1957")],
      channel: c.id,
    });
    expect(r.added).toBe(4);
    const item = async (id: string) => (await pl.readPipeline()).items.find((i) => i.idea?.id === id)!;
    const summary = async () => (await channelsView()).channels.find((x) => x.id === c.id)!;

    // MV chưa giữ bài: kịch bản là một vòng cảnh 3 phút (không theo bài nào), làm ngay; bài chọn lúc ghép nhạc.
    const [m1, m2, p, m3] = [await item("21"), await item("22"), await item("23"), await item("24")];
    expect([m1.kind, m2.kind, p.kind, m3.kind]).toEqual(["mv", "mv", "playlist", "mv"]);
    expect([m1.idea!.video_kind, m1.idea!.duration_sec, m1.idea!.mv_song, m1.title]).toEqual(["mv", 180, undefined, "Chicago Union Station 1953"]);
    expect(p.idea!.duration_sec).toBeUndefined();
    // Trang Kênh: tiếp theo là MV 2 của vòng sau; 3 MV đang làm sẽ lấy 3 bài mức 3 → bài dự kiến là bài mức 2 đầu tiên trong kho.
    expect(await summary()).toMatchObject({ mvPerRound: 2, next: { kind: "mv", index: 2, song: "Snow On Main Street" }, unposted: 4 });

    // Kịch bản lần lượt cả 4 video; MV có nhạc ngay (bài mức 3 theo thứ tự kho: 1 rồi 5), playlist chờ đủ nhạc, MV vòng sau chờ playlist.
    for (let k = 0; k < 4; k++) {
      await pl.pipelineTick();
      await pl.pipelineIdle();
    }
    await pl.pipelineTick();
    const mv1 = (await store.loadMV((await item("21")).mv_id!))!;
    expect(mv1.structure.duration_sec).toBe(180);
    expect((await item("21")).steps.song).toMatchObject({ status: "done", message: "Kênh “Kênh MV”: MV bài “Silver Bells Waltz” (mức 3) · 0:25" });
    expect((await item("21")).title).toBe("Silver Bells Waltz");
    // Có bài rồi mới đặt tên: tên bài vào ý tưởng của MV và lên đầu các tiêu đề YouTube.
    expect(mv1.idea.song_title).toBe("Silver Bells Waltz");
    expect(mv1.youtube_titles.length).toBeGreaterThan(0);
    for (const t of mv1.youtube_titles) expect(t).toMatch(/^Silver Bells Waltz \| /);
    expect((await media.loadProject(mv1.id)).audio).toMatchObject({ name: "1.mp3" });
    expect((await item("22")).steps.song).toMatchObject({ status: "done", message: expect.stringMatching(/MV bài “Jingle Bell Jamboree”/) });
    expect((await item("23")).steps.song).toMatchObject({ status: "waiting", message: expect.stringMatching(/^Chưa đủ nhạc cho kênh “Kênh MV”/) });
    expect((await item("24")).steps.song).toMatchObject({ status: "waiting", message: expect.stringMatching(/^Chờ playlist “Times Square Toy Shop 1954” \(vòng trước\)/) });
    expect((await item("24")).clips_sent).toBe(true);
    const before = await usedSongsView(c.id);
    expect(before.videos.map((v) => [v.kind, v.tracks.map((t) => t.code)])).toEqual([
      ["mv", ["5"]],
      ["mv", ["1"]],
    ]);
    expect(before.held).toEqual([]);

    // Đủ nhạc → playlist mở đầu bằng bài 1 (bản "1 (1)" kênh chưa dùng) rồi bài 5; rồi tới MV vòng sau: bài hay nhất kênh còn chưa dùng.
    setSettings({ videoMinutes: 1 });
    await pl.pipelineTick();
    const p2 = await item("23");
    expect(p2.steps.song).toMatchObject({ status: "done", message: expect.stringMatching(/ · mở đầu bằng 2 bài vừa có MV/) });
    const tracks = (await media.loadProject(p2.mv_id!)).audio!.tracks!;
    expect(tracks.slice(0, 2).map((t) => [t.code, t.name])).toEqual([
      ["1", "1 (1).mp3"],
      ["5", "5.mp3"],
    ]);
    expect(tracks.length).toBeGreaterThan(2);
    expect((await item("24")).steps.song.status).toBe("done");
    const history = (await channels.readChannels()).find((x) => x.id === c.id)!.history;
    expect(history.map((v) => v.kind ?? "playlist")).toEqual(["mv", "mv", "playlist", "mv"]);
    expect(tracks.map((t) => t.code)).not.toContain(history[3].codes[0]);
    expect(["1", "5"]).not.toContain(history[3].codes[0]);
    expect(history.every((v) => v.posted === false)).toBe(true);
    expect((await summary()).recent.map((v) => v.kind)).toEqual(["mv", "playlist", "mv", "mv"]);

    // Danh sách nhạc từng video (mới nhất trước), giờ bắt đầu từng bài như trong mô tả YouTube; từng bài dùng ở đâu.
    const used = await usedSongsView(c.id);
    expect(used.videos.map((v) => v.kind)).toEqual(["mv", "playlist", "mv", "mv"]);
    const playlist = used.videos[1];
    expect(playlist.tracks.slice(0, 2).map((t) => [t.code, t.title, t.file])).toEqual([
      ["1", "Silver Bells Waltz", "1 (1).mp3"],
      ["5", "Jingle Bell Jamboree", "5.mp3"],
    ]);
    expect(playlist.tracks[0].start).toBe(0);
    expect(playlist.tracks[1].start).toBeCloseTo(25, 0);
    expect(playlist.total).toBeCloseTo(tracks.reduce((a, t) => a + t.duration, 0), 0);
    expect(used.videos[3].tracks).toMatchObject([{ code: "1", start: 0, level: 3 }]);
    expect(used.videos[3].tracks[0].duration).toBeCloseTo(25, 0);
    const one = used.songs.find((x) => x.code === "1")!;
    expect(one.uses.map((u) => [u.kind, u.title, u.position])).toEqual([
      ["playlist", "#23 · Times Square Toy Shop 1954", 1],
      ["mv", "#21 · Silver Bells Waltz", 1],
    ]);

    // Muse giả làm xong → dựng: MV dài đúng bài, thư mục kết quả "MV <tên bài>" trong thư mục của kênh, tiêu đề bắt đầu bằng tên bài.
    await museFinishAll();
    await jobs.museTick();
    await pl.pipelineTick();
    await queue.idle();
    await pl.pipelineTick();
    const done = await item("21");
    expect(done.done_at).toBeTruthy();
    const rendered = (await media.loadProject(done.mv_id!)).renders[0];
    expect(rendered.duration).toBeCloseTo(25, 0);
    expect(rendered.result_dir).toBe(path.join(tmp, "ket-qua", "Kênh MV", "021 - MV Silver Bells Waltz - Chicago Union Station 1953"));
    expect(rendered.tags!.title).toMatch(/^Silver Bells Waltz \| /);
    for (const it of (await pl.readPipeline()).items) await pl.removeFromPipeline(it.id);
  }, 300000);

  it("lượt chạy liên tiếp (kịch bản xong giữa lượt): mỗi việc đúng một kịch bản, viết đúng thứ tự giao", async () => {
    const pl = await import("@/lib/pipeline");
    const store = await import("@/lib/store");
    const channels = await import("@/lib/channels");
    setSettings({ videoMinutes: 1 });
    const c = await channels.addChannel("Kênh chạy liền");
    await channels.updateChannel(c.id, { mvPerRound: 0 });
    const ideas = ["41", "42", "43"].map((id, k) => ({ id, world_location: `Kansas City Union Depot Christmas ${1950 + k}`, theme_code: "T04", outline: "Ông bà đón cháu ở ga tuyết" }));
    expect((await pl.addToPipeline({ ideas, channel: c.id })).added).toBe(3);
    const mine = async () => (await pl.readPipeline()).items.filter((i) => i.channel === c.id);
    // Không chờ kịch bản viết xong giữa các lượt: kịch bản xong ngay trong lúc lượt đang tính các việc khác.
    for (let k = 0; k < 300 && (await mine()).some((i) => i.steps.script.status !== "done"); k++) await pl.pipelineTick();
    await pl.pipelineIdle();
    expect((await mine()).map((i) => [i.idea!.id, i.steps.script.status])).toEqual([
      ["41", "done"],
      ["42", "done"],
      ["43", "done"],
    ]);
    const made = (await store.listMVs()).filter((m) => m.idea.channel === c.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    expect(made.map((m) => m.idea.id)).toEqual(["41", "42", "43"]);
    for (const it of await mine()) await pl.removeFromPipeline(it.id);
  }, 120000);

  it("tự sản xuất: kho trống → Claude (Demo) tự nghĩ ý tưởng chỉ cảnh, dùng luôn → kênh làm đủ N video chưa đăng rồi dừng; bấm Đã đăng → làm bù", async () => {
    const pl = await import("@/lib/pipeline");
    const bank = await import("@/lib/ideaBank");
    const channels = await import("@/lib/channels");
    const { channelsView } = await import("@/lib/channelsView");
    setSettings({ videoMinutes: 1 });
    // Chỉ kênh mới tự làm (các kênh khác Làm sẵn = 0); mỗi vòng 1 MV rồi 1 playlist, giữ sẵn 2 video chưa đăng.
    for (const x of await channels.readChannels()) await channels.updateChannel(x.id, { stock: 0 });
    const c = await channels.addChannel("Kênh tự làm");
    await channels.updateChannel(c.id, { mvPerRound: 1, stock: 2 });
    await bank.setBankConfig({ feed: true, ahead: 3, suggest: true, autoApprove: true, needSong: false, batch: 3 });
    const mine = async () => (await bank.readBank()).ideas.filter((x) => x.channel === c.id);
    const items = async () => (await pl.readPipeline()).items.filter((i) => i.channel === c.id);

    // Kho của kênh trống → lượt chạy nhờ Claude (Demo) nghĩ 3 ý tưởng: chỉ cảnh, dùng luôn (không chờ duyệt).
    expect(await mine()).toEqual([]);
    await pl.pipelineTick();
    await bank.suggestIdle();
    const ideas = await mine();
    expect(ideas).toHaveLength(3);
    for (const x of ideas) {
      expect([x.status, x.source]).toEqual(["new", "claude"]);
      expect(x.idea.outline).toMatch(/^Chỉ cảnh, không nhân vật chính:/);
    }

    // Lấy đủ 2 video (MV rồi playlist, đúng thứ tự dù thêm ở hai lần khác nhau) rồi dừng, dù kho còn ý tưởng; đủ rồi thì không nhờ Claude nữa.
    for (let k = 0; k < 4; k++) {
      await pl.pipelineTick();
      await pl.pipelineIdle();
    }
    let list = await items();
    expect(list.map((i) => [i.kind, i.seq! > 0]).sort()).toEqual([
      ["mv", true],
      ["playlist", true],
    ]);
    const [first, second] = [...list].sort((a, b) => a.seq! - b.seq!);
    expect([first.kind, second.kind]).toEqual(["mv", "playlist"]);
    expect(bank.isSuggesting()).toBe(false);
    expect(await mine()).toHaveLength(3);
    expect((await channelsView()).channels.find((x) => x.id === c.id)).toMatchObject({ stock: 2, unposted: 2 });

    // Có nhạc: MV rồi playlist vào lịch sử kênh là video làm sẵn chưa đăng; vẫn đủ 2 → không lấy thêm.
    await pl.pipelineTick();
    list = await items();
    expect(list.every((i) => i.steps.song.status === "done")).toBe(true);
    const history = () => channels.readChannels().then((l) => l.find((x) => x.id === c.id)!.history);
    expect((await history()).map((v) => [v.kind ?? "playlist", v.posted])).toEqual([
      ["mv", false],
      ["playlist", false],
    ]);
    const view = (await channelsView()).channels.find((x) => x.id === c.id)!;
    expect([view.unposted, view.ready.map((v) => v.kind)]).toEqual([2, ["playlist", "mv"]]);

    // Bấm "Đã đăng" cho MV → còn 1 video chưa đăng → lượt sau làm bù một video (vòng mới: MV).
    await channels.setPosted(c.id, first.mv_id!, true);
    expect((await history())[0]).toMatchObject({ posted: true, posted_at: expect.any(String) });
    await pl.pipelineTick();
    list = await items();
    expect(list).toHaveLength(3);
    expect([...list].sort((a, b) => a.seq! - b.seq!).map((i) => i.kind)).toEqual(["mv", "playlist", "mv"]);
    const after = (await channelsView()).channels.find((x) => x.id === c.id)!;
    expect([after.unposted, after.postedRecent.map((v) => v.id)]).toEqual([2, [first.mv_id]]);
    // Ghép lại nhạc cho video đã đăng vẫn giữ là đã đăng; bỏ đánh dấu thì lại là video làm sẵn.
    await channels.recordChannelVideo(c.id, { ...(await history())[0], posted: false });
    expect((await history()).find((v) => v.id === first.mv_id)).toMatchObject({ posted: true });
    await channels.setPosted(c.id, first.mv_id!, false);
    expect((await history()).find((v) => v.id === first.mv_id)!.posted).toBe(false);

    await bank.setBankConfig({ feed: false, suggest: false });
    for (const it of await items()) await pl.removeFromPipeline(it.id);
  }, 120000);
});
