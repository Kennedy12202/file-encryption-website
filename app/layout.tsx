import HeaderAuth from "@/components/header-auth";
import { ThemeSwitcher } from "@/components/theme-switcher";

import { ThemeProvider } from "next-themes";
import Link from "next/link";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "ChacheIt",
  description: "The cheapest way to store your files: CacheIt",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <main className="min-h-screen flex flex-col items-center">
            <div className="w-full flex flex-col gap-80 items-center">
              <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 bg-background">
                <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm ">
                  <div className="flex gap-5 items-center font-semibold">
                    <Link href={"/"}>CacheIt</Link>
                    <div className="flex items-center gap-2">
                    </div>
                  </div>
                  {<HeaderAuth/>}
                </div>
              </nav>
              <div className="flex flex-col gap-8 max-w-5xl p-5">
                {children}
              </div>

              <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-4 py-4">
                <p>
                  <a>
                    Kennedy Cameron @2025
                  </a>
                </p>
                <ThemeSwitcher />
              </footer>
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
