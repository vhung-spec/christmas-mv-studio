// Tự xếp bài kiểu Bokin Playlist Studio (chuyển từ tests/test_channels.py của Bokin) + phần lấy đủ độ dài video + phân luồng kênh +
// thứ tự sản xuất (N MV một bài rồi playlist).
import { describe, expect, it } from "vitest";
import { channelSequence, lastUse, nextVideo, pickForLength, pickMvSong, pickSongs, resting, routeChannel, songUses, type PickSong, type SeqEntry } from "@/lib/channels";
import type { ChannelVideo } from "@/lib/channelTypes";
import type { LibSong } from "@/lib/musicLibrary";
import type { Level, ReuseRule } from "@/lib/songSheet";

/** Bài B001… với các mức cho trước (như library() trong test của Bokin). */
const library = (levels: Level[]): PickSong[] => levels.map((level, i) => ({ code: `B${String(i + 1).padStart(3, "0")}`, level, exists: true }));
/** 100 bài: 18 mức 3, 30 mức 2, 52 mức 1 (như kho mẫu của Bokin). */
const sample = () => library([...Array(18).fill(3), ...Array(30).fill(2), ...Array(52).fill(1)]);
const codes = (r: { picks: { song: { code: string } }[] }) => r.picks.map((p) => p.song.code);
const video = (id: string, c: string[]): ChannelVideo => ({ id, date: "", title: "", codes: c, files: [] });

describe("pickSongs — như pick() của Bokin", () => {
  function runVideos(songs: PickSong[], history: ChannelVideo[], count: number, total = 13, old = 6) {
    const out = [];
    for (let v = 0; v < count; v++) {
      const r = pickSongs(songs, history, { total, old, seed: v });
      out.push(r);
      history.push(video(String(v), codes(r)));
    }
    return out;
  }

  it("video đầu: cân bằng các mức như trong kho, mức 3 → 2 → 1; Mức cao trước = toàn bài mức 3", () => {
    const r = pickSongs(sample(), [], { total: 13, old: 6, seed: 1 });
    const levels = r.picks.map((p) => p.song.level);
    expect(levels).toHaveLength(13);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect([3, 2, 1].map((n) => levels.filter((x) => x === n).length)).toEqual([2, 4, 7]); // như 18 / 30 / 52 của kho
    expect(r.picks.every((p) => p.role === "new" && p.last === null)).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.stats.levels).toEqual({ 3: 18, 2: 30, 1: 52 });
    expect([r.stats.newLeft, r.stats.videosLeft]).toEqual([87, 12]);
    const best = pickSongs(sample(), [], { total: 13, old: 6, newOrder: "best_first", seed: 1 });
    expect(best.picks.map((p) => p.song.level)).toEqual(Array(13).fill(3));
  });

  it("xoay vòng: 6 bài cũ + 7 bài mới, bài mở đầu mức 3 và khác video trước, bài mức 1 không dùng lại, bài cũ nghỉ lâu nhất trước", () => {
    const songs = sample();
    const level = new Map(songs.map((s) => [s.code, s.level]));
    const history: ChannelVideo[] = [];
    const results = runVideos(songs, history, 12);
    const seen = new Set<string>();
    results.forEach((r, n) => {
      const picked = codes(r);
      expect(new Set(picked).size).toBe(13);
      if (n) {
        expect(r.picks.filter((p) => p.role === "old")).toHaveLength(6);
        expect(picked[0]).not.toBe(history[n - 1].codes[0]);
      }
      expect(level.get(picked[0])).toBe(3);
      for (const p of r.picks) {
        expect(p.role === "old").toBe(seen.has(p.song.code));
        if (p.role === "old") expect(p.song.level).toBeGreaterThanOrEqual(2);
      }
      picked.forEach((c) => seen.add(c));
    });
    const last = lastUse(history);
    const next = pickSongs(songs, history, { total: 13, old: 6, seed: 99 });
    const old = next.picks.filter((p) => p.role === "old");
    const reusable = [...last].filter(([c]) => (level.get(c.toUpperCase()) ?? 1) >= 2).map(([, i]) => i).sort((a, b) => a - b);
    expect(old.map((p) => p.last!).sort((a, b) => a - b)).toEqual(reusable.slice(0, 6));
  });

  it("hết bài mới: dùng lại thêm bài mức 2–3, rồi mới tới mức 1; kho không đủ thì báo", () => {
    const songs = library([3, 3, 2, 2, 2, 1, 1, 1, 1, 1]);
    const history: ChannelVideo[] = [];
    const [first, second, third] = runVideos(songs, history, 3, 5, 2);
    expect(first.warnings).toEqual(["Kho chỉ còn 5 bài mới cho kênh này (khoảng 1 video nữa): nên thêm bài vào kho."]);
    expect(second.warnings.some((w) => w.includes("chưa đủ cho video sau"))).toBe(true); // còn 2 bài mới
    expect(third.picks.filter((p) => p.role === "new")).toHaveLength(2);
    expect(third.warnings.some((w) => w.includes("hết bài mới"))).toBe(true);
    // Mọi bài đã dùng: bài cũ mức 2–3 trước, bài mức 1 là đường cùng.
    const fourth = pickSongs(songs, history, { total: 5, old: 2, seed: 4 });
    expect(fourth.picks).toHaveLength(5);
    expect(fourth.picks.every((p) => p.song.level >= 2)).toBe(true);
    const bigger = pickSongs(songs, history, { total: 8, old: 2, seed: 5 });
    expect(bigger.picks.filter((p) => p.song.level === 1)).toHaveLength(3);
    expect(bigger.warnings.some((w) => w.includes("Dùng lại 3 bài mức 1"))).toBe(true);
    const short = pickSongs(songs, [], { total: 12, old: 2, seed: 6 });
    expect(short.picks).toHaveLength(10);
    expect(short.warnings.some((w) => w.includes("Kho chỉ đủ 10 bài"))).toBe(true);
  });

  it("bài mở đầu không trùng video trước; không có bài mức 2–3 để mở đầu thì cảnh báo", () => {
    const r = pickSongs(library([3, 2, 2, 2]), [video("0", ["B001", "B002"])], { total: 3, old: 1, seed: 1 });
    expect(codes(r)[0]).not.toBe("B001");
    expect(codes(r)).toContain("B001");
    const ones = pickSongs(library([1, 1, 1]), [], { total: 2, old: 0, seed: 1 });
    expect(ones.warnings.some((w) => w.includes("mở đầu"))).toBe(true);
  });

  it("giữ bài (Khóa), đổi bài (để ra lần này), bài loại khỏi kho, bài thiếu file", () => {
    const songs = sample();
    songs[0].exists = false; // B001: không có file nhạc
    songs[1].excluded = true; // B002: loại khỏi kho
    const first = pickSongs(songs, [], { total: 13, old: 6, seed: 3 });
    const [kept, avoided] = [codes(first)[5], codes(first)[6]];
    const again = pickSongs(songs, [], { total: 13, old: 6, seed: 3, keep: [kept, "B050"], avoid: [avoided, "B003"] });
    const picked = codes(again);
    expect(picked).toHaveLength(13);
    expect(picked).toContain(kept);
    expect(picked).toContain("B050");
    for (const c of [avoided, "B001", "B002", "B003"]) expect(picked).not.toContain(c);
    expect([again.stats.excluded, again.stats.songs]).toEqual([1, 98]);
    // Bài cũ được giữ tính vào số bài cũ.
    const history = [video("1", codes(first))];
    const oldKept = first.picks.filter((p) => p.song.level >= 2).slice(0, 2).map((p) => p.song.code);
    const r = pickSongs(songs, history, { total: 13, old: 6, seed: 4, keep: oldKept });
    expect(r.picks.filter((p) => p.role === "old")).toHaveLength(6);
    expect(oldKept.every((c) => codes(r).includes(c))).toBe(true);
  });

  it("cùng seed → cùng kết quả; khác seed → khác", () => {
    expect(codes(pickSongs(sample(), [], { total: 13, old: 6, seed: 7 }))).toEqual(codes(pickSongs(sample(), [], { total: 13, old: 6, seed: 7 })));
    expect(codes(pickSongs(sample(), [], { total: 13, old: 6, seed: 7 }))).not.toEqual(codes(pickSongs(sample(), [], { total: 13, old: 6, seed: 8 })));
  });

  it("cột Dùng lại: Thưa hơn nghỉ gấp đôi, Không dùng lại thì không bao giờ quay lại", () => {
    const base = library([3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]);
    const history = [video("0", ["B001", "B002", "B005", "B006"]), video("1", ["B003", "B004", "B007", "B008"])];
    const normal = pickSongs(base, history, { total: 4, old: 2, seed: 1 });
    expect(normal.picks.filter((p) => p.role === "old").map((p) => p.song.code).sort()).toEqual(["B001", "B002"]);
    const rule = (c: string, r: ReuseRule) => base.map((s) => (s.code === c ? { ...s, reuse: r } : s));
    const songs = rule("B001", "less").map((s) => (s.code === "B002" ? { ...s, reuse: "never" as const } : s));
    const r = pickSongs(songs, history, { total: 4, old: 2, seed: 1 });
    expect(r.picks.filter((p) => p.role === "old").map((p) => p.song.code).sort()).toEqual(["B005", "B006"]);
    const rested = resting(history);
    expect(songs.slice(0, 3).map(rested)).toEqual([1, 0, 1]);
    const h = [...history];
    for (let v = 0; v < 6; v++) {
      const x = pickSongs(songs, h, { total: 4, old: 2, seed: v });
      expect(codes(x)).not.toContain("B002");
      h.push(video(`v${v}`, codes(x)));
    }
  });
});

/** Bài trong kho nhạc với thời lượng (giây) và các bản. */
const libSong = (n: number, level: Level, seconds: number, versions = 1): LibSong => ({
  code: String(n),
  title: `Song ${n}`,
  level,
  reuse: "normal",
  excluded: false,
  exists: true,
  inSheet: true,
  versions: Array.from({ length: versions }, (_, v) => ({ file: `D:/nhac/${n}${v ? ` (${v})` : ""}.wav`, name: `${n}${v ? ` (${v})` : ""}.wav`, duration: seconds, channels: 2 })),
});

describe("pickForLength — đủ độ dài video, tỉ lệ bài cũ theo %", () => {
  const kho = () => Array.from({ length: 60 }, (_, i) => libSong(i + 1, i < 12 ? 3 : i < 30 ? 2 : 1, 180, 2));

  it("1 tiếng bài 3 phút = 20 bài; video sau 9 bài cũ (46%) + 11 bài mới; tổng đủ 60 phút", () => {
    const history: ChannelVideo[] = [];
    const first = pickForLength(kho(), history, { targetSec: 3600, oldPercent: 46, seed: "a" });
    expect([first.count, first.picks.length, first.total, first.enough]).toEqual([20, 20, 3600, true]);
    expect(first.picks.every((p) => p.role === "new")).toBe(true);
    history.push({ id: "a", date: "", title: "", codes: first.picks.map((p) => p.song.code), files: first.picks.map((p) => p.version.name) });
    const second = pickForLength(kho(), history, { targetSec: 3600, oldPercent: 46, seed: "b" });
    expect(second.picks.filter((p) => p.role === "old")).toHaveLength(9);
    expect(second.picks.filter((p) => p.role === "new")).toHaveLength(11);
    expect(second.picks[0].song.level).toBe(3);
    expect(second.picks[0].song.code).not.toBe(first.picks[0].song.code);
    // Bài dùng lại lấy bản kênh chưa dùng (bản "(1)").
    for (const p of second.picks.filter((x) => x.role === "old")) expect(p.version.name).toMatch(/\(1\)\.wav$/);
    for (const p of second.picks.filter((x) => x.role === "new")) expect(p.version.name).not.toMatch(/\(1\)/);
  });

  it("bài dài ngắn khác nhau: tăng số bài tới khi đủ; kho thiếu thì enough = false", () => {
    const mixed = [libSong(1, 3, 600), libSong(2, 2, 300), libSong(3, 2, 300), libSong(4, 1, 240), libSong(5, 1, 240)];
    const r = pickForLength(mixed, [], { targetSec: 1200, oldPercent: 46, seed: "x" });
    expect(r.total).toBeGreaterThanOrEqual(1200);
    expect(r.enough).toBe(true);
    const all = pickForLength(mixed, [], { targetSec: 3600, oldPercent: 46, seed: "x" });
    expect(all.picks).toHaveLength(5);
    expect(all.enough).toBe(false);
  });

  it("playlist cuối vòng: các bài vừa có MV đứng đầu theo thứ tự MV (là bài cũ, bản kênh chưa dùng); không lấy bài các MV sau đang giữ", () => {
    const mvs = ["12", "5", "30"];
    const history: ChannelVideo[] = mvs.map((c) => ({ ...video(`mv${c}`, [c]), files: [`${c}.wav`], kind: "mv" as const }));
    const r = pickForLength(kho(), history, { targetSec: 3600, oldPercent: 46, seed: "c", opensWith: mvs, avoid: ["1", "2"] });
    expect(r.picks.slice(0, 3).map((p) => [p.song.code, p.role, p.version.name])).toEqual(mvs.map((c) => [c, "old", `${c} (1).wav`]));
    // Kênh mới chỉ có 3 bài MV đã dùng → các bài còn lại đều mới; đủ 1 tiếng, không trùng bài, không có bài 1, 2.
    expect(r.picks.filter((p) => p.role === "old")).toHaveLength(3);
    expect([r.picks.length, r.enough]).toEqual([20, true]);
    expect(new Set(r.picks.map((p) => p.song.code)).size).toBe(20);
    expect(r.picks.some((p) => ["1", "2"].includes(p.song.code))).toBe(false);
  });
});

describe("thứ tự sản xuất — N MV một bài rồi 1 playlist mỗi vòng", () => {
  const mv = (c: string): SeqEntry => ({ kind: "mv", codes: [c] });
  const pl: SeqEntry = { kind: "playlist", codes: ["1", "2"] };

  it("3 MV mỗi vòng: MV 1 → 2 → 3 → playlist mở đầu bằng 3 bài đó → vòng mới; 0 = chỉ playlist; đổi số MV giữa chừng vẫn đúng", () => {
    expect(nextVideo([], 3)).toEqual({ kind: "mv", index: 1, opensWith: [] });
    expect(nextVideo([pl, mv("7")], 3)).toEqual({ kind: "mv", index: 2, opensWith: [] });
    expect(nextVideo([mv("7"), mv("8"), mv("9")], 3)).toEqual({ kind: "playlist", index: 0, opensWith: ["7", "8", "9"] });
    expect(nextVideo([mv("7"), mv("8"), mv("9"), pl], 3)).toEqual({ kind: "mv", index: 1, opensWith: [] });
    expect(nextVideo([pl, pl], 0)).toEqual({ kind: "playlist", index: 0, opensWith: [] });
    // Đã có 2 MV, đổi từ 3 xuống 1 → làm playlist luôn, mở đầu bằng cả 2 bài.
    expect(nextVideo([pl, mv("7"), mv("8")], 1)).toEqual({ kind: "playlist", index: 0, opensWith: ["7", "8"] });
  });

  it("chuỗi video của kênh: lịch sử (video cũ chưa ghi loại là playlist) rồi các việc đang làm", () => {
    const seq = channelSequence([video("a", ["1", "2"]), { ...video("b", ["5"]), kind: "mv" }], [mv("6")]);
    expect(seq).toEqual([{ kind: "playlist", codes: ["1", "2"] }, mv("5"), mv("6")]);
    expect(nextVideo(seq, 2)).toEqual({ kind: "playlist", index: 0, opensWith: ["5", "6"] });
  });

  it("bài cho MV: bài kênh chưa dùng, mức cao nhất trước; cùng mức thì bài có lời trước, rồi theo thứ tự kho; bỏ bài đang giữ, bị loại, thiếu file", () => {
    const kho = [libSong(1, 2, 180), libSong(2, 3, 200), libSong(3, 3, 190), { ...libSong(4, 3, 210), excluded: true }, { ...libSong(5, 3, 200), exists: false }, libSong(6, 1, 150)];
    expect(pickMvSong(kho, [])?.code).toBe("2");
    expect(pickMvSong(kho, [], [], (s) => s.code === "3")?.code).toBe("3");
    expect(pickMvSong(kho, [video("a", ["2"])])?.code).toBe("3");
    expect(pickMvSong(kho, [video("a", ["2"])], ["3"])?.code).toBe("1");
    expect(pickMvSong(kho, [video("a", ["2", "3", "1"])], ["6"])).toBeNull();
  });
});

describe("songUses — nhạc đã dùng của kênh", () => {
  it("mỗi bài các lần dùng (mới nhất trước): video nào, bài thứ mấy, bản nào; bài dùng gần đây nhất đứng trước, cùng video thì theo thứ tự", () => {
    const history: ChannelVideo[] = [
      { ...video("mv1", ["7"]), files: ["7.wav"], kind: "mv" },
      { ...video("pl1", ["7", "3", "9"]), files: ["7 (1).wav", "3.wav", "9.wav"] },
      { ...video("mv2", ["4"]), files: ["4.wav"], kind: "mv" },
    ];
    const r = songUses(history);
    expect(r.map((s) => s.code)).toEqual(["4", "7", "3", "9"]);
    expect(r[1].uses.map((u) => [u.video.id, u.position, u.file])).toEqual([
      ["pl1", 1, "7 (1).wav"],
      ["mv1", 1, "7.wav"],
    ]);
    expect(r[3].uses.map((u) => [u.video.id, u.position])).toEqual([["pl1", 3]]);
    expect(songUses([])).toEqual([]);
  });
});

describe("routeChannel — phân luồng lần lượt đều các kênh", () => {
  const chs = [
    { id: "a", active: true },
    { id: "b", active: true },
    { id: "c", active: false },
  ];
  it("kênh đang bật có ít video nhất; bằng nhau thì kênh đứng trước; bỏ qua kênh tắt và kênh bị loại", () => {
    expect(routeChannel(chs, new Map())?.id).toBe("a");
    expect(routeChannel(chs, new Map([["a", 3], ["b", 2], ["c", 0]]))?.id).toBe("b");
    expect(routeChannel(chs, new Map([["a", 1], ["b", 1]]))?.id).toBe("a");
    expect(routeChannel(chs, new Map(), new Set(["a"]))?.id).toBe("b");
    expect(routeChannel(chs, new Map(), new Set(["a", "b"]))).toBeNull();
  });
});
