import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppNav } from "@/components/app-nav";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";
import { resolveUiAppearance } from "@/lib/ui-theme";
import { appearanceRootProps } from "@/lib/ui-theme-root";
import { cn } from "@/lib/utils";

const sans = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-sans"
});

const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "Stemma",
  description: "Контроль качества поддержки и подключение источников"
};

export const viewport: Viewport = {
  colorScheme: "light dark"
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const appearance = await getLayoutAppearance();
  const rootAppearance = appearanceRootProps(appearance);

  return (
    <html
      lang="ru"
      className={cn(sans.variable, mono.variable, rootAppearance.className)}
      data-scroll-behavior="smooth"
      data-theme={rootAppearance["data-theme"]}
      data-density={rootAppearance["data-density"]}
      data-corners={rootAppearance["data-corners"]}
      data-contrast={rootAppearance["data-contrast"]}
      style={rootAppearance.style}
    >
      <body
        className="min-h-svh bg-background font-sans text-foreground antialiased"
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background"
        >
          Перейти к содержимому
        </a>
        <TooltipProvider>
          <ToastProvider>
            <div className="flex min-h-svh flex-col">
              <AppNav />
              <main id="main-content" className="flex-1">
                {children}
              </main>
            </div>
          </ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
