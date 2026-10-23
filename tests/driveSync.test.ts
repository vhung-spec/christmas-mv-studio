// Đồng bộ kho nhạc từ Google Drive: đọc link, đọc trang thư mục công khai, quyết định tải / đổi tên, đọc tài liệu bài hát.
// Không gọi mạng — chỉ các phần thuần.
import { describe, expect, it } from "vitest";
import { driveFolderId, parseFolderHtml, planAudio, type DriveEntry } from "@/lib/driveSync";
import { parseSongDoc } from "@/lib/songLibrary";

const entry = (href: string, title: string) =>
  `<div class="flip-entry" id="entry-x" tabindex="0" role="link"><div class="flip-entry-info"><a href="${href}" target="_blank"><div class="flip-entry-visual"><div class="flip-entry-visual-card"><div class="flip-entry-icon"><img src="https://drive-thirdparty.googleusercontent.com/128/type/audio/wav" alt=""/></div></div></div><div class="flip-entry-title">${title}</div></a></div><div class="flip-entry-last-modified"><div>Sep 2</div></div></div>`;

describe("Google Drive", () => {
  it("lấy mã thư mục từ nhiều kiểu link", () => {
    expect(driveFolderId("https://drive.google.com/drive/folders/1fUb_6qMBcBSV_hZqI_qua6QaS8hSTUTR?usp=drive_link")).toBe("1fUb_6qMBcBSV_hZqI_qua6QaS8hSTUTR");
    expect(driveFolderId("https://drive.google.com/embeddedfolderview?id=1c63CKX2AlpSWtqDFLtO3_VjokW4NWzWZ#list")).toBe("1c63CKX2AlpSWtqDFLtO3_VjokW4NWzWZ");
    expect(driveFolderId(" 1c63CKX2AlpSWtqDFLtO3_VjokW4NWzWZ ")).toBe("1c63CKX2AlpSWtqDFLtO3_VjokW4NWzWZ");
    expect(driveFolderId("https://example.com/abc")).toBeNull();
    expect(driveFolderId("")).toBeNull();
  });

  it("đọc trang thư mục công khai: thư mục con, file, Google Doc, Google Sheet (Kho bài hát)", () => {
    const html = [
      entry("https://drive.google.com/drive/folders/12fbMkITDMuqzC7RbCwznUkVEEPWylNfr", "1 . dl bản 1"),
      entry("https://drive.google.com/file/d/1aPxIbW6jZmPoJUWv-iN8peUEEOkRUZDC/view?usp=drive_web", "1 (2)đã dùng.wav"),
      entry("https://docs.google.com/document/d/1Pd0EAhN0-uT4Uoshtqdx8GqUH79BmGCZFutjPM4WRJU/edit?usp=drive_web", "Tài liệu &amp; lời"),
      entry("https://docs.google.com/spreadsheets/d/1KxSheetAbCdEfGhIjKlMnOpQrStUvWxYz012345/edit?usp=drive_web", "Kho bài hát"),
    ].join("");
    expect(parseFolderHtml(html)).toEqual([
      { kind: "folder", id: "12fbMkITDMuqzC7RbCwznUkVEEPWylNfr", name: "1 . dl bản 1" },
      { kind: "file", id: "1aPxIbW6jZmPoJUWv-iN8peUEEOkRUZDC", name: "1 (2)đã dùng.wav" },
      { kind: "doc", id: "1Pd0EAhN0-uT4Uoshtqdx8GqUH79BmGCZFutjPM4WRJU", name: "Tài liệu & lời" },
      { kind: "sheet", id: "1KxSheetAbCdEfGhIjKlMnOpQrStUvWxYz012345", name: "Kho bài hát" },
    ]);
  });

  it("tải mọi file nhạc còn thiếu (kể cả bản ghi “đã dùng”: bài cũ được dùng lại), đổi tên bản ở máy khi Drive đổi tên", () => {
    const f = (name: string): DriveEntry => ({ kind: "file", id: `id-${name}`, name });
    const drive = [f("8 (1) đã dùng.wav"), f("8.wav"), f("10 đã dùng .wav"), f("10 (1).wav"), f("72.mp3"), f("72.wav"), f("76_1.mp3")];
    const local = ["8 (1).wav", "8.wav", "72.wav", "Đèn Khuya - Rock Version.wav"];
    const plan = planAudio(drive, local);
    expect(plan.rename).toEqual([{ from: "8 (1).wav", to: "8 (1) đã dùng.wav" }]);
    expect(plan.download.map((e) => e.name)).toEqual(["10 đã dùng .wav", "10 (1).wav", "72.mp3", "76_1.mp3"]);
    // Đồng bộ lần hai (đã tải, đã đổi tên) → không còn gì để làm.
    expect(planAudio(drive, ["8 (1) đã dùng.wav", "8.wav", "10 đã dùng .wav", "10 (1).wav", "72.mp3", "72.wav", "76_1.mp3"])).toEqual({ download: [], rename: [] });
  });

  it("đọc tài liệu bài hát: 3 dòng ý tưởng + lời", () => {
    const doc = `﻿Hollywood Boulevard Summer 1954\r\n\tT01 Sét ái tình\r\n\tChàng trai bắt gặp cô gái bước ra khỏi rạp phim.\r\n\t\r\n\r\n[Intro - bright, hand claps in, full group]\r\nSha-la-la (on the Boulevard!)\r\n\r\n[Verse 1]\r\nPrettier than the star on the screen tonight\r\n\r\n[Chorus]\r\n(Sha-la-la) Prettier than the screen\r\n`;
    expect(parseSongDoc(1, doc)).toEqual({
      n: 1,
      world_location: "Hollywood Boulevard Summer 1954",
      theme_code: "T01",
      theme_name: "Sét ái tình",
      outline: "Chàng trai bắt gặp cô gái bước ra khỏi rạp phim.",
      hook: "Prettier Than The Screen",
      mood: "Tươi sáng, vỗ tay",
      lyrics: "[Intro - bright, hand claps in, full group]\nSha-la-la (on the Boulevard!)\n\n[Verse 1]\nPrettier than the star on the screen tonight\n\n[Chorus]\n(Sha-la-la) Prettier than the screen",
    });
    // Tài liệu chỉ có ý tưởng (chưa có lời) vẫn đọc được; tài liệu trống → null.
    expect(parseSongDoc(33, "Fremont Street Las Vegas 1953\n\tT01 Sét ái tình\n\tTrong biển neon…")).toMatchObject({ n: 33, lyrics: "", hook: "" });
    expect(parseSongDoc(85, "﻿\r\n")).toBeNull();
  });
});
