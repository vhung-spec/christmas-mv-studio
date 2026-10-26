// Dây chuyền tự động (ý tưởng → kịch bản → danh sách nhạc → clip Muse → MP4) với chế độ Demo + "Muse giả" + thư mục nhạc tạm:
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
    // Kho đánh số: bài 1 có hai bản. Mức hay trong Kho bài hát.xlsx: 1 = rất hay, 2 = hay, 3 = bình thường. Video dài 1 phút.
    tone("1.mp3", 25);
    tone("1 (1).mp3", 25, 360);
    tone("2.mp3", 20, 392);
    tone("3.mp3", 15, 440);
    await sheet([
      ["1", "Silver Bells Waltz", 3],
      ["2", "Snow On Main Street", 2],
      ["3", "Candle In The Window", 1],
    ]);
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
});
