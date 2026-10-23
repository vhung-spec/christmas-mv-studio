// Chạy toàn bộ pipeline ở chế độ demo với 5 dòng ý tưởng Giáng sinh mẫu (cặp đôi, chỉ cảnh, gia đình, trẻ em, về nhà).
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MVResult } from "@/lib/types";

export const CHRISTMAS_PIPE = `1 | Rockefeller Center Christmas Eve 1954 | T01 Đêm Giáng sinh lãng mạn | Cặp đôi trẻ hẹn nhau ở sân băng dưới cây thông khổng lồ; tuyết rơi và nụ hôn đầu dưới ánh đèn màu.
2 | Woodstock Vermont First Snow 1952      | T18 Làng tuyết yên bình     | Chỉ cảnh, không nhân vật chính: làng tuyết, cầu gỗ có mái, xe trượt ngựa kéo và những ô cửa ấm áp.
3 | Suburban Home Christmas Morning 1956   | T06 Sáng Giáng sinh mở quà  | Cả gia đình thức dậy sớm, bọn trẻ chạy xuống cầu thang mở quà dưới cây thông đèn bọt.
4 | State Street Chicago Christmas 1953    | T10 Phố đèn Giáng sinh      | Hai đứa trẻ đi xem tủ kính đồ chơi chuyển động và xếp hàng gặp ông già Noel.
5 | Midwest Farmhouse Christmas Eve 1955   | T03 Về nhà đón Giáng sinh   | Người con trai đi xa trở về trang trại phủ tuyết đúng đêm Giáng sinh, cả nhà ùa ra đón.`;

const tmp = mkdtempSync(path.join(tmpdir(), "mvps-"));
for (const f of readdirSync("data").filter((f) => f.endsWith(".json"))) cpSync(path.join("data", f), path.join(tmp, f));
process.env.MV_DATA_DIR = tmp;
process.env.MOCK_LLM = "1";

type Gen = typeof import("@/lib/generate");
type Store = typeof import("@/lib/store");
let gen: Gen;
let store: Store;
const results: MVResult[] = [];

beforeAll(async () => {
  gen = await import("@/lib/generate");
  store = await import("@/lib/store");
  const { parseIdeaTable } = await import("@/lib/parser");
  const ideas = parseIdeaTable(CHRISTMAS_PIPE, { series: "1–50 · New York – New England – Chicago" }).rows;
  for (const idea of ideas) results.push(await gen.generateMV(idea));
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("pipeline (demo)", () => {
  it("dòng 1: 20–30 cảnh (một vòng cảnh, theo cài đặt), nhân vật nhất quán, không sai niên đại", () => {
    const mv = results[0];
    expect(mv.generator).toBe("mock");
    expect(mv.shots.length).toBeGreaterThanOrEqual(20);
    expect(mv.shots.length).toBeLessThanOrEqual(30);
    expect(mv.editing_notes.some((n) => n.section === "Lặp cảnh")).toBe(true);
    for (const r of results) expect(r.shots.length).toBeLessThanOrEqual(30);
    expect(mv.location_key).toBe("Rockefeller Center");
    expect(mv.year).toBe(1954);
    const he = mv.character_bible.characters.find((c) => c.id === "HE")!;
    const withHe = mv.shots.filter((s) => s.characters_in_shot.includes("HE"));
    expect(withHe.length).toBeGreaterThan(5);
    for (const s of withHe) expect(s.prompt_en).toContain(he.description);
    const errors = mv.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
    // Cảnh đời sống Giáng sinh 50s: không có nhân vật chính.
    const life = mv.shots.filter((s) => s.era_life);
    expect(life.length).toBeGreaterThan(3);
    for (const s of life) expect(s.characters_in_shot).toEqual([]);
    expect(mv.youtube_titles[0]).toMatch(/1 Hour/);
  });

  it("nhân vật theo ý tưởng: chỉ cảnh / gia đình / trẻ em; địa điểm Giáng sinh khớp đúng", () => {
    expect(results.map((r) => r.location_key)).toEqual(["Rockefeller Center", "Woodstock Vermont", "Suburban Home", "State Street Chicago", "Midwest Farmhouse"]);
    const scenery = results[1];
    expect(scenery.character_bible.characters).toEqual([]);
    for (const s of scenery.shots) expect(s.characters_in_shot).toEqual([]);
    expect(scenery.generation_notes.some((n) => /chỉ có cảnh/.test(n.message_vi))).toBe(true);
    expect(scenery.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(results[2].character_bible.characters.map((c) => c.id)).toEqual(["MOTHER", "GIRL", "FATHER", "BOY"]);
    expect(results[3].character_bible.characters.map((c) => c.id)).toEqual(["GIRL", "BOY"]);
    expect(results[4].character_bible.characters.map((c) => c.id)).toContain("FATHER");
  });

  it("mọi prompt: tiếng Anh, có style preset ở cuối, trong giới hạn độ dài, không sai niên đại", async () => {
    const libs = await store.readLibraries();
    for (const mv of results) {
      const limit = libs.videoModels[mv.video_model].max_prompt_chars;
      for (const s of mv.shots) {
        expect(s.prompt_en.length).toBeLessThanOrEqual(limit);
        expect(s.prompt_en).toContain(mv.style_text);
        expect(s.prompt_en).not.toMatch(/\{\{|\[STYLE\]/);
        expect(s.prompt_en).not.toMatch(/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữự]/i);
      }
      expect(mv.issues.filter((i) => i.category === "era" && i.severity === "error")).toEqual([]);
    }
  });

  it("mỗi chorus có cảnh chuyển động, signature shots ≥ 2", () => {
    for (const mv of results) {
      for (const sec of ["Chorus 1", "Chorus 2", "Final chorus"]) {
        expect(mv.shots.some((s) => s.section === sec && s.is_motion)).toBe(true);
      }
      expect(mv.shots.filter((s) => s.signature_shot).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("xuất XLSX: mỗi MV một sheet + sheet Tổng quan", async () => {
    const { buildWorkbook } = await import("@/lib/xlsx");
    const buf = await buildWorkbook(results);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toHaveLength(6);
    expect(names[0]).toBe("Tổng quan");
    names.slice(1).forEach((n, i) => {
      expect(n.startsWith(`${i + 1} `)).toBe(true);
      expect(n.length).toBeLessThanOrEqual(31);
    });
    expect(names[1]).toMatch(/^1 Rockefeller Center/);
    const sheet = wb.worksheets[1];
    expect(sheet.rowCount).toBe(results[0].shots.length + 1);
    expect(String(sheet.getRow(2).getCell(1).value)).toBe("1");
  });

  it("lưu lịch sử, sinh lại cảnh, sửa tay, đổi Character Bible", async () => {
    const all = await store.listMVs();
    expect(all).toHaveLength(5);
    const mv = results[0];
    const regen = await gen.regenerateShot(mv.id, 5, "góc máy khác");
    expect(regen.shots[4].prompt_core).not.toBe("");
    expect(regen.shots.length).toBe(mv.shots.length);

    const edited = await gen.updateShot(mv.id, 3, { prompt_en: "Wide shot of a quiet snowy street at dawn. " + mv.style_text });
    expect(edited.shots[2].edited).toBe(true);

    const newHe = "a 23-year-old man with a wavy chestnut pompadour, wearing a navy duffle coat over a cream sweater and grey slacks, horn-rimmed glasses";
    const chars = edited.character_bible.characters.map((c) => (c.id === "HE" ? { ...c, description: newHe } : c));
    const rebibled = await gen.updateBible(mv.id, chars);
    const heShots = rebibled.shots.filter((s) => s.characters_in_shot.includes("HE") && !s.edited);
    expect(heShots.length).toBeGreaterThan(0);
    for (const s of heShots) expect(s.prompt_en).toContain(newHe);
    // cảnh đã sửa tay giữ nguyên
    expect(rebibled.shots[2].prompt_en).toContain("quiet snowy street at dawn");
  });

  it("địa điểm mới được tự sinh và đánh dấu auto_generated", async () => {
    const mv = await gen.generateMV({ id: "99", world_location: "Santa Fe Plaza Christmas Eve 1957", theme_code: "T12", outline: "Cặp đôi đi xem đèn lồng giấy" });
    expect(mv.location.auto_generated).toBe(true);
    const libs = await store.readLibraries();
    expect(libs.locations["Santa Fe Plaza"]?.auto_generated).toBe(true);
  });

  it("cặp đôi cố định cho cả series", async () => {
    const settings = await store.readSettings();
    await store.writeSettings({ ...settings, fixedCouple: true });
    const a = await gen.generateMV({ id: "10", world_location: "Times Square New Year's Eve 1955", theme_code: "T20", outline: "Hẹn hò", series: "S2" });
    const b = await gen.generateMV({ id: "11", world_location: "Central Park Christmas Eve 1956", theme_code: "T02", outline: "Trượt băng", series: "S2" });
    expect(a.character_bible.characters.map((c) => c.description)).toEqual(b.character_bible.characters.map((c) => c.description));
    const couples = await store.readCouples();
    expect(couples["S2"].characters).toHaveLength(2);
    await store.writeSettings({ ...settings, fixedCouple: false });
  });
});
