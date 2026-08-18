'use client'

import { ConnectKitButton } from 'connectkit';

export default function ConnectButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, truncatedAddress, ensName }) => (
        <button
          onClick={show}
          className={`px-4 py-[7px] text-[13px] font-medium rounded-lg border transition-all cursor-pointer ${
            isConnected
              ? 'bg-transparent text-zinc-300 border-zinc-800 hover:border-zinc-600'
              : 'bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200'
          }`}
        >
          {isConnected ? (ensName ?? truncatedAddress) : "Connect"}
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}
