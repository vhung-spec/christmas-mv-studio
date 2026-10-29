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

/** Loại video: MV một bài (~3–4 phút, kịch bản theo bài) hoặc playlist ~1 tiếng. */
export type VideoKind = "mv" | "playlist";
export const VIDEO_KINDS: Record<VideoKind, string> = { mv: "MV một bài", playlist: "Playlist 1 tiếng" };
/** Thứ tự sản xuất mặc định của kênh: mỗi vòng 3 MV một bài rồi 1 playlist (mở đầu bằng 3 bài đó). 0 = chỉ làm playlist. */
export const DEFAULT_MV_PER_ROUND = 3;
export const MV_PER_ROUND_RANGE = [0, 10] as const;
/** Làm sẵn: kênh luôn có chừng này video chưa đăng (đã làm + đang làm); bấm "Đã đăng" thì app làm bù. 0 = không tự làm cho kênh. */
export const DEFAULT_STOCK = 4;
export const STOCK_RANGE = [0, 40] as const;

/** Một video trong lịch sử kênh: các bài theo thứ tự trong video (mã bài) và file nhạc đã dùng. */
export interface ChannelVideo {
  /** Mã MV. */
  id: string;
  date: string;
  title: string;
  codes: string[];
  files: string[];
  /** Không ghi = playlist (lịch sử trước khi có MV một bài). */
  kind?: VideoKind;
  /** false = video làm sẵn, chưa đăng lên YouTube; true = đã bấm "Đã đăng". Không ghi = video từ trước khi có phần làm sẵn (coi như đã đăng). */
  posted?: boolean;
  posted_at?: string;
}

export interface Channel {
  id: string;
  name: string;
  /** Tắt = tạm không làm video mới cho kênh này. */
  active: boolean;
  oldPercent: number;
  newOrder: NewOrder;
  /** Mỗi vòng: chừng này MV một bài rồi 1 playlist; 0 = chỉ playlist. */
  mvPerRound: number;
  /** Làm sẵn: số video chưa đăng kênh luôn có (app tự làm bù); 0 = không tự làm. */
  stock: number;
  created_at: string;
  history: ChannelVideo[];
}

/** Video tiếp theo của kênh theo thứ tự sản xuất. */
export interface NextVideo {
  kind: VideoKind;
  /** MV thứ mấy trong vòng (1…mvPerRound); playlist = 0. */
  index: number;
  /** Playlist cuối vòng: mã các bài vừa có MV, đặt ở đầu playlist. */
  opensWith: string[];
}

/** Kênh cho giao diện: cài đặt + số video đã làm, đang làm, bài mới còn lại cho kênh. */
export interface ChannelSummary {
  id: string;
  name: string;
  active: boolean;
  oldPercent: number;
  newOrder: NewOrder;
  mvPerRound: number;
  /** Video tiếp theo (MV thứ mấy / playlist) và bài dự kiến cho MV đó (bài chọn lúc ghép nhạc). */
  next: NextVideo & { song: string | null };
  stock: number;
  /** Video chưa đăng: đã xếp nhạc mà chưa bấm "Đã đăng" + đang làm chưa xếp nhạc. */
  unposted: number;
  /** Các video đã xếp nhạc mà chưa đăng (mới nhất trước); rendered = đã dựng xong MP4. */
  ready: { id: string; date: string; title: string; kind: VideoKind; rendered: boolean }[];
  /** Video đã đăng gần đây (để bỏ đánh dấu nếu bấm nhầm). */
  postedRecent: { id: string; title: string; kind: VideoKind; posted_at: string }[];
  /** Video đã xếp nhạc gần đây (mới nhất trước): loại, tên, số bài. */
  recent: { id: string; date: string; title: string; kind: VideoKind; songs: number }[];
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

// ---------- Nhạc đã dùng của kênh (thẻ "Nhạc đã dùng" ở trang Kênh) ----------

/** Một bài trong video, theo thứ tự trong video. */
export interface UsedTrack {
  code: string;
  /** Tên bài (như trong mô tả YouTube). */
  title: string;
  /** Bản đã dùng (tên file). */
  file: string;
  level: 1 | 2 | 3 | null;
  /** Giây bắt đầu trong video (null = không còn biết: nhạc của video đã bị thay). */
  start: number | null;
  duration: number | null;
}

/** Một video đã xếp nhạc của kênh, kèm danh sách bài. */
export interface UsedVideo {
  id: string;
  title: string;
  date: string;
  kind: VideoKind;
  tracks: UsedTrack[];
  /** Tổng thời lượng nhạc (giây), null nếu không biết. */
  total: number | null;
  /** Video (MV) còn trong app — mở được trang Ghép video. */
  exists: boolean;
}

/** Một bài kênh đã dùng: các lần dùng (mới nhất trước) — video nào, MV hay playlist, bài thứ mấy, bản nào. */
export interface UsedSong {
  code: string;
  title: string;
  level: 1 | 2 | 3 | null;
  /** Còn dùng được trong kho nhạc (có file, không bị loại khỏi kho). */
  inLibrary: boolean;
  uses: { video: string; title: string; kind: VideoKind; date: string; file: string; position: number }[];
}

export interface UsedSongsView {
  channel: { id: string; name: string };
  /** Video mới nhất trước. */
  videos: UsedVideo[];
  /** Bài dùng gần đây nhất trước. */
  songs: UsedSong[];
  /** Bài trong kho kênh chưa dùng lần nào (mức cao trước), không tính bài MV đang làm đã giữ. */
  unused: { code: string; title: string; level: 1 | 2 | 3 }[];
  /** Bài các MV đang làm của kênh đã giữ (chưa ghép nhạc nên chưa có trong lịch sử). */
  held: { code: string; title: string; video: string }[];
  /** Đã đặt Thư mục nhạc và đọc được kho. */
  library: boolean;
}
