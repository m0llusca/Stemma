import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
// Order is load-bearing: Tailwind layers, then tokens/themes, then component styles.
import "./globals.css";
import "./styles/theme.css";
// components.css was split into ordered per-domain partials. Import order is
// load-bearing: it must match the original top-to-bottom source order.
import "./styles/components/00-base.css";
import "./styles/components/05-chip.css";
import "./styles/components/06-data.css";
import "./styles/components/07-shell.css";
import "./styles/components/10-app-shell.css";
import "./styles/components/20-integrations.css";
import "./styles/components/30-dashboard.css";
import "./styles/components/40-admin.css";
import "./styles/components/50-calibration-workflow.css";
import "./styles/components/60-queue.css";
import "./styles/components/70-queue-detail.css";
import "./styles/components/80-reviews.css";
import "./styles/components/85-coaching-pins.css";
import "./styles/components/90-appearance-theme.css";
import "./styles/components/92-reports.css";
import "./styles/components/94-enablement.css";
import "./styles/components/96-misc-forms.css";
import "./styles/components/98-primitives.css";
import { AppNav } from "@/components/app-nav";
import { ToastProvider } from "@/components/ui/toast";
import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";
import { resolveUiAppearance, uiPaletteOverridesToCssVariables } from "@/lib/ui-theme";

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

// Declares that the app manages its own light/dark theming. This emits
// <meta name="color-scheme" content="light dark">, which tells Chrome's
// "Auto Dark Mode for Web Contents" (force-dark) to leave the page alone
// instead of washing out text on the light theme.
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
  const brandStyle = {
    "--brand-primary": appearance.brandPrimaryColor,
    "--brand-accent": appearance.brandAccentColor,
    ...uiPaletteOverridesToCssVariables(appearance.uiPaletteOverrides)
  } as CSSProperties;

  return (
    <html lang="ru" className={`${sans.variable} ${mono.variable}`} data-scroll-behavior="smooth">
      <body
        style={brandStyle}
        data-theme={appearance.uiTheme}
        data-density={appearance.uiDensity}
        data-corners={appearance.uiCorners}
        data-contrast={appearance.uiContrast}
      >
        <a href="#main-content" className="skip-link">
          Перейти к содержимому
        </a>
        <ToastProvider>
          <div className="page">
            <AppNav />
            <main id="main-content">{children}</main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
