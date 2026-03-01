import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "SettleUp Lite",
    template: "%s | SettleUp Lite",
  },
  description: "Split expenses with friends. Track balances, simplify debts, and settle up easily.",
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
