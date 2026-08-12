import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { APP_NAME } from "@template/shared";
import { SwRegistration } from "@/components/pwa/SwRegistration";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", fallback: ["system-ui", "sans-serif"] });

const description =
  "Split group expenses, simplify balances, and settle debts without awkward math.";

const metadataBase = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description,
  applicationName: APP_NAME,
  category: "finance",
  keywords: [
    "expense splitter",
    "group expenses",
    "shared expenses",
    "split bills",
    "debt tracker",
    "settle up",
  ],
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_PH",
    url: "/",
    siteName: APP_NAME,
    title: "SettleUp — Split it fair. Settle it simple.",
    description,
    images: [
      {
        url: "/og/settleup-social.png",
        width: 1200,
        height: 630,
        alt: "SettleUp — Split it fair. Settle it simple.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SettleUp — Split it fair. Settle it simple.",
    description,
    images: ["/og/settleup-social.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en" className="h-full">
      <body className={`h-full overscroll-none ${inter.className}`}>
        {children}
        <Toaster richColors position="top-right" />
        <SwRegistration />
      </body>
    </html>
  );
}
