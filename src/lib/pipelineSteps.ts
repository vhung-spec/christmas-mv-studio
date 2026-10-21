// Dây chuyền tự động — kiểu dữ liệu và nhãn các bước (thuần, dùng được cả phía server lẫn trình duyệt). Phần chạy: pipeline.ts.

import type { IdeaRow } from "./types";

export type StepName = "script" | "song" | "clips" | "render";
export type StepStatus = "pending" | "running" | "waiting" | "done" | "error";

export interface PipelineStep {
  status: StepStatus;
  message?: string;
}

export interface PipelineItem {
  id: string;
  title: string;
  added_at: string;
  /** Ý tưởng (khi bắt đầu từ ý tưởng, chưa có MV). */
  idea?: IdeaRow;
  mv_id?: string;
  steps: Record<StepName, PipelineStep>;
  /** Đã gửi các cảnh thiếu clip sang Muse. */
  clips_sent?: boolean;
  /** Lúc đưa vào hàng chờ dựng. */
  render_at?: string;
  /** File MP4 đã dựng (trong data/media/<mv_id>/). */
  output?: string;
  /** Ảnh bìa, file tiêu đề + mô tả YouTube (cùng thư mục MV), tiêu đề YouTube, thư mục kết quả. */
  cover?: string;
  info?: string;
  yt_title?: string;
  result_dir?: string;
  done_at?: string;
}

export interface PipelineState {
  items: PipelineItem[];
}

/** Kết quả thêm việc: số việc đã thêm, việc bỏ qua kèm lý do (MV đang chạy dở, ý tưởng đã có MV / đang chạy / trùng trong bảng). */
export interface AddResult {
  added: number;
  skipped: { title: string; reason: string }[];
}

export interface PipelineView {
  items: PipelineItem[];
  error: string | null;
  /** Đang viết kịch bản cho việc nào. */
  generating: string | null;
}

export const STEP_LABEL: Record<StepName, string> = { script: "Kịch bản", song: "Bài hát", clips: "Clip Muse", render: "Dựng MP4" };
