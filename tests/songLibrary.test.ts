// Kho nhạc đánh số theo ý tưởng (tên file thật trên Drive của kênh) + lời bài hát có nhãn kiểu Suno.
import { describe, expect, it } from "vitest";
import { isUsedSong, pickSongByNumber, songNumber } from "@/lib/songs";
import { parseLyrics } from "@/lib/structure";

// Tên file thật trong thư mục "KHO NHẠC".
const FILES = [
  "1 (2)đã dùng.wav",
  "1 đã dùng.wav",
  "2đã dùng.wav",
  "3 đã dùng .wav",
  "8 (1) đã dùng.wav",
  "8.wav",
  "10 (1).wav",
  "10 đã dùng .wav",
  "15dadung.wav",
  "15 (1).wav",
  "25 (1).wav",
  "25 (2).wav",
  "25.wav",
  "72.mp3",
  "72.wav",
  "76_1.mp3",
  "76.mp3",
  "101 da dung.mp3",
  "101_1.mp3",
  "Đèn Khuya - Rock Version.wav",
].map((f) => `D:/KHO NHẠC/${f}`);

describe("kho nhạc đánh số", () => {
  it("đọc số bài, số bản và chữ “đã dùng” trong tên file", () => {
    expect(songNumber("12 (1).wav")).toEqual({ n: 12, version: 1 });
    expect(songNumber("76_1.mp3")).toEqual({ n: 76, version: 1 });
    expect(songNumber("2đã dùng.wav")).toEqual({ n: 2, version: 0 });
    expect(songNumber("Đèn Khuya - Rock Version.wav")).toBeNull();
    expect(songNumber("Sương Lạnh Chiều Đông1 - nam metal rock.wav")).toBeNull();
    for (const f of ["1 (2)đã dùng.wav", "2đã dùng.wav", "3 đã dùng .wav", "15dadung.wav", "101 da dung.mp3", "10 đã dung.wav"]) expect(isUsedSong(f)).toBe(true);
    for (const f of ["8.wav", "76_1.mp3", "Dấu Tình Sầu - Rock Version.wav"]) expect(isUsedSong(f)).toBe(false);
  });

  it("chọn bản chưa dùng trước, theo thứ tự bản, WAV trước MP3", () => {
    const name = (n: number) => pickSongByNumber(n, FILES)?.file.split("/").pop();
    expect(name(8)).toBe("8.wav");
    expect(name(10)).toBe("10 (1).wav");
    expect(name(15)).toBe("15 (1).wav");
    expect(name(25)).toBe("25.wav");
    expect(name(72)).toBe("72.wav");
    expect(name(76)).toBe("76.mp3");
    expect(name(101)).toBe("101_1.mp3");
    expect(pickSongByNumber(25, FILES)).toMatchObject({ used: false, total: 3, free: 3 });
    // Mọi bản đều đã dùng → vẫn trả về (để báo), đánh dấu used.
    expect(pickSongByNumber(1, FILES)).toMatchObject({ used: true, total: 2, free: 0 });
    expect(pickSongByNumber(99, FILES)).toBeNull();
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
