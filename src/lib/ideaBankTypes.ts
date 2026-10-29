// Kho ý tưởng — kiểu dữ liệu (thuần, dùng được cả phía server lẫn trình duyệt). Phần chạy: ideaBank.ts.
// Mỗi kênh một kho ý tưởng riêng (ý tưởng của kênh nào chỉ làm cho kênh đó); cài đặt kho dùng chung.

import type { IdeaRow } from "./types";

/** new = chưa dùng · proposed = Claude đề xuất, chờ duyệt · used = đã đưa vào dây chuyền · rejected = đã bỏ. */
export type BankStatus = "new" | "proposed" | "used" | "rejected";

export interface BankIdea {
  key: string;
  idea: IdeaRow;
  /** Kênh của ý tưởng (mã kênh); ý tưởng cũ chưa có kênh thuộc kênh mặc định. */
  channel?: string;
  source: "user" | "claude";
  status: BankStatus;
  added_at: string;
  used_at?: string;
  /** Lý do bỏ qua khi lấy ý tưởng. */
  note?: string;
}

export interface BankConfig {
  /** Dây chuyền tự lấy ý tưởng chưa dùng trong kho của các kênh. */
  feed: boolean;
  /** Số video làm cùng lúc (cả các kênh: đang viết kịch bản hoặc chờ clip Muse). */
  ahead: number;
  /**
   * Chỉ làm video mới khi kho nhạc còn bài mới cho kênh đó (hết bài mới thì ý tưởng của kênh nằm chờ). Tắt = kho nhạc chưa xong:
   * cứ làm kịch bản + clip, video chờ ở bước Nhạc, có nhạc là tự xếp bài rồi dựng.
   */
  needSong: boolean;
  /** Kho của kênh sắp hết thì nhờ Claude đề xuất thêm cho kênh đó. */
  suggest: boolean;
  /** Ý tưởng Claude đề xuất được dùng luôn, không chờ duyệt. */
  autoApprove: boolean;
  /** Số ý tưởng mỗi lần đề xuất. */
  batch: number;
  /** Bản cài đặt (2 = tự sản xuất: ý tưởng Claude dùng luôn, làm video trước rồi ghép nhạc sau). */
  version?: number;
}

export interface IdeaBank {
  ideas: BankIdea[];
  config: BankConfig;
}

/** 2026-10-29, người dùng chọn tự sản xuất: app tự nghĩ ý tưởng (dùng luôn), làm video trước, nhạc ghép sau. */
export const BANK_CONFIG_VERSION = 2;
export const DEFAULT_BANK_CONFIG: BankConfig = { feed: true, ahead: 2, needSong: false, suggest: true, autoApprove: true, batch: 10, version: BANK_CONFIG_VERSION };
export const BANK_LIMITS = { ahead: [1, 10], batch: [3, 50] } as const;

/** Kho nhạc cho một kênh: số bài dùng được, theo mức, bài kênh chưa dùng và đủ bài mới cho khoảng mấy video. */
export interface MusicStock {
  songs: number;
  levels: Record<1 | 2 | 3, number>;
  /** Bài kênh chưa dùng lần nào. */
  unused: number;
  /** Số video còn đủ bài mới (ước tính). */
  videos: number;
  videoMinutes: number;
  /** Có Kho bài hát.xlsx (mức hay). */
  sheet: boolean;
}

/** Kênh trong thẻ Kho ý tưởng: tên + số ý tưởng theo trạng thái. */
export interface BankChannel {
  id: string;
  name: string;
  active: boolean;
  counts: Record<BankStatus, number>;
}

export interface BankView {
  config: BankConfig;
  /** Kênh đang xem. */
  channel: string;
  channels: BankChannel[];
  /** Số ý tưởng của kênh đang xem theo trạng thái. */
  counts: Record<BankStatus, number>;
  /** Số ý tưởng chưa dùng của kênh lấy được ngay (theo bài mới còn lại); null = không lọc theo nhạc. */
  ready: number | null;
  /** Kho nhạc cho kênh đang xem; null = chưa đặt Thư mục nhạc (hoặc không mở được). */
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
  /** Lần đề xuất gần nhất: kênh, số ý tưởng thêm được và chi phí. */
  last: { at: string; channel?: string; added: number; dropped: number; cost_usd: number | null } | null;
}
