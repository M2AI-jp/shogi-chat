import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "将棋チャット - AI対局",
  description: "チャットベースで将棋AIと対局",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-gray-900 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
