import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";

export const metadata: Metadata = {
  title: "Support QA",
  description: "Quality control for support conversations"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="page">
          <AppSidebar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
