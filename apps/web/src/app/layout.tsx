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
        <div className="page">
          <AppSidebar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
