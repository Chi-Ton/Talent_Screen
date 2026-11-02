import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/language-provider";

export const metadata: Metadata = {
  title: "TalentScreen AI - Đánh giá & Sàng lọc CV",
  description: "Hệ thống sàng lọc và đánh giá CV ứng viên IT bằng AI"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
