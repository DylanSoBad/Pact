import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Web3Provider from "../components/Web3Provider";

const plexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});



export const metadata: Metadata = {
  title: {
    default: "PACT · Feed",
    template: "PACT · %s",
  },
  description: "A promise with money locked behind it. economic contracts with collateral. not a dex.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${plexMono.variable} antialiased font-mono`}>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
