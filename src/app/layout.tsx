import type { Metadata, Viewport } from "next";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { ThemeProvider } from "@/components/ThemeProvider";
import { localeBootScript } from "@/lib/locale";
import { themeBootScript } from "@/lib/theme";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SINAMGPT — Company Local Chat",
  description: "Simple local GPT chat with login and saved history",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full" suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `${themeBootScript}${localeBootScript}`,
          }}
        />
        <ThemeProvider>
          <LocaleProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
