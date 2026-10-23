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
  /** Chỉ lấy ý tưởng khi Thư mục nhạc còn đủ bài chưa dùng cho một video (chưa đủ thì ý tưởng nằm chờ trong kho). */
  needSong: boolean;
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

export const DEFAULT_BANK_CONFIG: BankConfig = { feed: true, ahead: 2, needSong: true, suggest: true, autoApprove: false, batch: 10 };
export const BANK_LIMITS = { ahead: [1, 10], batch: [3, 50] } as const;

/** Nhạc chưa dùng trong Thư mục nhạc: tổng số phút (mỗi bài một bản) và đủ cho mấy video (theo Độ dài video). */
export interface MusicStock {
  minutes: number;
  songs: number;
  videos: number;
  videoMinutes: number;
}

export interface BankView {
  config: BankConfig;
  counts: Record<BankStatus, number>;
  /** Số ý tưởng chưa dùng lấy được ngay (nhạc đủ cho ít nhất một video thì là mọi ý tưởng, chưa đủ thì 0); null = không lọc theo nhạc. */
  ready: number | null;
  /** Nhạc chưa dùng trong Thư mục nhạc; null = chưa đặt Thư mục nhạc (hoặc không mở được). */
  music: MusicStock | null;
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
  /** Lần đề xuất gần nhất: số ý tưởng thêm được và chi phí. */
  last: { at: string; added: number; dropped: number; cost_usd: number | null } | null;
}
