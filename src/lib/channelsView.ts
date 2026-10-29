// Kênh + kho nhạc cho giao diện (thẻ "Các kênh & kho nhạc chung" và "Nhạc đã dùng" ở trang Kênh, trang theo dõi). Chỉ dùng phía server.

import type { ChannelSummary, LibrarySummary, UsedSongsView, UsedTrack, UsedVideo } from "./channelTypes";
import { channelStatus, key, mvSongCandidates, newPerVideo, readChannels, songUses } from "./channels";
import { UserError } from "./errors";
import { loadProject } from "./media";
import { loadMusicLibrary, type MusicLibrary } from "./musicLibrary";
import { channelLoad, channelStock, itemChannel, planner, readPipeline } from "./pipeline";
import { loadMV, readSettings } from "./store";

export interface ChannelsView {
  channels: ChannelSummary[];
  /** null = chưa đặt Thư mục nhạc. */
  library: LibrarySummary | null;
  videoMinutes: number;
  /** MV một bài phát bài mấy lần liền nhau. */
  mvPlays: number;
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
  const stock = channelStock(list, items);
  const plans = planner(list, items);
  const channels = await Promise.all(list.map(async (c): Promise<ChannelSummary> => {
    const st = lib ? channelStatus(lib.songs, c.history, newPerVideo(lib.songs, target, c.oldPercent)) : null;
    const p = plans.plan(c.id);
    // Bài dự kiến cho MV tiếp theo: bài lấy lúc ghép nhạc, các MV đang làm chưa có nhạc của kênh lấy trước các bài đầu danh sách.
    const waitingMvs = items.filter((i) => !i.done_at && itemChannel(i) === c.id && (i.kind ?? i.idea?.video_kind) === "mv" && i.steps.song.status !== "done").length;
    const song = p.kind === "mv" && lib ? (mvSongCandidates(lib.songs, c.history)[waitingMvs]?.title ?? null) : null;
    // Video làm sẵn chưa đăng đã có nhạc: ghi "chưa đăng", hoặc từ trước khi có phần làm sẵn mà còn trong dây chuyền.
    const inPipeline = new Set(items.flatMap((i) => (i.mv_id && itemChannel(i) === c.id ? [i.mv_id] : [])));
    const ready = await Promise.all(
      c.history
        .filter((v) => v.posted === false || (v.posted === undefined && inPipeline.has(v.id)))
        .reverse()
        .map(async (v) => ({
          id: v.id,
          date: v.date,
          title: v.title,
          kind: v.kind ?? ("playlist" as const),
          rendered: Boolean((await loadProject(v.id).catch(() => null))?.renders.length),
        })),
    );
    return {
      id: c.id,
      name: c.name,
      active: c.active,
      oldPercent: c.oldPercent,
      newOrder: c.newOrder,
      mvPerRound: c.mvPerRound,
      next: { kind: p.kind, index: p.index, opensWith: [], song },
      stock: c.stock,
      unposted: stock.get(c.id) ?? 0,
      ready,
      postedRecent: c.history
        .filter((v) => v.posted && v.posted_at)
        .sort((a, b) => b.posted_at!.localeCompare(a.posted_at!))
        .slice(0, 5)
        .map((v) => ({ id: v.id, title: v.title, kind: v.kind ?? "playlist", posted_at: v.posted_at! })),
      recent: c.history
        .slice(-10)
        .reverse()
        .map((v) => ({ id: v.id, date: v.date, title: v.title, kind: v.kind ?? "playlist", songs: v.codes.length })),
      videos: load.get(c.id) ?? c.history.length,
      inProgress: items.filter((i) => !i.done_at && itemChannel(i) === c.id).length,
      unused: st?.unused ?? 0,
      videosLeft: st?.videosLeft ?? 0,
    };
  }));
  return { channels, library: lib ? librarySummary(lib) : null, videoMinutes: settings.videoMinutes, mvPlays: settings.mvPlays, songDir: settings.songDir };
}

/**
 * Nhạc đã dùng của một kênh: từng video (các bài theo thứ tự, giờ bắt đầu lấy từ nhạc đã ghép của video — như danh sách bài trong mô tả
 * YouTube), từng bài (dùng ở video nào, MV hay playlist, bài thứ mấy, bản nào), bài chưa dùng và bài các MV đang làm đã giữ.
 */
export async function usedSongsView(id: string): Promise<UsedSongsView> {
  const ch = (await readChannels()).find((c) => c.id === id);
  if (!ch) throw new UserError("Không tìm thấy kênh.", 404);
  const settings = await readSettings();
  const lib = settings.songDir.trim() ? await loadMusicLibrary(settings.songDir, settings.songSheet).catch(() => null) : null;
  const byCode = new Map((lib?.songs ?? []).map((s) => [key(s.code), s]));
  const titleOf = (code: string, file: string) => byCode.get(key(code))?.title || file || code;

  const videos = await Promise.all(
    [...ch.history].reverse().map(async (v): Promise<UsedVideo> => {
      const exists = Boolean(await loadMV(v.id).catch(() => null));
      const audio = exists ? (await loadProject(v.id).catch(() => null))?.audio : undefined;
      // Giờ bắt đầu: theo nhạc đã ghép của video, khi nhạc đó vẫn đúng các bài trong lịch sử (chưa bị thay bằng nhạc khác).
      const list = audio?.tracks ?? [];
      const sameList = list.length === v.codes.length && list.every((t, k) => !t.code || key(t.code) === key(v.codes[k]));
      // MV một bài: nhạc của video là bài đó, phát một lần (không có danh sách) hoặc nhiều lần liền nhau (danh sách toàn bài đó).
      const sameSingle =
        v.codes.length === 1 && !sameList && Boolean(audio) && (list.length ? list.every((t) => !t.code || key(t.code) === key(v.codes[0])) : audio!.name === v.files[0]);
      const plays = sameSingle ? Math.max(1, list.length) : 1;
      const tracks = v.codes.map((code, k): UsedTrack => {
        const t = sameList ? list[k] : undefined;
        const version = byCode.get(key(code))?.versions.find((x) => x.name === v.files[k]);
        return {
          code,
          title: t?.title || titleOf(code, v.files[k] ?? ""),
          file: v.files[k] ?? "",
          level: byCode.get(key(code))?.level ?? null,
          start: t ? t.start : sameSingle ? 0 : null,
          duration: t?.duration ?? (sameSingle ? (list[0]?.duration ?? audio!.duration) : (version?.duration ?? null)),
          ...(plays > 1 ? { plays } : {}),
        };
      });
      const total = sameList || sameSingle ? audio!.duration : tracks.every((t) => t.duration !== null) ? tracks.reduce((a, t) => a + t.duration!, 0) : null;
      return { id: v.id, title: v.title, date: v.date, kind: v.kind ?? "playlist", tracks, total, exists };
    }),
  );

  const songs = songUses(ch.history).map(({ code, uses }) => {
    const song = byCode.get(key(code));
    return {
      code,
      title: titleOf(code, uses[0]?.file ?? ""),
      level: song?.level ?? null,
      inLibrary: !lib || Boolean(song?.exists && !song.excluded),
      uses: uses.map((u) => ({ video: u.video.id, title: u.video.title, kind: u.video.kind ?? ("playlist" as const), date: u.video.date, file: u.file, position: u.position })),
    };
  });
  const held = (await readPipeline()).items
    .filter((i) => !i.done_at && itemChannel(i) === ch.id && i.idea?.mv_song && i.steps.song.status !== "done")
    .map((i) => ({ code: i.idea!.mv_song!.code, title: titleOf(i.idea!.mv_song!.code, i.idea!.mv_song!.file), video: i.title }));
  const taken = new Set([...songs.map((x) => key(x.code)), ...held.map((x) => key(x.code))]);
  const unused = (lib?.songs ?? [])
    .filter((x) => x.exists && !x.excluded && x.versions.length && !taken.has(key(x.code)))
    .sort((a, b) => b.level - a.level)
    .map((x) => ({ code: x.code, title: x.title, level: x.level }));
  return { channel: { id: ch.id, name: ch.name }, videos, songs, unused, held, library: Boolean(lib) };
}
