// Danh sách nhạc của video Giáng sinh dài (~1 tiếng): chọn bài, tên bài, mốc thời gian trong mô tả YouTube, chữ trên ảnh bìa.
import { describe, expect, it } from "vitest";
import { coverText } from "@/lib/cover";
import { chapterTime, pickPlaylist, trackTitle, withTracklist, type PoolSong } from "@/lib/playlist";
import { videoLengthLabel } from "@/lib/prompts";
import { songKey } from "@/lib/songs";

const song = (file: string, duration: number): PoolSong => ({ file: `D:/nhac/${file}`, duration, channels: 2 });

describe("chọn bài cho danh sách nhạc", () => {
  const pool = [
    song("3.mp3", 200),
    song("1 đã dùng.wav", 180),
    song("1 (1).wav", 180),
    song("1 (1).mp3", 180),
    song("2.mp3", 190),
    song("2 (1).mp3", 190),
    song("Silent Snow.mp3", 210),
    song("10.wav", 170),
  ];

  it("bản chưa dùng, mỗi bài một bản (WAV trước MP3), bài số nhỏ trước rồi tới bài theo tên; đủ độ dài thì dừng", () => {
    const p = pickPlaylist(pool, 600);
    expect(p.songs.map((s) => s.file.replace("D:/nhac/", ""))).toEqual(["1 (1).wav", "2.mp3", "3.mp3", "10.wav"]);
    expect(p.total).toBe(740);
    expect(p.enough).toBe(true);
    expect(p.available).toBe(180 + 190 + 200 + 170 + 210);
  });

  it("bỏ bài đã ghép vào video khác; tên bài ghi trong ý tưởng được đặt lên đầu; không đủ thì báo", () => {
    const taken = (f: string) => ["1|1", "2|0"].includes(songKey(f));
    const p = pickPlaylist(pool, 600, { taken, first: "Silent Snow" });
    expect(p.songs.map((s) => s.file.replace("D:/nhac/", ""))).toEqual(["Silent Snow.mp3", "2 (1).mp3", "3.mp3"]);
    expect(pickPlaylist(pool, 3600).enough).toBe(false);
    // Một bản mix dài sẵn đủ độ dài thì dùng một mình nó.
    expect(pickPlaylist([song("Christmas Mix.wav", 3610), song("5.mp3", 180)], 3600, { first: "Christmas Mix" }).songs).toHaveLength(1);
  });

  it("tên bài: câu hook trong thư viện lời, không có thì tên file đã làm gọn", () => {
    const hooks = new Map([[2, "Snow On Main Street"]]);
    expect(trackTitle("2 (1).mp3", hooks)).toBe("Snow On Main Street");
    expect(trackTitle("7.wav", hooks)).toBe("Christmas Song No. 7");
    expect(trackTitle("silent snow - piano version đã dùng.mp3", hooks)).toBe("Silent Snow");
    expect(trackTitle("Jingle Bell Swing đã dùng.wav", hooks)).toBe("Jingle Bell Swing");
  });
});

describe("mô tả YouTube có danh sách bài", () => {
  it("mốc thời gian kiểu YouTube", () => {
    expect(chapterTime(0)).toBe("0:00");
    expect(chapterTime(187.6)).toBe("3:07");
    expect(chapterTime(3723)).toBe("1:02:03");
  });

  it("chèn danh sách bài trước dòng hashtag; một bài thì giữ nguyên", () => {
    const tracks = [
      { title: "Snow On Main Street", start: 0 },
      { title: "Silent Snow", start: 185.2 },
    ];
    expect(withTracklist("Pull up a chair.\n\n#christmasmusic #1950s", tracks)).toBe("Pull up a chair.\n\nTracklist:\n0:00 Snow On Main Street\n3:05 Silent Snow\n\n#christmasmusic #1950s");
    expect(withTracklist("Pull up a chair.", tracks)).toBe("Pull up a chair.\n\nTracklist:\n0:00 Snow On Main Street\n3:05 Silent Snow");
    expect(withTracklist("Pull up a chair.", tracks.slice(0, 1))).toBe("Pull up a chair.");
  });

  it("độ dài video cho tiêu đề", () => {
    expect(videoLengthLabel(60)).toBe("1 Hour");
    expect(videoLengthLabel(90)).toBe("1.5 Hours");
    expect(videoLengthLabel(120)).toBe("2 Hours");
    expect(videoLengthLabel(45)).toBe("45 Minutes");
  });
});

describe("chữ trên ảnh bìa", () => {
  const mv = (title: string) => ({ idea: { id: "1", world_location: "Woodstock Vermont Christmas Eve 1952", theme_code: "T18", outline: "" }, youtube_titles: [title] });

  it("phần đầu tiêu đề YouTube, bỏ emoji, không cắt giữa chữ; dòng dưới có năm và độ dài video", () => {
    const a = coverText(mv("Snowy Christmas Eve in Vermont 🎄 Vintage 1950s Christmas Music (1 Hour)"), undefined, 3600);
    expect(a.lines.join(" ")).toBe("Snowy Christmas Eve in Vermont");
    expect(a.sub).toBe("Woodstock Vermont Christmas Eve · 1952 · 1 Hour");
    const b = coverText(mv("An Old-Fashioned Small Town Christmas With Carolers And Sleigh Bells Everywhere Tonight"));
    expect(b.lines.join(" ").length).toBeLessThanOrEqual(60);
    expect(b.lines.join(" ")).toMatch(/Carolers And$/);
    expect(b.sub).toBe("Woodstock Vermont Christmas Eve · 1952");
  });
});
