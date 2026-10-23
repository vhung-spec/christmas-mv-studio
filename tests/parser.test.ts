import { describe, expect, it } from "vitest";
import locations from "../data/locations.json";
import {
  baseLocationName,
  extractYear,
  matchLocation,
  parseCsv,
  parseDuration,
  parseIdeaTable,
  parseTempo,
  splitThemeCell,
} from "@/lib/parser";
import type { LocationLibrary } from "@/lib/types";

export const SAMPLE_PIPE = `1 | Hollywood Boulevard Summer 1954 | T01 Sét ái tình       | Chàng trai bắt gặp cô gái bước ra khỏi rạp phim giữa Boulevard đông đúc; chỉ một ánh mắt khiến cả Hollywood như biến mất.
2 | Hollywood Drive-In Night 1956    | T11 Nụ hôn diệu kỳ    | Buổi hẹn đầu ở drive-in; bộ phim chẳng còn quan trọng sau nụ hôn đầu dưới ánh sáng màn chiếu.
3 | Sunset Boulevard Rock & Roll 1957| T09 Rung động mãnh liệt| Một cô gái nhảy Rock & Roll trong club khiến chàng trai hoàn toàn mất bình tĩnh.
4 | Hollywood Summer Nights 1958     | T08 Say đắm & ngây ngất| Hai người rong chơi Hollywood cả đêm, cảm giác như mình là ngôi sao của chính bộ phim tình yêu.
5 | Santa Monica Pier Summer 1954    | T01 Sét ái tình       | Gặp nhau tình cờ trên pier giữa tiếng nhạc và biển; dành cả buổi chiều tìm cách gặp lại.`;

describe("parseIdeaTable", () => {
  it("đọc đúng 5 dòng ví dụ (tách bằng |)", () => {
    const r = parseIdeaTable(SAMPLE_PIPE);
    expect(r.delimiter).toBe("pipe");
    expect(r.headerDetected).toBe(false);
    expect(r.warnings).toEqual([]);
    expect(r.rows).toHaveLength(5);
    expect(r.rows[0]).toMatchObject({
      id: "1",
      world_location: "Hollywood Boulevard Summer 1954",
      theme_code: "T01",
      theme_name: "Sét ái tình",
    });
    expect(r.rows[2].world_location).toBe("Sunset Boulevard Rock & Roll 1957");
    expect(r.rows[2].theme_code).toBe("T09");
    expect(r.rows[3].theme_name).toBe("Say đắm & ngây ngất");
    expect(r.rows[4].outline).toContain("pier");
  });

  it("đọc bảng dán từ Google Sheets (tab) có tiêu đề tiếng Việt", () => {
    const text = [
      "STT\tBối cảnh\tChủ đề\tKhung sườn\tTên bài\tThời lượng\tBPM",
      "1\tHollywood Boulevard Summer 1954\tT01 Sét ái tình\tChàng trai gặp cô gái\tFerris Wheel Heart\t3:20\t150",
      '2\tSanta Monica Pier Summer 1954\tT1\t"Gặp nhau trên pier\ncả buổi chiều"\t\t180\tslow',
    ].join("\n");
    const r = parseIdeaTable(text, { series: "1–50 · California" });
    expect(r.delimiter).toBe("tab");
    expect(r.headerDetected).toBe(true);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ song_title: "Ferris Wheel Heart", duration_sec: 200, bpm: 150, series: "1–50 · California" });
    expect(r.rows[1].theme_code).toBe("T01");
    expect(r.rows[1].outline).toContain("cả buổi chiều");
    expect(r.rows[1].tempo).toBe("slow");
  });

  it("đọc bảng markdown có dòng phân cách", () => {
    const md = `| id | world_location | theme_code | outline |
|---|---|---|---|
| 7 | Times Square Winter 1955 | T03 | Hẹn hò đầu tiên giữa phố đông |`;
    const r = parseIdeaTable(md);
    expect(r.headerDetected).toBe(true);
    expect(r.rows).toEqual([{ id: "7", world_location: "Times Square Winter 1955", theme_code: "T03", outline: "Hẹn hò đầu tiên giữa phố đông" }]);
  });

  it("không có cột id thì tự đánh số", () => {
    const r = parseIdeaTable("Route 66 Summer 1955\tT10\tChuyến đi bằng xe mui trần");
    expect(r.rows[0]).toMatchObject({ id: "1", world_location: "Route 66 Summer 1955", theme_code: "T10" });
  });

  it("cảnh báo khi thiếu trường bắt buộc", () => {
    const r = parseIdeaTable("1 | Hollywood 1954 | T01 |");
    expect(r.warnings.join(" ")).toMatch(/thiếu outline/);
  });

  // Bảng copy/tải từ Google Docs: mỗi ô nằm trên một dòng riêng, có tiêu đề bảng "1–50 · …" và ghi chú trước/sau.
  const DOC_CELLS = [
    "Quy ước mã",
    "T01–T18: tình yêu · T19–T22: thể thao",
    "________________",
    "",
    "1–50 · California – Las Vegas – Route 66 – New York",
    "#",
    "World / Location",
    "Chủ đề bài hát",
    "Khung sườn",
    "1",
    "Hollywood Boulevard Summer 1954",
    "T01 Sét ái tình",
    "Chàng trai bắt gặp cô gái bước ra khỏi rạp phim.",
    "2",
    "Hollywood Drive-In Night 1956",
    "T11 Nụ hôn diệu kỳ",
    "Buổi hẹn đầu ở drive-in; nụ hôn đầu dưới ánh sáng màn chiếu.",
    "3",
    "Sunset Boulevard Rock & Roll 1957",
    "T09 Rung động mãnh liệt",
    "Một cô gái nhảy Rock & Roll trong club.",
    "51–100 · Midwest – South – Florida – Hawaii – Northeast",
    "#",
    "World / Location",
    "Chủ đề bài hát",
    "Khung sườn",
    "51",
    "Chicago Jazz Club 1955",
    "T08 Say đắm & ngây ngất",
    "Hai người lạc nhau giữa tiếng kèn rồi tìm lại nhau lúc rạng sáng.",
    "52.",
    "Lake Michigan Summer 1957",
    "T01",
    "Gặp nhau trên bãi biển hồ; dành cả buổi chiều tìm cách gặp lại.",
    "SONG THEME",
    "T08 – Say đắm & ngây ngất",
  ];

  it("đọc bảng Google Docs mỗi ô một dòng, lấy tiêu đề bảng làm series", () => {
    const r = parseIdeaTable(DOC_CELLS.join("\r\n"));
    expect(r.delimiter).toBe("lines");
    expect(r.warnings).toEqual([]);
    expect(r.rows.map((x) => x.id)).toEqual(["1", "2", "3", "51", "52"]);
    expect(r.rows[0]).toMatchObject({
      world_location: "Hollywood Boulevard Summer 1954",
      theme_code: "T01",
      theme_name: "Sét ái tình",
      outline: "Chàng trai bắt gặp cô gái bước ra khỏi rạp phim.",
      series: "1–50 · California – Las Vegas – Route 66 – New York",
    });
    expect(r.rows[2].theme_name).toBe("Rung động mãnh liệt");
    expect(r.rows[3]).toMatchObject({ theme_code: "T08", series: "51–100 · Midwest – South – Florida – Hawaii – Northeast" });
    expect(r.rows[4]).toMatchObject({ id: "52", theme_code: "T01", outline: expect.stringContaining("bãi biển hồ") });
  });

  it("bản tải về (.txt) có tab đầu dòng và BOM vẫn đọc được", () => {
    const text = "﻿" + DOC_CELLS.map((l, i) => (i > 5 ? `\t${l}` : l)).join("\r\n");
    const r = parseIdeaTable(text);
    expect(r.delimiter).toBe("lines");
    expect(r.rows).toHaveLength(5);
    expect(r.rows[1]).toMatchObject({ id: "2", theme_code: "T11", theme_name: "Nụ hôn diệu kỳ" });
  });

  it("danh sách số lẻ tẻ không bị coi là bảng Google Docs", () => {
    const r = parseIdeaTable("1\nHollywood 1954\nT01\nGặp nhau\n\nghi chú\nghi chú\nghi chú\nghi chú\nghi chú");
    expect(r.delimiter).not.toBe("lines");
  });
});

describe("parseCsv", () => {
  it("CSV có header tiếng Anh, có BOM và ô nhiều dòng", () => {
    const csv = '﻿id,world_location,theme_code,outline,song_title,duration_sec,lyrics\n3,Sunset Boulevard Rock & Roll 1957,T09,"Cô gái nhảy, chàng trai mất bình tĩnh",Shake It,150,"[Chorus]\nShake it baby"';
    const r = parseCsv(csv);
    expect(r.rows[0]).toMatchObject({ id: "3", theme_code: "T09", song_title: "Shake It", duration_sec: 150 });
    expect(r.rows[0].outline).toBe("Cô gái nhảy, chàng trai mất bình tĩnh");
    expect(r.rows[0].lyrics).toContain("[Chorus]");
  });
});

describe("helpers", () => {
  it("splitThemeCell", () => {
    expect(splitThemeCell("T01 Sét ái tình")).toEqual({ code: "T01", name: "Sét ái tình" });
    expect(splitThemeCell("t9 - Rung động")).toEqual({ code: "T09", name: "Rung động" });
    expect(splitThemeCell("T11")).toEqual({ code: "T11" });
  });
  it("parseDuration", () => {
    expect(parseDuration("200")).toBe(200);
    expect(parseDuration("3:20")).toBe(200);
    expect(parseDuration("3m20s")).toBe(200);
    expect(parseDuration("3 phút 5")).toBe(185);
    expect(parseDuration("abc")).toBeUndefined();
  });
  it("parseTempo", () => {
    expect(parseTempo("fast")).toEqual({ tempo: "fast" });
    expect(parseTempo("Chậm")).toEqual({ tempo: "slow" });
    expect(parseTempo("120 BPM")).toEqual({ bpm: 120 });
  });
  it("extractYear / matchLocation / baseLocationName", () => {
    const lib = locations as LocationLibrary;
    expect(extractYear("Rockefeller Center Christmas Eve 1954")).toBe(1954);
    expect(extractYear("Somewhere")).toBeNull();
    expect(matchLocation("Rockefeller Center Christmas Eve 1954", lib)).toBe("Rockefeller Center");
    expect(matchLocation("Woodstock Vermont First Snow 1952", lib)).toBe("Woodstock Vermont");
    expect(matchLocation("Vermont Village Sleigh Ride 1953", lib)).toBe("Woodstock Vermont");
    // "stowe vermont" dài hơn alias chung "vermont" của Woodstock → đúng nơi trượt tuyết.
    expect(matchLocation("Stowe Vermont 1958", lib)).toBe("Stowe Ski Lodge");
    expect(matchLocation("Hollywood Santa Claus Lane Parade 1955", lib)).toBe("Hollywood Boulevard");
    expect(matchLocation("Grand Central Station Homecoming 1951", lib)).toBe("Grand Central Terminal");
    expect(matchLocation("Atlantis Underwater 1955", lib)).toBeNull();
    expect(baseLocationName("Portland Maine Christmas Eve 1956")).toBe("Portland Maine");
    expect(baseLocationName("Lake Placid New Year's Eve 1958")).toBe("Lake Placid");
    expect(baseLocationName("Savannah Holiday Morning 1957")).toBe("Savannah");
  });
});
