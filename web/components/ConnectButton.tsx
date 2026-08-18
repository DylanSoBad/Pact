'use client'

import { ConnectKitButton } from 'connectkit';

export default function ConnectButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, truncatedAddress, ensName }) => {
        return (
          <button 
            onClick={show} 
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-mono font-medium rounded-md border transition-all cursor-pointer ${
              isConnected 
                ? 'bg-[#141518] text-[#f4f4f6] border-[#27282e] hover:border-[#383a42] hover:bg-[#1a1b20]' 
                : 'bg-[#18191d] text-[#f4f4f6] border-[#2e3037] hover:border-[#42454e] hover:bg-[#202227] shadow-sm'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
            <span>{isConnected ? (ensName ?? truncatedAddress) : "Connect Wallet"}</span>
          </button>
        );
      }}
    </ConnectKitButton.Custom>
  );
}
