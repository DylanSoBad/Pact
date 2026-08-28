import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Web3Provider from "../components/Web3Provider";
import { Toaster } from "sonner";
import Navbar from "../components/Navbar";
import BottomNav from "../components/BottomNav";
import AppShell from "../components/AppShell";
import A11yAuditor from "../components/A11yAuditor";
import SiteFooter from "../components/SiteFooter";

const plexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

export const viewport: Viewport = {
  themeColor: "#07080a",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://pact-protocol-five.vercel.app"),
  title: {
    default: "PACT Protocol — Institutional Escrow & OTC on ARC",
    template: "PACT · %s",
  },
  description: "Institutional escrow and economic agreement protocol with collateral on ARC Testnet. Not a DEX — real verifiable agreements.",
  keywords: ["PACT Protocol", "Arc Testnet", "Smart Contracts", "Collateral", "Economic Contracts", "Web3", "Blockchain", "OTC Escrow"],
  authors: [{ name: "PACT Team" }],
  openGraph: {
    title: "PACT Protocol — Institutional Escrow & OTC on ARC",
    description: "Institutional escrow and economic agreement protocol with collateral on ARC Testnet. Not a DEX — real verifiable agreements.",
    url: "https://pact-protocol-five.vercel.app",
    siteName: "PACT Protocol",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PACT Protocol — Institutional Escrow & OTC on ARC",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PACT Protocol — Institutional Escrow & OTC on ARC",
    description: "Institutional escrow and economic agreement protocol with collateral on ARC Testnet. Not a DEX — real verifiable agreements.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
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
      <body className={`${plexMono.variable} ${plexSans.variable} bg-background text-on-background selection:bg-primary-fixed selection:text-on-primary-fixed min-h-screen flex flex-col antialiased`}>
        <A11yAuditor />
        <Web3Provider>
          <AppShell>
            <a href="#main-content" className="sr-only z-50 bg-primary-fixed px-4 py-3 text-on-primary-fixed focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
              Skip to main content
            </a>
            <Navbar />
            <div className="flex-1 flex flex-col w-full">
              <main id="main-content" className="mx-auto w-full max-w-terminal flex-1 px-3 py-5 sm:px-6 sm:py-8 pb-16 sm:pb-12">
                {children}
              </main>
              <SiteFooter />
            </div>
            <BottomNav />
            
            <Toaster 
              theme="dark"
              toastOptions={{
                style: {
                  background: '#0c0f12',
                  border: '1px solid #2c3540',
                  color: '#e6e8eb',
                  fontFamily: 'var(--font-ibm-plex-mono)',
                  borderRadius: '2px',
                },
                className: 'font-mono text-[12px]'
              }}
              position="bottom-center"
              duration={4000}
            />
          </AppShell>
        </Web3Provider>
      </body>
    </html>
  );
}
