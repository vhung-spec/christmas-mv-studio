// Khung xem cửa sổ Muse: chụp tab, bấm / gõ / xoá / cuộn, kiểu điện thoại, tab bật lên — chạy với Chrome thật (hồ sơ tạm, trang
// thử ngay trên máy, không vào Muse). Máy không có Chrome thì bỏ qua.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Chrome, findChrome } from "@/lib/museEngine/chrome";
import { captureTab, mobileTabs, resetMobile, screenInput, screenTabs } from "@/lib/museEngine/screen";

const PAGE = `<!doctype html><html><head><title>thu</title></head><body style="margin:0">
<input id="a" style="position:absolute;left:10px;top:10px;width:300px;height:40px;font-size:20px">
<button id="b" style="position:absolute;left:10px;top:80px;width:200px;height:50px" onclick="document.title='da bam'">Bấm</button>
<div style="height:3000px"></div></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), "mvps-screen-"));
const chrome = new Chrome({ profileDir: path.join(dir, "profile"), url: `data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(async () => {
  await chrome.close().catch(() => {});
  await sleep(500);
  rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!findChrome())("khung xem cửa sổ Muse (Chrome thật)", () => {
  it("chụp, bấm, gõ, xoá, cuộn, kiểu điện thoại, tab bật lên", async () => {
    await chrome.start();
    for (let i = 0; i < 50 && (await chrome.evaluate("document.title")) !== "thu"; i++) await sleep(100);
    const tab = chrome.targetId;

    const tabs = await screenTabs(chrome);
    expect(tabs[0]).toMatchObject({ id: tab, muse: true });

    const shot = await captureTab(chrome, tab);
    expect(shot.jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(shot.width).toBeGreaterThan(300);
    expect(shot.height).toBeGreaterThan(200);
    expect(shot.url).toMatch(/^data:text\/html/);

    // Bấm vào ô rồi gõ; Backspace xoá một chữ; bấm nút.
    await screenInput(chrome, tab, { type: "click", x: 100, y: 30 }, false);
    await screenInput(chrome, tab, { type: "text", text: "hello@ví dụ" }, false);
    expect(await chrome.evaluate("document.querySelector('#a').value")).toBe("hello@ví dụ");
    await screenInput(chrome, tab, { type: "key", key: "Backspace" }, false);
    expect(await chrome.evaluate("document.querySelector('#a').value")).toBe("hello@ví d");
    await screenInput(chrome, tab, { type: "click", x: 100, y: 105 }, false);
    expect(await chrome.evaluate("document.title")).toBe("da bam");

    // Cuộn.
    await screenInput(chrome, tab, { type: "wheel", x: 200, y: 200, dy: 600 }, false);
    for (let i = 0; i < 20 && Number(await chrome.evaluate("scrollY")) === 0; i++) await sleep(50);
    expect(Number(await chrome.evaluate("scrollY"))).toBeGreaterThan(0);

    // Kiểu điện thoại: chỉ khi đang đăng nhập; tắt thì về khung cũ.
    const wide = Number(await chrome.evaluate("innerWidth"));
    await expect(screenInput(chrome, tab, { type: "mobile", on: true }, false)).rejects.toThrow(/đăng nhập/);
    await screenInput(chrome, tab, { type: "mobile", on: true }, true);
    expect(Number(await chrome.evaluate("innerWidth"))).toBe(412);
    expect(mobileTabs()).toEqual([tab]);
    expect((await captureTab(chrome, tab)).width).toBe(412);
    await resetMobile(chrome);
    expect(mobileTabs()).toEqual([]);
    expect(Number(await chrome.evaluate("innerWidth"))).toBe(wide);

    // Trang đăng nhập mở ở tab bật lên → thấy trong danh sách, chụp và gõ được ở tab đó.
    await chrome.cmd(
      "Runtime.evaluate",
      { expression: "(() => { const w = window.open('about:blank'); w.document.write('<title>dang nhap</title><input id=p autofocus style=\"width:300px;height:40px\">'); w.document.close(); return true })()", userGesture: true, returnByValue: true },
      chrome.sessionId,
    );
    let popup;
    for (let i = 0; i < 30 && !popup; i++) {
      popup = (await screenTabs(chrome)).find((t) => !t.muse);
      if (!popup) await sleep(100);
    }
    expect(popup).toBeDefined();
    const pshot = await captureTab(chrome, popup!.id);
    expect(pshot.jpeg.length).toBeGreaterThan(100);
    await screenInput(chrome, popup!.id, { type: "click", x: 50, y: 20 }, false);
    await screenInput(chrome, popup!.id, { type: "text", text: "123456" }, false);
    // Đọc lại ô trong tab bật lên qua chính tab đó.
    const { sessionId } = (await chrome.cmd("Target.attachToTarget", { targetId: popup!.id, flatten: true })) as { sessionId: string };
    const r = (await chrome.cmd("Runtime.evaluate", { expression: "document.querySelector('#p').value", returnByValue: true }, sessionId)) as { result: { value: string } };
    expect(r.result.value).toBe("123456");
  }, 60000);
});
