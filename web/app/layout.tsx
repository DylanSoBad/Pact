import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Web3Provider from "../components/Web3Provider";
import { Toaster } from "sonner";
import Navbar from "../components/Navbar";
import SideNav from "../components/SideNav";
import BottomNav from "../components/BottomNav";
import Link from "next/link";

const plexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "PACT Protocol - The Tape",
    template: "PACT · %s",
  },
  description: "A promise with money locked behind it. economic contracts with collateral. not a dex.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className={`${plexMono.variable} ${plexSans.variable} bg-surface-black text-on-background selection:bg-primary-fixed selection:text-on-primary-fixed min-h-screen flex flex-col antialiased`}>
        <Web3Provider>
          <Navbar />
          <SideNav />
          <main className="flex-1 w-full max-w-terminal mx-auto px-gutter py-xl lg:pl-64 lg:max-w-none pb-32">
            {children}
          </main>
          <BottomNav />
          
          {/* Floating Action Button (FAB) */}
          <Link href="/new" className="hidden lg:flex fixed bottom-xl right-xl z-40 items-center justify-center gap-2 px-6 py-3 border border-primary-fixed bg-primary-fixed text-on-primary-fixed font-headline-mono text-headline-mono uppercase rounded-DEFAULT shadow-[0_0_15px_rgba(198,243,64,0.3)] hover:shadow-[0_0_25px_rgba(198,243,64,0.5)] hover:bg-transparent hover:text-primary-fixed transition-all duration-200">
            <span className="material-symbols-outlined">add</span>
            NEW PACT
          </Link>

          <Toaster 
            theme="dark"
            toastOptions={{
              style: {
                background: '#07080a',
                border: '1px solid #c8f542',
                color: '#e4e4e7',
                fontFamily: 'var(--font-ibm-plex-mono)',
                borderRadius: '2px',
              },
              className: 'font-mono'
            }}
          />
        </Web3Provider>
      </body>
    </html>
  );
}
