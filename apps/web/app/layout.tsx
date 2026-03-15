import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className={cn("dark font-sans antialiased", geist.variable)} suppressHydrationWarning>
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
