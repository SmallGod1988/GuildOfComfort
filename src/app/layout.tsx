import type { Metadata } from "next";
import "./globals.css";
import AppStatus from "@/components/AppStatus";

export const metadata: Metadata = {
  title: "Гильдия Комфорта",
  description: "Учёт монтажных работ: автоматика, вентиляция, электрика, кондиционирование",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        {children}
        <AppStatus />
      </body>
    </html>
  );
}
