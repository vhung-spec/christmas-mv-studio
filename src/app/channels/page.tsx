"use client";

// Trang Kênh: quản lý từng kênh (cài đặt, thứ tự sản xuất MV / playlist), kế hoạch sản xuất, giao việc, kho ý tưởng của kênh; cuối trang
// là kho nhạc chung trên Drive (cài một lần). Dây chuyền sản xuất (các video đang làm) ở trang Dây chuyền.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AssignCard, type AssignSettings } from "@/components/channels/AssignCard";
import { ChannelPlanCard } from "@/components/channels/ChannelPlanCard";
import { ChannelsCard, type ChannelsData } from "@/components/pipeline/ChannelsCard";
import { DriveSyncCard } from "@/components/pipeline/DriveSyncCard";
import { type BankData, IdeaBankCard } from "@/components/pipeline/IdeaBankCard";
import { ErrorBox } from "@/components/ui";
import { api } from "@/lib/client";
import type { PipelineView } from "@/lib/pipelineSteps";
import { itemChannelOf } from "@/lib/pipelineSteps";

type View = PipelineView & { settings: AssignSettings & { songDir: string } };

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelsData | null>(null);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  /** Kênh nhận việc ở thẻ Giao việc ("auto" = chia lần lượt); theo kênh đang xem cho tới khi bạn chọn khác. */
  const [target, setTarget] = useState<string | undefined>(undefined);
  const [view, setView] = useState<View | null>(null);
  const [bank, setBank] = useState<BankData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Tăng lên để thẻ Các kênh đọc lại (vừa đồng bộ kho nhạc, vừa giao việc…). */
  const [tick, setTick] = useState(0);

  const current = channels?.channels.find((c) => c.id === selected) ?? channels?.channels[0];
  const reload = useCallback(() => api<View>("/api/pipeline").then(setView, (e) => setError((e as Error).message)), []);
  const loadBank = useCallback(() => {
    if (!current) return;
    void api<BankData>(`/api/ideas?channel=${encodeURIComponent(current.id)}`).then(setBank, () => {});
  }, [current]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    loadBank();
  }, [loadBank]);
  // Có việc đang làm / Claude đang đề xuất → đọc lại vài giây một lần.
  const open = view?.items.some((i) => !i.done_at) ?? false;
  useEffect(() => {
    if (!open && !bank?.suggesting) return;
    const t = setInterval(() => {
      void reload();
      loadBank();
      setTick((n) => n + 1);
    }, 6000);
    return () => clearInterval(t);
  }, [open, bank?.suggesting, reload, loadBank]);

  const onData = useCallback((d: ChannelsData) => {
    setChannels(d);
    setSelected((s) => (s && d.channels.some((c) => c.id === s) ? s : d.channels[0]?.id));
  }, []);
  const changed = () => {
    void reload();
    loadBank();
    setTick((n) => n + 1);
  };
  const busyMvs = useMemo(() => new Set((view?.items ?? []).filter((i) => !i.done_at && i.mv_id).map((i) => i.mv_id!)), [view]);

  async function postBank(json: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      setBank(await api<BankData>("/api/ideas", { method: "POST", json }));
      setTick((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl uppercase">Kênh: quản lý &amp; kế hoạch sản xuất</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Mỗi kênh có cài đặt xếp nhạc, <b>thứ tự sản xuất</b> riêng (mỗi vòng vài <b>MV một bài</b> rồi một <b>playlist ~1 tiếng</b> mở đầu bằng các bài đó),
          lịch sử video và <b>kho ý tưởng</b> riêng. Giao việc ở đây; dây chuyền lấy dần việc của các kênh, lần lượt đều nhau, và làm ở trang{" "}
          <Link href="/pipeline" className="underline">
            Dây chuyền
          </Link>
          .
        </p>
      </div>
      <ErrorBox error={error} />

      <ChannelsCard
        refresh={tick}
        selected={current?.id}
        onSelect={(id) => {
          setSelected(id);
          setTarget(undefined);
        }}
        onData={onData}
        onChanged={changed}
      />

      {current && <ChannelPlanCard channel={current} items={(view?.items ?? []).filter((i) => itemChannelOf(i) === current.id)} videoMinutes={channels?.videoMinutes ?? 60} />}

      {channels && (
        <AssignCard
          channels={channels.channels}
          target={target ?? current?.id ?? "auto"}
          onTarget={setTarget}
          settings={view?.settings ?? null}
          bankConfig={bank?.config ?? null}
          busyMvs={busyMvs}
          onChanged={changed}
        />
      )}

      <IdeaBankCard bank={bank} busy={busy} onPost={(json) => void postBank(json)} fixedChannel />

      {/* Cài một lần: kho nhạc trên Drive (chung cho mọi kênh). */}
      <DriveSyncCard
        onSynced={() => {
          loadBank();
          setTick((n) => n + 1);
        }}
      />
    </div>
  );
}
