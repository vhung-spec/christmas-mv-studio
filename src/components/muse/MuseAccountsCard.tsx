"use client";

// Thẻ "Tài khoản Muse" (Cài đặt): tài khoản đang dùng, các tài khoản đã lưu, đổi bằng một nút, thêm tài khoản mới.
// Dùng khi tài khoản bị lỗi / bị khoá — không phải để luân phiên lách hạn mức tuần.

import { useCallback, useEffect, useState } from "react";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/client";

interface Account {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string;
  folder?: string;
  last_state?: string;
  backup?: boolean;
  broken?: { at: string; reason: string };
}
interface FailoverEvent {
  at: string;
  kind: "switch" | "none-left" | "reopen";
  from?: string;
  to?: string;
  reason: string;
}
interface View {
  active: Account;
  others: Account[];
  inflight: number;
  autoFailover: boolean;
  events: FailoverEvent[];
}
type PostResult = { ok?: boolean; needsConfirm?: boolean; inflight?: number; requeued?: number; view: View };

const when = (iso: string) => (iso ? new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "chưa dùng");

export default function MuseAccountsCard({ onChanged }: { onChanged?: () => void }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => api<View>("/api/muse/accounts").then(setView, (e) => setError((e as Error).message)), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(json: Record<string, unknown>, label: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let r = await api<PostResult>("/api/muse/accounts", { method: "POST", json });
      if (r.needsConfirm) {
        const ok = confirm(
          `Đang có ${r.inflight} cảnh Muse đang làm bằng tài khoản “${view?.active.name}”.\n\n` +
            `Đổi ngay thì ${r.inflight} cảnh này sẽ được GỬI LẠI bằng ${label} (tốn lượt của tài khoản đó), vì tài khoản mới không đọc được kết quả của tài khoản cũ.\n\n` +
            "Nếu tài khoản cũ vẫn dùng được, nên bấm Huỷ và đợi các cảnh đó xong rồi mới đổi.\n\nĐổi ngay?",
        );
        if (!ok) return;
        r = await api<PostResult>("/api/muse/accounts", { method: "POST", json: { ...json, force: true } });
      }
      setView(r.view);
      if (json.action === "add") setNotice(`Đã chuyển sang “${r.view.active.name}”. Cửa sổ Chrome của Muse đang mở — đăng nhập tài khoản mới trong đó.`);
      else if (json.action === "switch") setNotice(`Đã chuyển sang “${r.view.active.name}”${r.requeued ? ` · ${r.requeued} cảnh sẽ được gửi lại bằng tài khoản này` : ""}.`);
      else if (json.action === "delete") setNotice("Đã xoá tài khoản khỏi app — hồ sơ Chrome của nó nằm trong Thùng rác.");
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <Card title="Tài khoản Muse" className="lg:col-span-2">
        {error ? <ErrorBox error={error} /> : <Spinner />}
      </Card>
    );
  }
  return (
    <Card title="Tài khoản Muse" className="lg:col-span-2">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted">
          Mỗi tài khoản Meta có một hồ sơ Chrome riêng (giữ phiên đăng nhập); app chỉ dùng <b>một</b> tài khoản mỗi lúc. Đổi tài khoản khi tài khoản đang
          dùng bị lỗi / bị khoá: app dừng gửi, đóng Chrome của Muse, cất hồ sơ cũ (không xoá), mở hồ sơ được chọn rồi chạy tiếp. Đừng dùng để luân phiên
          lách hạn mức tuần — Meta có thể khoá cả các tài khoản.
        </p>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-mint-dark/60 bg-mint/20 p-3">
          <span>
            Đang dùng: <b>{view.active.name}</b>
          </span>
          {renaming?.id === view.active.id ? (
            <RenameBox value={renaming.name} busy={busy} onChange={(name) => setRenaming({ id: view.active.id, name })} onCancel={() => setRenaming(null)} onSave={() => void post({ action: "rename", id: renaming.id, name: renaming.name }, "").then(() => setRenaming(null))} />
          ) : (
            <button className="btn-ghost btn-sm" disabled={busy} onClick={() => setRenaming({ id: view.active.id, name: view.active.name })}>
              Đổi tên
            </button>
          )}
          {view.inflight > 0 && <span className="text-xs text-amber-800">· {view.inflight} cảnh đang làm</span>}
        </div>

        <div className="rounded-lg border border-ink/15 p-3">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={view.autoFailover} disabled={busy} onChange={(e) => void post({ action: "failover", enabled: e.target.checked }, "")} />
            <span>
              <b>Tự đổi sang tài khoản dự phòng khi tài khoản đang dùng bị lỗi</b> (lúc bạn không ở máy)
              <span className="block text-xs text-muted">
                Lỗi = bị đăng xuất quá 10 phút mà kiểm tra lại vẫn chưa đăng nhập (thường do bị khoá), hoặc Muse từ chối nhận lệnh 3 lần liên tiếp. Chỉ HẾT LƯỢT tuần
                thì <b>không</b> đổi — app chờ như thường. Tài khoản lỗi được đánh dấu, app không tự đổi về; hai lần tự đổi cách nhau ít nhất 30 phút; cảnh bị
                từ chối / đang làm được gửi lại bằng tài khoản mới. Chrome của Muse bị tắt bất thường thì sau 5 phút app tự mở lại. Tick “Dự phòng” ở các tài
                khoản đã đăng nhập sẵn bên dưới.
              </span>
            </span>
          </label>
          {view.autoFailover && !view.others.some((a) => a.backup && !a.broken) && (
            <p className="mt-2 text-xs text-cherry-dark">Chưa có tài khoản dự phòng nào dùng được — thêm tài khoản (đăng nhập sẵn) rồi tick “Dự phòng”.</p>
          )}
        </div>

        {view.others.length > 0 && (
          <div>
            <p className="mb-1 font-semibold">Tài khoản đã lưu</p>
            <ul className="space-y-1">
              {view.others.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 border-t border-ink/10 py-1.5 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    {renaming?.id === a.id ? (
                      <RenameBox value={renaming.name} busy={busy} onChange={(name) => setRenaming({ id: a.id, name })} onCancel={() => setRenaming(null)} onSave={() => void post({ action: "rename", id: renaming.id, name: renaming.name }, "").then(() => setRenaming(null))} />
                    ) : (
                      <b>{a.name}</b>
                    )}
                    <div className="text-xs text-muted">
                      Dùng lần cuối: {when(a.last_used_at)}
                      {a.last_state ? ` · ${a.last_state}` : ""}
                    </div>
                    {a.broken && (
                      <div className="text-xs text-cherry-dark">
                        ⚠ App đã tự đổi khỏi tài khoản này lúc {when(a.broken.at)}: {a.broken.reason} (không tự dùng lại; bấm “Dùng tài khoản này” nếu đã sửa xong)
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-1 text-xs" title="App được tự đổi sang tài khoản này khi tài khoản đang dùng bị lỗi">
                    <input type="checkbox" checked={Boolean(a.backup)} disabled={busy} onChange={(e) => void post({ action: "backup", id: a.id, on: e.target.checked }, "")} />
                    Dự phòng
                  </label>
                  {renaming?.id !== a.id && (
                    <button className="btn-ghost btn-sm" disabled={busy} onClick={() => setRenaming({ id: a.id, name: a.name })}>
                      Đổi tên
                    </button>
                  )}
                  <button className="btn-primary btn-sm" disabled={busy} onClick={() => void post({ action: "switch", to: a.id }, `“${a.name}”`)}>
                    {busy && <Spinner />} Dùng tài khoản này
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    disabled={busy}
                    title="Bỏ tài khoản này khỏi danh sách; hồ sơ Chrome (phiên đăng nhập) của nó được chuyển vào Thùng rác"
                    onClick={() => {
                      if (!confirm(`Xoá tài khoản “${a.name}” khỏi app?

Hồ sơ Chrome của nó (phiên đăng nhập Muse) được chuyển vào THÙNG RÁC — lấy lại được từ Thùng rác nếu cần. Tài khoản Meta của bạn không bị ảnh hưởng.`)) return;
                      void post({ action: "delete", id: a.id }, "");
                    }}
                  >
                    🗑 Xoá
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-56" placeholder="Tên tài khoản mới (vd. TK phụ)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button
            className="btn-ghost btn-sm"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Thêm tài khoản mới “${newName.trim() || "Tài khoản mới"}” và chuyển sang dùng nó?\n\nTài khoản đang dùng (“${view.active.name}”) được cất lại, đổi về được bất cứ lúc nào.`)) return;
              void post({ action: "add", name: newName }, "tài khoản mới").then(() => setNewName(""));
            }}
          >
            ＋ Thêm tài khoản mới
          </button>
        </div>
        {view.events.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold">Nhật ký tự đổi / tự mở lại ({view.events.length})</summary>
            <ul className="mt-1 space-y-1">
              {view.events.map((ev, i) => (
                <li key={i} className={ev.kind === "reopen" ? "text-muted" : "text-cherry-dark"}>
                  {when(ev.at)} ·{" "}
                  {ev.kind === "switch" ? `Đã tự đổi “${ev.from}” → “${ev.to}”` : ev.kind === "none-left" ? `“${ev.from}” bị lỗi, hết tài khoản dự phòng` : "Tự mở lại Chrome của Muse"}: {ev.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        {notice && <p className="text-xs font-semibold text-mint-dark">{notice}</p>}
        <ErrorBox error={error} />
      </div>
    </Card>
  );
}

function RenameBox({ value, busy, onChange, onSave, onCancel }: { value: string; busy: boolean; onChange: (v: string) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input className="input w-48 px-2 py-0.5" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSave()} autoFocus />
      <button className="btn-ghost btn-sm" disabled={busy || !value.trim()} onClick={onSave}>
        Lưu
      </button>
      <button className="btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
        Huỷ
      </button>
    </span>
  );
}
