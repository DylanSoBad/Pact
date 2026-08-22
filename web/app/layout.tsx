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
  weight: ["400", "500", "700"],
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
    default: "PACT Protocol — Economic Contracts on ARC",
    template: "PACT · %s",
  },
  description: "Create, manage, and track economic contracts with collateral on ARC Testnet. Not a DEX — real agreements.",
  keywords: ["PACT Protocol", "Arc Testnet", "Smart Contracts", "Collateral", "Economic Contracts", "Web3", "Blockchain"],
  authors: [{ name: "PACT Team" }],
  openGraph: {
    title: "PACT Protocol — Economic Contracts on ARC",
    description: "Create, manage, and track economic contracts with collateral on ARC Testnet. Not a DEX — real agreements.",
    url: "https://pact-protocol-five.vercel.app",
    siteName: "PACT Protocol",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PACT Protocol — The Tape",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PACT Protocol — Economic Contracts on ARC",
    description: "Create, manage, and track economic contracts with collateral on ARC Testnet. Not a DEX — real agreements.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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
      <body className={`${plexMono.variable} ${plexSans.variable} bg-surface-black text-on-background selection:bg-primary-fixed selection:text-on-primary-fixed min-h-screen flex flex-col antialiased`}>
        <A11yAuditor />
        <Web3Provider>
          <AppShell>
            <Navbar />
            <main className="mx-auto w-full max-w-terminal flex-1 px-4 py-6 @md:px-6 @md:py-10 pb-24 @md:pb-12">
              {children}
            </main>
            <BottomNav />
            <footer className="px-4 pb-20 @md:pb-6 text-center text-[11px] text-text-muted font-code-hash">
              <a className="hover:text-primary-fixed" href="https://github.com/DylanSoBad/Pact" target="_blank" rel="noreferrer" title="Read PACT documentation and source code">Docs</a><span aria-hidden="true"> · </span><a className="hover:text-primary-fixed" href="https://github.com/DylanSoBad/Pact" target="_blank" rel="noreferrer" title="View PACT source code on GitHub">Source Code</a><span aria-hidden="true"> · </span><span title="Independent audit report is coming soon">Audit Report (Coming Soon)</span>
            </footer>
            
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
              }} position="bottom-center" duration={5000}
            />
          </AppShell>
        </Web3Provider>
      </body>
    </html>
  );
}
