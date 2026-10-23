// Kho nhạc đánh số (tên file thật trên Drive của kênh) + lời bài hát có nhãn kiểu Suno.
import { describe, expect, it } from "vitest";
import { normSong, songNumber } from "@/lib/songs";
import { parseLyrics } from "@/lib/structure";

describe("kho nhạc đánh số", () => {
  it("đọc số bài và số bản trong tên file (tên thật trong thư mục KHO NHẠC)", () => {
    expect(songNumber("12 (1).wav")).toEqual({ n: 12, version: 1 });
    expect(songNumber("76_1.mp3")).toEqual({ n: 76, version: 1 });
    expect(songNumber("2đã dùng.wav")).toEqual({ n: 2, version: 0 });
    expect(songNumber("1 (2)đã dùng.wav")).toEqual({ n: 1, version: 2 });
    expect(songNumber("015.wav")).toEqual({ n: 15, version: 0 });
    expect(songNumber("Đèn Khuya - Rock Version.wav")).toBeNull();
    expect(songNumber("Sương Lạnh Chiều Đông1 - nam metal rock.wav")).toBeNull();
    expect(normSong("Đèn Khuya - Rock Version")).toBe("den khuya rock version");
  });
});

describe("lời bài hát có nhãn kiểu Suno", () => {
  const LYRICS = `[Intro - bright, hand claps in, full group]
Sha-la-la, sha-la-la-la-la (on the Boulevard!)

[Verse 1]
Prettier than the star on the screen tonight
She walked out of the show in the marquee light

[Chorus]
(Sha-la-la) Prettier than the screen

[Sax Solo]

[Hand Clap Break - call and response]
(Clap-clap) On the reel! (Clap-clap) She's more real!

[Spoken]
Hey there, darlin'

[Final Chorus - bigger, joyful, full group]
'Cause you're prettier, darlin', than the silver screen

[Outro - bright, hand claps, fade]
Golden days, my real-life queen!`;

  it("nhãn có mô tả không lẫn vào lời; mỗi dòng về đúng đoạn", () => {
    const names = ["Intro", "Verse 1", "Chorus 1", "Bridge", "Final chorus", "Outro"];
    const { lines, hasMarkers } = parseLyrics(LYRICS, names);
    expect(hasMarkers).toBe(true);
    expect(lines.some((l) => l.text.startsWith("["))).toBe(false);
    const sec = (text: string) => lines.find((l) => l.text.startsWith(text))?.section;
    expect(sec("Sha-la-la")).toBe("Intro");
    expect(sec("Prettier than the star")).toBe("Verse 1");
    expect(sec("(Sha-la-la) Prettier")).toBe("Chorus 1");
    expect(sec("(Clap-clap)")).toBe("Bridge");
    expect(sec("Hey there")).toBe("Bridge"); // nhãn lạ: giữ đoạn đang có
    expect(sec("'Cause you're")).toBe("Final chorus");
    expect(sec("Golden days")).toBe("Outro");
  });
});
