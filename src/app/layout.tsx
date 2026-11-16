import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const text = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  variable: "--font-text",
});

const label = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  variable: "--font-label",
});

export const metadata: Metadata = {
  title: { default: "Усадебки", template: "%s — Усадебки" },
  description: "Каталог русских усадеб: реестр, история, состояние и источники.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${text.variable} ${label.variable}`}>
      <body>{children}</body>
    </html>
  );
}
