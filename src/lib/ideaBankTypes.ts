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
}

export interface BankConfig {
  /** Dây chuyền tự lấy ý tưởng chưa dùng trong kho. */
  feed: boolean;
  /** Số MV làm cùng lúc (đang viết kịch bản hoặc chờ clip Muse). */
  ahead: number;
  /** Kho sắp hết thì nhờ Claude đề xuất thêm. */
  suggest: boolean;
  /** Ý tưởng Claude đề xuất được dùng luôn, không chờ duyệt. */
  autoApprove: boolean;
  /** Số ý tưởng mỗi lần đề xuất. */
  batch: number;
}

export interface IdeaBank {
  ideas: BankIdea[];
  config: BankConfig;
}

export const DEFAULT_BANK_CONFIG: BankConfig = { feed: true, ahead: 2, suggest: true, autoApprove: false, batch: 10 };
export const BANK_LIMITS = { ahead: [1, 10], batch: [3, 50] } as const;

export interface BankView {
  config: BankConfig;
  counts: Record<BankStatus, number>;
  /** Các ý tưởng chưa dùng sắp tới lượt (tối đa 20). */
  upcoming: BankIdea[];
  proposals: BankIdea[];
  /** Claude đang nghĩ ý tưởng mới. */
  suggesting: boolean;
  /** Lỗi lần đề xuất gần nhất. */
  error: string | null;
  /** Lần đề xuất gần nhất: số ý tưởng thêm được và chi phí. */
  last: { at: string; added: number; dropped: number; cost_usd: number | null } | null;
}
