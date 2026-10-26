"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isRemote } from "@/lib/client";
import { MODE_LABEL, useStatus } from "@/lib/useStatus";

const LINKS = [
  { href: "/", label: "Nhập ý tưởng" },
  { href: "/batch", label: "Chạy batch" },
  { href: "/manual", label: "claude.ai" },
  { href: "/history", label: "Lịch sử" },
  { href: "/channels", label: "Kênh" },
  { href: "/pipeline", label: "Dây chuyền" },
  { href: "/muse", label: "Clip Muse" },
  { href: "/render-queue", label: "Hàng chờ dựng" },
  { href: "/library", label: "Thư viện" },
  { href: "/settings", label: "Cài đặt" },
];

const MODE_STYLE = {
  claude: "border-mint/60 bg-mint/15 text-mint",
  manual: "border-sky-300/70 bg-sky-300/15 text-sky-200",
  mock: "border-amber-300/70 bg-amber-300/15 text-amber-200",
};

export default function Nav() {
  const pathname = usePathname();
  const { status } = useStatus([pathname]);
  // Điện thoại: menu gập lại, bấm ☰ để mở; đổi trang thì gập lại.
  const [open, setOpen] = useState(false);
  // Mở qua cổng điều khiển từ xa (biết được sau khi trang chạy trên trình duyệt).
  const [remote, setRemote] = useState(false);
  useEffect(() => setRemote(Boolean(status?.remote) || isRemote()), [status]);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="border-b-4 border-cherry bg-ink text-cream">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl text-mint">Christmas MV Studio</span>
          <span className="hidden text-xs uppercase tracking-[0.2em] text-cream/70 sm:inline">🎄 Vintage Christmas · 1950s</span>
        </Link>
        <button
          className="ml-auto rounded-full border border-cream/40 px-3 py-1 text-sm font-semibold md:hidden"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label="Menu"
        >
          {open ? "✕ Đóng" : "☰ Menu"}
          {!open && (status?.pipelineOpen ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-amber-300 px-1.5 text-xs text-ink">{status?.pipelineOpen}</span>}
        </button>
        <nav className={`${open ? "flex" : "hidden"} w-full flex-col gap-1 md:flex md:w-auto md:flex-row md:flex-wrap`}>
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            const count =
              l.href === "/manual"
                ? (status?.pendingDrafts ?? 0)
                : l.href === "/render-queue"
                  ? (status?.renderQueue ?? 0)
                  : l.href === "/muse"
                    ? (status?.museOpen ?? 0)
                    : l.href === "/pipeline"
                      ? (status?.pipelineOpen ?? 0)
                      : 0;
            if (l.href === "/manual" && status && status.mode !== "manual" && !count) return null;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition md:py-1 ${active ? "bg-cherry text-white" : "text-cream/90 hover:bg-white/10"}`}
              >
                {l.label}
                {count > 0 && <span className="ml-1.5 rounded-full bg-amber-300 px-1.5 text-xs text-ink">{count}</span>}
              </Link>
            );
          })}
        </nav>
        <div className={`${open ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 text-xs md:ml-auto md:flex md:w-auto`}>
          {remote && (
            <span className="badge border-sky-300/70 bg-sky-300/15 text-sky-200" title="Đang mở app qua cổng điều khiển từ xa (Tailscale)">
              🌐 Từ xa
              <form method="post" action="/_remote/logout" className="inline">
                <button type="submit" className="ml-2 underline">
                  Đăng xuất
                </button>
              </form>
            </span>
          )}
          {status && (
            <Link href="/settings" className={`badge ${MODE_STYLE[status.mode]}`} title="Đổi chế độ trong Cài đặt">
              {MODE_LABEL[status.mode]}
              {status.mode === "claude" && <> · {status.model}</>} → {status.videoModelName}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
