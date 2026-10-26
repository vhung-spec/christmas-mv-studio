// Kênh + kho nhạc cho giao diện (thẻ "Các kênh & kho nhạc chung" ở trang Kênh, trang theo dõi). Chỉ dùng phía server.

import type { ChannelSummary, LibrarySummary } from "./channelTypes";
import { channelStatus, newPerVideo, readChannels } from "./channels";
import { loadMusicLibrary, type MusicLibrary } from "./musicLibrary";
import { channelLoad, itemChannel, planner, readPipeline } from "./pipeline";
import { readSettings } from "./store";

export interface ChannelsView {
  channels: ChannelSummary[];
  /** null = chưa đặt Thư mục nhạc. */
  library: LibrarySummary | null;
  videoMinutes: number;
  songDir: string;
}

export function librarySummary(lib: MusicLibrary): LibrarySummary {
  const usable = lib.songs.filter((s) => s.exists && !s.excluded);
  return {
    sheet: lib.sheet,
    songs: usable.length,
    inSheet: lib.songs.filter((s) => s.inSheet).length,
    missing: lib.songs.filter((s) => !s.exists).length,
    excluded: lib.songs.filter((s) => s.excluded).length,
    levels: { 3: usable.filter((s) => s.level === 3).length, 2: usable.filter((s) => s.level === 2).length, 1: usable.filter((s) => s.level === 1).length },
    minutes: Math.round(usable.reduce((a, s) => a + s.versions[0].duration, 0) / 60),
    problems: lib.problems.slice(0, 30),
  };
}

export async function channelsView(): Promise<ChannelsView> {
  const settings = await readSettings();
  const lib = settings.songDir.trim() ? await loadMusicLibrary(settings.songDir, settings.songSheet).catch(() => null) : null;
  const items = (await readPipeline()).items;
  const target = settings.videoMinutes * 60;
  const list = await readChannels();
  const load = channelLoad(list, items);
  const plans = await planner(list, items);
  const channels = list.map((c): ChannelSummary => {
    const st = lib ? channelStatus(lib.songs, c.history, newPerVideo(lib.songs, target, c.oldPercent)) : null;
    const p = plans.plan(c.id);
    return {
      id: c.id,
      name: c.name,
      active: c.active,
      oldPercent: c.oldPercent,
      newOrder: c.newOrder,
      mvPerRound: c.mvPerRound,
      next: p.kind === "mv" ? { kind: "mv", index: p.index, opensWith: [], song: p.song.title } : { kind: "playlist", index: 0, opensWith: p.opensWith, song: null },
      recent: c.history
        .slice(-10)
        .reverse()
        .map((v) => ({ id: v.id, date: v.date, title: v.title, kind: v.kind ?? "playlist", songs: v.codes.length })),
      videos: load.get(c.id) ?? c.history.length,
      inProgress: items.filter((i) => !i.done_at && itemChannel(i) === c.id).length,
      unused: st?.unused ?? 0,
      videosLeft: st?.videosLeft ?? 0,
    };
  });
  return { channels, library: lib ? librarySummary(lib) : null, videoMinutes: settings.videoMinutes, songDir: settings.songDir };
}
