// Kênh — kiểu dữ liệu và nhãn (thuần, dùng được cả phía server lẫn trình duyệt). Phần chạy: channels.ts.

/** Cách chọn bài mới (như Bokin): cân bằng các mức theo tỉ lệ trong kho, hoặc mức cao trước. */
export type NewOrder = "balanced" | "best_first";
export const NEW_ORDERS: Record<NewOrder, string> = { balanced: "Cân bằng các mức", best_first: "Mức cao trước" };

/** Kênh có sẵn khi chưa tạo kênh nào. */
export const DEFAULT_CHANNEL_ID = "kenh-1";
export const DEFAULT_CHANNEL_NAME = "Kênh Giáng sinh";
/** Tỉ lệ bài cũ mỗi video, % số bài — Bokin: 6 bài cũ trong 13 bài. */
export const DEFAULT_OLD_PERCENT = 46;
export const OLD_PERCENT_RANGE = [0, 90] as const;

/** Một video trong lịch sử kênh: các bài theo thứ tự trong video (mã bài) và file nhạc đã dùng. */
export interface ChannelVideo {
  /** Mã MV. */
  id: string;
  date: string;
  title: string;
  codes: string[];
  files: string[];
}

export interface Channel {
  id: string;
  name: string;
  /** Tắt = tạm không làm video mới cho kênh này. */
  active: boolean;
  oldPercent: number;
  newOrder: NewOrder;
  created_at: string;
  history: ChannelVideo[];
}

/** Kênh cho giao diện: cài đặt + số video đã làm, đang làm, bài mới còn lại cho kênh. */
export interface ChannelSummary {
  id: string;
  name: string;
  active: boolean;
  oldPercent: number;
  newOrder: NewOrder;
  /** Video của kênh: đã có danh sách nhạc (lịch sử kênh) + đang làm mà chưa xếp nhạc — số dùng để chia lần lượt. */
  videos: number;
  /** Trong số đó, video đang trong dây chuyền (chưa xong). */
  inProgress: number;
  /** Bài trong kho kênh chưa dùng lần nào. */
  unused: number;
  /** Số video còn đủ bài mới (ước tính theo độ dài video và tỉ lệ bài cũ). */
  videosLeft: number;
}

/** Kho nhạc cho giao diện: tệp Excel, số bài theo mức, lỗi trong tệp. */
export interface LibrarySummary {
  sheet: string | null;
  songs: number;
  inSheet: number;
  missing: number;
  excluded: number;
  levels: Record<1 | 2 | 3, number>;
  minutes: number;
  problems: { row: number | null; message: string }[];
}
