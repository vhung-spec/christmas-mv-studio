// Danh sách nhạc của video Giáng sinh dài (~1 tiếng): tên bài, mốc thời gian trong mô tả YouTube, chữ trên ảnh bìa.
// (Chọn bài nào: tests/channels.test.ts — tự xếp bài kiểu Bokin.)
import { describe, expect, it } from "vitest";
import { coverText } from "@/lib/cover";
import { chapterTime, trackTitle, withTracklist } from "@/lib/playlist";
import { videoLengthLabel } from "@/lib/prompts";

describe("tên bài khi chưa có trong Kho bài hát", () => {
  it("câu hook trong thư viện lời, không có thì tên file đã làm gọn", () => {
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
