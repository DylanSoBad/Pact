'use client'

import { ConnectKitButton } from 'connectkit';

export default function ConnectButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, truncatedAddress, ensName }) => (
        <button
          onClick={show}
          className={`btn-ghost px-4 py-[7px] text-[13px] font-medium transition-all ${
            isConnected
              ? 'text-zinc-200 border-zinc-700/60 bg-white/[0.04]'
              : 'text-zinc-400 border-zinc-800 hover:text-zinc-100'
          }`}
        >
          {isConnected ? (ensName ?? truncatedAddress) : "Connect"}
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}
