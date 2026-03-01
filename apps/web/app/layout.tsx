import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter as FontSans } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { OpenAPI } from "@/lib/api/client";
import { TailwindIndicator } from "@/components/tailwind-indicator";
import { OfflineIndicator } from "@/components/ui/offline-indicator";
import { AuthAwareLayout } from "@/components/layouts/auth-aware-layout";

export const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

if (process.env.NODE_ENV === "production") {
  OpenAPI.BASE = "https://next-fast-turbo.vercel.app";
}

console.log("Using OpenAPI.base", OpenAPI.BASE);

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  title: "Stair-Doc | Robot Delivery Control",
  description: "Real-time monitoring and control dashboard for stair-climbing delivery robots",
  applicationName: "Stair-Doc",
  manifest: "/manifest.json",
  icons: {
    icon: ["/favicon.png"],
    apple: ["/apple-touch-icon.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Stair-Doc",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(fontSans.variable, "bg-background font-sans")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <OfflineIndicator />
          <AuthAwareLayout>{children}</AuthAwareLayout>
          <TailwindIndicator />
        </ThemeProvider>
      </body>
    </html>
  );
}
