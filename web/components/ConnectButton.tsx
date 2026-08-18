'use client'

import { ConnectKitButton } from 'connectkit';

export default function ConnectButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, truncatedAddress, ensName }) => {
        return (
          <button 
            onClick={show} 
            className="border border-[#c8f542] text-[#c8f542] px-3 py-1 text-sm font-mono hover:bg-[#c8f542] hover:text-black transition-colors uppercase cursor-pointer"
          >
            {isConnected ? ensName ?? truncatedAddress : "Connect Wallet"}
          </button>
        );
      }}
    </ConnectKitButton.Custom>
  );
}
