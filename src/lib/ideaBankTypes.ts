// Kho ý tưởng — kiểu dữ liệu (thuần, dùng được cả phía server lẫn trình duyệt). Phần chạy: ideaBank.ts.

import type { IdeaRow } from "./types";

/** new = chưa dùng · proposed = Claude đề xuất, chờ duyệt · used = đã đưa vào dây chuyền · rejected = đã bỏ. */
export type BankStatus = "new" | "proposed" | "used" | "rejected";

export interface BankIdea {
  key: string;
  idea: IdeaRow;
  source: "user" | "claude";
  status: BankStatus;
  added_at: string;
  used_at?: string;
  /** Lý do bỏ qua khi lấy ý tưởng (vd. nhạc bài này đã dùng hết). */
  note?: string;
}

export interface BankConfig {
  /** Dây chuyền tự lấy ý tưởng chưa dùng trong kho. */
  feed: boolean;
  /** Số MV làm cùng lúc (đang viết kịch bản hoặc chờ clip Muse). */
  ahead: number;
  /** Chỉ lấy ý tưởng đã có nhạc trong Thư mục nhạc (ý tưởng chưa có nhạc nằm chờ trong kho). */
  needSong: boolean;
  /** Kho sắp hết thì nhờ Claude đề xuất thêm. */
  suggest: boolean;
  /** Ý tưởng Claude đề xuất được dùng luôn, không chờ duyệt. */
  autoApprove: boolean;
  /** Số ý tưởng mỗi lần đề xuất. */
  batch: number;
  /** Ý tưởng Claude đề xuất nghiêng dần sang mùa thu rồi mùa đông (xem seasonPlan). */
  seasonShift: boolean;
}

export interface IdeaBank {
  ideas: BankIdea[];
  config: BankConfig;
}

export const DEFAULT_BANK_CONFIG: BankConfig = { feed: true, ahead: 2, needSong: true, suggest: true, autoApprove: false, batch: 10, seasonShift: true };
export const BANK_LIMITS = { ahead: [1, 10], batch: [3, 50] } as const;

// ---------- Mùa của ý tưởng đề xuất: nghiêng dần sang thu → đông ----------

/** Sau chừng ấy ý tưởng Claude đề xuất (không tính ý tưởng đã bỏ) thì đạt mức cuối: gần hết là thu–đông, phần lớn mùa đông. */
export const SEASON_RAMP = 60;

export interface SeasonPlan {
  autumn: number;
  winter: number;
  /** Mùa nào cũng được. */
  other: number;
}

/**
 * Số ý tưởng mùa thu / mùa đông / mùa khác cho một lần đề xuất `count` ý tưởng, khi đã có `done` ý tưởng Claude đề xuất.
 * Lúc đầu 40% thu–đông (chủ yếu mùa thu) → tăng dần tới 90% sau SEASON_RAMP ý tưởng, trong đó mùa đông từ 20% lên 80%.
 * Vd. 10 ý tưởng: lần đầu 3 thu · 1 đông · 6 mùa khác; về sau 2 thu · 7 đông · 1 mùa khác.
 */
export function seasonPlan(count: number, done: number): SeasonPlan {
  const p = Math.min(1, Math.max(0, done) / SEASON_RAMP);
  const cold = Math.min(count, Math.round(count * (0.4 + 0.5 * p)));
  const winter = Math.round(cold * (0.2 + 0.6 * p));
  return { autumn: cold - winter, winter, other: count - cold };
}

const WINTER_RE = /\b(winter|december|january|february|christmas|xmas|snow\w*|new year'?s?|ski)\b/i;
const AUTUMN_RE = /\b(autumn|fall|september|october|november|halloween|thanksgiving|harvest|homecoming)\b/i;

/** Mùa của ý tưởng theo world_location (vd. "Vermont Covered Bridge Autumn 1953"); null = không ghi mùa thu / đông. */
export function ideaSeason(worldLocation: string): "autumn" | "winter" | null {
  if (/\bwinter\b/i.test(worldLocation)) return "winter";
  if (/\b(autumn|fall)\b/i.test(worldLocation)) return "autumn";
  if (WINTER_RE.test(worldLocation)) return "winter";
  return AUTUMN_RE.test(worldLocation) ? "autumn" : null;
}

export interface BankView {
  config: BankConfig;
  counts: Record<BankStatus, number>;
  /** Số ý tưởng chưa dùng đã có nhạc trong Thư mục nhạc; null = không lọc theo nhạc (tắt, hoặc chưa đặt Thư mục nhạc). */
  ready: number | null;
  /** Các ý tưởng chưa dùng sắp tới lượt (tối đa 20). */
  upcoming: BankIdea[];
  proposals: BankIdea[];
  /** Ý tưởng bị bỏ qua khi lấy (có lý do), mới nhất trước — tối đa 20. */
  skipped: BankIdea[];
  /** Thư viện lời bài hát: số bài có lời. */
  library: number;
  /** Claude đang nghĩ ý tưởng mới. */
  suggesting: boolean;
  /** Lỗi lần đề xuất gần nhất. */
  error: string | null;
  /** Mùa của lần đề xuất tới (khi bật nghiêng dần sang thu → đông); null = tắt. */
  season: SeasonPlan | null;
  /** Lần đề xuất gần nhất: số ý tưởng thêm được và chi phí. */
  last: { at: string; added: number; dropped: number; cost_usd: number | null } | null;
}
