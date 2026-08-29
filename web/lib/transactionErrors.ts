export function transactionErrorMessage(error: unknown): string {
  const raw = typeof error === 'object' && error && 'shortMessage' in error
    ? String(error.shortMessage)
    : error instanceof Error ? error.message : String(error)
  const message = raw.toLowerCase()

  if (message.includes('user rejected') || message.includes('user denied') || message.includes('rejected the request')) {
    return 'Signature cancelled in your wallet. No on-chain changes were made.'
  }
  if (message.includes('insufficient funds') || message.includes('exceeds balance') || message.includes('transfer amount exceeds balance')) {
    return 'Insufficient balance. Your wallet does not have enough tokens or ARC gas to complete this escrow action.'
  }
  if (message.includes('wrong chain') || message.includes('chain mismatch') || message.includes('unsupported chain') || message.includes('chain not configured')) {
    return 'Wrong network. Please switch your wallet network to Arc Testnet (Chain ID: 5042002) and retry.'
  }
  if (message.includes('allowance') || message.includes('insufficient allowance')) {
    return 'Insufficient token allowance. Please authorize the exact collateral amount in your wallet.'
  }
  if (message.includes('permit') && (message.includes('invalid') || message.includes('expired') || message.includes('signature'))) {
    return 'Permit authorization was rejected or expired. Please sign the standard ERC-20 authorization.'
  }
  if (message.includes('terms hash mismatch') || message.includes('termshash') || message.includes('hash mismatch')) {
    return 'Terms mismatch. The written agreement terms do not match the cryptographic commitment committed on-chain.'
  }
  if (message.includes('intakeispaused') || message.includes('intake is paused')) {
    return 'New pact creation is temporarily paused by protocol safety controls. Existing pacts remain operational.'
  }
  if (message.includes('protocolispaused') || message.includes('protocol is paused')) {
    return 'Protocol safety controls are active. Action is temporarily paused; exit and withdrawal paths remain fully available.'
  }
  if (message.includes('fee exceeds cap') || message.includes('feetoohigh') || message.includes('fee too high')) {
    return 'Arbiter fee exceeds committed cap. The claimed fee must be less than or equal to the maximum fee cap committed in the agreement.'
  }
  if (message.includes('invalid arbiter') || message.includes('invalidarbiter')) {
    return 'Invalid arbiter designation. Arbiter must be a valid third-party address and cannot be Maker, Counterparty, or Zero address.'
  }
  if (message.includes('no credit') || message.includes('nocredit')) {
    return 'No claimable credit balance available for withdrawal for this token.'
  }
  if (message.includes('too early') || message.includes('tooearly')) {
    return 'Action not available yet. The required waiting period or performance window has not elapsed.'
  }
  if (message.includes('too late') || message.includes('toolate') || message.includes('expired') || message.includes('deadline passed')) {
    return 'Deadline expired. The committed cutoff window for this action has already passed.'
  }
  if (message.includes('invalid status') || message.includes('invalidstatus')) {
    return 'Pact status updated. The on-chain state changed before this transaction was submitted. Please refresh and retry.'
  }
  if (message.includes('transaction replaced') || message.includes('replacement transaction underpriced')) {
    return 'Transaction replaced. A replacement transaction was submitted with updated gas parameters.'
  }
  if (message.includes('execution reverted')) {
    return 'The smart contract rejected this transaction. Please verify requirements, deadlines, and balances, then retry.'
  }
  if (message.includes('network error') || message.includes('failed to fetch') || message.includes('rpc error')) {
    return 'RPC network issue. Connection to Arc Testnet was interrupted. Please check your internet and retry.'
  }
  return raw.length > 240 ? `${raw.slice(0, 237)}…` : raw
}
