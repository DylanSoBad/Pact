import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Web3Provider from "../components/Web3Provider";
import { Toaster } from "sonner";
import Navbar from "../components/Navbar";
import BottomNav from "../components/BottomNav";
import AppShell from "../components/AppShell";
import A11yAuditor from "../components/A11yAuditor";

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
            <Navbar />
            <div className="flex-1 flex flex-col w-full">
              <main className="mx-auto w-full max-w-terminal flex-1 px-3 py-5 sm:px-6 sm:py-8 pb-16 sm:pb-12">
                {children}
              </main>
              <footer className="border-t border-outline-hairline bg-[#050608] px-4 py-6 text-center text-[11px] text-text-dim font-code-hash">
                <div className="mx-auto max-w-terminal flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-primary-fixed" />
                    <span>ARC TESTNET 5042002</span>
                    <span aria-hidden="true">·</span>
                    <span>PACT PROTOCOL V1</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <a className="hover:text-primary-fixed transition-colors" href="https://github.com/DylanSoBad/Pact" target="_blank" rel="noreferrer" title="Read PACT documentation">Docs</a>
                    <span aria-hidden="true">·</span>
                    <a className="hover:text-primary-fixed transition-colors" href="https://github.com/DylanSoBad/Pact" target="_blank" rel="noreferrer" title="View PACT source code on GitHub">GitHub</a>
                    <span aria-hidden="true">·</span>
                    <span className="text-text-dim" title="Formal verification in progress">Formal Verification (V1)</span>
                  </div>
                </div>
              </footer>
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
