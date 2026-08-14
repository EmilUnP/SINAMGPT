import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { localeBootScript } from "@/lib/locale";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SINAMGPT — Company Local Chat",
  description: "Simple local GPT chat with login and saved history",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full" suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `${themeBootScript}${localeBootScript}`,
          }}
        />
        <ThemeProvider>
          <LocaleProvider>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
