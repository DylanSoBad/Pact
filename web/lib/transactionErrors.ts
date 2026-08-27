export function transactionErrorMessage(error: unknown): string {
  const raw = typeof error === 'object' && error && 'shortMessage' in error
    ? String(error.shortMessage)
    : error instanceof Error ? error.message : String(error)
  const message = raw.toLowerCase()

  if (message.includes('user rejected') || message.includes('user denied')) {
    return 'Signature cancelled in your wallet. No on-chain change was made.'
  }
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'The wallet does not have enough gas or collateral for this action.'
  }
  if (message.includes('wrong chain') || message.includes('chain mismatch') || message.includes('unsupported chain')) {
    return 'Switch your wallet network to Arc Testnet (Chain ID: 5042002) and try again.'
  }
  if (message.includes('terms hash mismatch') || message.includes('termshash')) {
    return 'The written plaintext terms do not match the agreement committed on-chain.'
  }
  if (message.includes('intakeispaused') || message.includes('intake is paused')) {
    return 'New funding is temporarily paused by protocol safety controls.'
  }
  if (message.includes('protocolispaused') || message.includes('protocol is paused')) {
    return 'This action is temporarily paused by protocol safety controls. Exit and withdrawal paths remain available.'
  }
  if (message.includes('fee exceeds cap') || message.includes('feetoohigh')) {
    return 'The claimed arbiter fee exceeds the maximum cap committed in this pact.'
  }
  if (message.includes('no credit') || message.includes('nocredit')) {
    return 'There is no claimable credit balance for this token.'
  }
  if (message.includes('too early') || message.includes('tooearly')) {
    return 'This action is not available yet. The deadline has not passed.'
  }
  if (message.includes('too late') || message.includes('toolate')) {
    return 'The deadline for this action has passed.'
  }
  if (message.includes('invalid status') || message.includes('invalidstatus')) {
    return 'The pact state changed before this transaction was submitted. Refresh and try again.'
  }
  if (message.includes('execution reverted')) {
    return 'The contract rejected this action. Refresh the pact state and verify the requirements.'
  }
  if (message.includes('network error') || message.includes('failed to fetch')) {
    return 'Network connection issue. Check your connection to Arc Testnet RPC and retry.'
  }
  return raw.length > 240 ? `${raw.slice(0, 237)}…` : raw
}
