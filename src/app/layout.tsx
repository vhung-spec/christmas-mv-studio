import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Christmas MV Studio",
  description: "Làm video nhạc Giáng sinh cổ điển thập niên 1950 dài ~1 tiếng: kịch bản, clip Muse, ghép danh sách nhạc",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Oswald:wght@500;600&family=Pacifico&display=swap&subset=vietnamese"
        />
      </head>
      <body>
        <Nav />
        <main className="mx-auto max-w-7xl px-4 pb-16 pt-6">{children}</main>
      </body>
    </html>
  );
}
