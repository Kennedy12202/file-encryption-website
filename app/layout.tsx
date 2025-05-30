import HeaderAuth from "@/components/header-auth";

import Link from "next/link";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "CacheIt",
  description: "The cheapest way to store your files: CacheIt",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className="bg-backgground text-foreground">

      
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
            </div>
          </main>
      </body>
    </html>
  );
}
