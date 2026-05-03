import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";

export const metadata: Metadata = {
  title: "Контроль качества поддержки",
  description: "Проверка качества диалогов поддержки"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <a href="#main-content" className="skip-link">
          Перейти к содержимому
        </a>
        <div className="page">
          <AppSidebar />
          <main id="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
