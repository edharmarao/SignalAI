import "./globals.css";
import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import AuthGuard from "@/components/AuthGuard";
import { ToastProvider } from "@/lib/toast";

export const metadata: Metadata = {
  title: "Signal AI — Options Strategy Builder",
  description: "Build, backtest and paper-trade options strategies on Indian indexes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <ToastProvider>
          <AuthGuard>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 flex flex-col">
                <TopBar />
                <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">{children}</main>
              </div>
            </div>
          </AuthGuard>
        </ToastProvider>
      </body>
    </html>
  );
}
