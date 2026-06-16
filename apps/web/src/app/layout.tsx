import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", fallback: ["system-ui", "sans-serif"] });

export const metadata: Metadata = {
  title: {
    default: "SettleUp",
    template: "%s | SettleUp",
  },
  description: "Split expenses. Settle up. Track balances and simplify debts with your group.",
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="en" className="h-full">
      <body className={`h-full ${inter.className}`}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
