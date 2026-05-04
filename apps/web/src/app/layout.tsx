import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";
import { resolveUiAppearance } from "@/lib/ui-theme";

export const metadata: Metadata = {
  title: "Контроль качества поддержки",
  description: "Проверка качества диалогов поддержки"
};

async function getLayoutAppearance() {
  const user = await getCurrentUser().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  return resolveUiAppearance(user?.workspace ?? {});
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const appearance = await getLayoutAppearance();

  return (
    <html lang="ru">
      <body
        data-theme={appearance.uiTheme}
        data-density={appearance.uiDensity}
        data-corners={appearance.uiCorners}
        data-contrast={appearance.uiContrast}
      >
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
