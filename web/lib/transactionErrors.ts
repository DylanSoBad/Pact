export function transactionErrorMessage(error: unknown): string {
  const raw = typeof error === 'object' && error && 'shortMessage' in error
    ? String(error.shortMessage)
    : error instanceof Error ? error.message : String(error)
  const message = raw.toLowerCase()

  if (message.includes('user rejected') || message.includes('user denied')) return 'Signature cancelled in the wallet. No on-chain change was made.'
  if (message.includes('insufficient funds')) return 'The wallet does not have enough gas or collateral for this action.'
  if (message.includes('wrong chain') || message.includes('chain mismatch')) return 'Switch the wallet to Arc Testnet and try again.'
  if (message.includes('terms hash mismatch')) return 'The written terms do not match the agreement committed on-chain.'
  if (message.includes('intakeispaused') || message.includes('intake is paused')) return 'New funding is temporarily paused by protocol safety controls.'
  if (message.includes('protocolispaused') || message.includes('protocol is paused')) return 'This action is temporarily paused. Exit and withdrawal paths remain available.'
  if (message.includes('fee exceeds cap')) return 'The arbiter fee is above the maximum committed in this pact.'
  if (message.includes('no credit')) return 'There is no claimable credit for this token.'
  if (message.includes('too early')) return 'This timeout action is not available yet.'
  if (message.includes('too late')) return 'The deadline for this action has passed.'
  if (message.includes('invalid status') || message.includes('invalidstatus')) return 'The pact state changed before this transaction was submitted. Refresh and try again.'
  if (message.includes('execution reverted')) return 'The contract rejected this action. Refresh the pact state and verify the requirements.'
  return raw.length > 240 ? `${raw.slice(0, 237)}…` : raw
}
