import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme";
import { NavProgress } from "@/components/nav-progress";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Velun",
  description: "Velun — sua vida financeira, mais clara.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // O script do tema mexe na classe do <html> antes do React chegar.
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <NavProgress />
        {children}
      </body>
    </html>
  );
}
