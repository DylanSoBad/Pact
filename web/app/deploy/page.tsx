'use client'

import { useState } from 'react'
import Link from 'next/link'
import Navbar from '../../components/Navbar'
import TrustStrip from '../../components/TrustStrip'
import { useAccount, useWalletClient, usePublicClient, useChainId, useSwitchChain } from 'wagmi'
import { PACT_ABI } from '../../lib/abi'
import { USDC_ERC20, EURC } from '../../lib/arc'
import { PACT_BYTECODE } from '../../lib/bytecode'

const TARGET_CHAIN_ID = 5042002

export default function DeployPage() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null)
  const [customAddress, setCustomAddress] = useState('')
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  const handleDeploy = async () => {
    if (!walletClient || isWrongChain) return
    setLoading(true)
    setError(null)
    setTxHash(null)

    try {
      const hash = await walletClient.deployContract({
        abi: PACT_ABI,
        bytecode: PACT_BYTECODE,
        args: [USDC_ERC20 as `0x${string}`, EURC as `0x${string}`],
      })

      setTxHash(hash)

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt?.contractAddress) {
          setDeployedAddress(receipt.contractAddress)
          localStorage.setItem('pact_contract_address', receipt.contractAddress)
        }
      }
    } catch (err: any) {
      console.error(err)
      setError(err?.shortMessage || err?.message || 'Contract deployment failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCustom = () => {
    if (customAddress.startsWith('0x') && customAddress.length === 42) {
      localStorage.setItem('pact_contract_address', customAddress)
      setDeployedAddress(customAddress)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    } else {
      setError('Please enter a valid 42-character 0x EVM address')
    }
  }

  return (
    <main className="min-h-screen max-w-[620px] mx-auto px-5 @md:px-8 pb-24 overflow-x-hidden">
      <Navbar /><TrustStrip />

      <div className="mb-8 animate-enter">
        <Link href="/" className="text-[13px] text-zinc-600 hover:text-zinc-400 transition-colors">← Back</Link>
        <h1 className="text-[22px] font-semibold text-white tracking-[-0.01em] mt-2">
          Deploy / Configure Protocol Contract
        </h1>
        <p className="text-[14px] text-zinc-500 mt-1">
          Circle Arc Testnet (Chain ID 5042002)
        </p>
      </div>

      {isWrongChain && (
        <div className="rounded-lg bg-rose-500/[0.08] border border-rose-500/20 p-3.5 mb-6 text-[13px] flex items-center justify-between text-rose-300">
          <span>Wrong network (Connect to Arc Testnet)</span>
          <button onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            className="btn-primary bg-rose-500 text-black px-3.5 py-1 rounded-lg text-[12px]">
            Switch
          </button>
        </div>
      )}

      <div className="space-y-6 animate-enter-delay">
        {/* Option 1: 1-Click Deploy */}
        <div className="surface-1 rounded-xl p-5 border border-white/[0.06] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-white">1. Deploy New Pact Contract</h2>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Compiled Cancun Bytecode
            </span>
          </div>
          <p className="text-[13px] text-zinc-400">
            Deploys the complete <code className="text-white">PactContract.sol</code> directly to Arc Testnet using your connected OKX/MetaMask wallet.
          </p>

          <div className="text-[12px] font-mono text-zinc-500 space-y-1 bg-black/40 p-3 rounded-lg border border-white/[0.04]">
            <div>USDC Whitelist: {USDC_ERC20}</div>
            <div>EURC Whitelist: {EURC}</div>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-[12px]">
              {error}
            </div>
          )}

          {txHash && !deployedAddress && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-[12px] flex items-center gap-2">
              <div className="w-3.5 h-3.5 border border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <span>Transaction submitted: {txHash.slice(0, 16)}… Waiting for Arc block confirmation…</span>
            </div>
          )}

          {deployedAddress && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-[13px] space-y-2">
              <div className="font-semibold flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span> Contract Deployed & Activated!
              </div>
              <div className="font-mono text-[11px] break-all bg-black/40 p-2 rounded border border-emerald-500/20 text-zinc-200">
                {deployedAddress}
              </div>
              <div className="flex items-center justify-between pt-1">
                <a href={`https://testnet.arcscan.app/address/${deployedAddress}`} target="_blank" rel="noreferrer"
                  className="text-[12px] underline text-emerald-400 hover:text-emerald-300">
                  View on ArcScan ↗
                </a>
                <Link href="/new" className="btn-primary px-4 py-1.5 text-[12px]">
                  Create Pact Now →
                </Link>
              </div>
            </div>
          )}

          <button
            onClick={handleDeploy}
            disabled={!isConnected || loading || isWrongChain}
            className="btn-primary w-full py-3 text-[14px] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-[1.5px] border-black border-t-transparent rounded-full animate-spin" />
                <span>Confirming in wallet…</span>
              </>
            ) : (
              <span>Deploy Pact Contract</span>
            )}
          </button>
        </div>

        {/* Option 2: Paste Existing Contract Address */}
        <div className="surface-1 rounded-xl p-5 border border-white/[0.06] space-y-4">
          <h2 className="text-[15px] font-semibold text-white">2. Or Set Existing Contract Address</h2>
          <p className="text-[13px] text-zinc-400">
            If you already have a deployed Pact contract on Arc Testnet, paste the address below:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customAddress}
              onChange={e => setCustomAddress(e.target.value.trim())}
              placeholder="0x…"
              className="flex-1 bg-white/[0.03] border border-white/[0.06] text-white px-3.5 py-2.5 rounded-xl text-[13px] font-mono focus:border-emerald-500/50"
            />
            <button
              onClick={handleSaveCustom}
              className="btn-primary px-5 py-2.5 text-[13px]"
            >
              {savedSuccess ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>

        <div className="text-center pt-4">
          <Link href="/new" className="text-[13px] text-emerald-400 hover:text-emerald-300">
            Proceed to Create Pact →
          </Link>
        </div>
      </div>
    </main>
  )
}
