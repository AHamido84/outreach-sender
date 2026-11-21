import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ar } from "@/content/ar";
import { RtlProvider } from "@/components/app/direction";
import "./globals.css";

const font = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

export const metadata: Metadata = { title: ar.app.name, description: ar.app.tagline };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={font.variable}>
      <body className="min-h-dvh antialiased">
        <RtlProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </RtlProvider>
        <Toaster position="top-center" dir="rtl" richColors />
      </body>
    </html>
  );
}
