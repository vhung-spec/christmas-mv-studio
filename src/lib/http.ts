// Tiện ích cho route handler: trả lỗi JSON thống nhất.

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UserError } from "./errors";
import { LLMError } from "./llm";

export function errorResponse(err: unknown) {
  if (err instanceof LLMError) {
    const status = { auth: 401, rate_limit: 429, refusal: 422, aborted: 499, parse: 502, truncated: 502, api: 502 }[err.kind];
    return NextResponse.json({ error: err.message, kind: err.kind }, { status });
  }
  if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    const msg = err.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(gốc)"}: ${i.message}`)
      .join("; ");
    return NextResponse.json({ error: `Dữ liệu không hợp lệ — ${msg}` }, { status: 400 });
  }
  const message = err instanceof Error ? err.message : String(err);
  const status = /không tìm thấy/i.test(message) ? 404 : 500;
  if (status === 500) console.error(err);
  return NextResponse.json({ error: message }, { status });
}

/**
 * Lệnh (POST…) chỉ nhận từ chính trang của app. Trình duyệt luôn ghi Origin khi một trang web gửi lệnh: Origin khác địa chỉ app =
 * trang web khác đang gửi thay bạn (vd. trang lạ mở trên máy chạy gửi lệnh vào 127.0.0.1) → chặn. Không có Origin (script, curl trên
 * máy này) thì cho qua. Qua cổng điều khiển từ xa, Host là địa chỉ của cổng nên trang của cổng vẫn khớp.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("host");
  if (origin !== `http://${host}` && origin !== `https://${host}`) throw new UserError("Bị chặn: lệnh không gửi từ trang của app.", 403);
}

/** Đọc thân JSON của một lệnh (kèm kiểm tra lệnh gửi từ trang của app). */
export async function readJsonBody<T = unknown>(req: Request): Promise<T> {
  assertSameOrigin(req);
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Body phải là JSON hợp lệ.");
  }
}
