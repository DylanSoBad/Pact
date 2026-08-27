import type { PactData } from './reads'
import { formatAmount, formatDate, tokenSymbol, truncateAddress } from './format'

export type DisputeData = {
  opener: `0x${string}`
  claim: number // 1: Maker, 2: Taker
  makerBond: bigint
  takerBond: bigint
  openedAt: bigint
  responseDeadline: bigint
  arbiterDeadline: bigint
}

export type ActionType =
  | 'ACCEPT_OFFER'
  | 'CANCEL_OFFER'
  | 'EXPIRE_OFFER'
  | 'SUBMIT_PROOF'
  | 'RELEASE_COLLATERAL'
  | 'OPEN_DISPUTE'
  | 'RESPOND_DISPUTE'
  | 'DEFAULT_JUDGMENT'
  | 'RULE_DISPUTE_MAKER'
  | 'RULE_DISPUTE_TAKER'
  | 'ARBITER_TIMEOUT'
  | 'DEADLINE_REFUND_MAKER'
  | 'DEADLINE_SETTLE_TAKER'
  | 'DEADLINE_SETTLE_PUBLIC'
  | 'WITHDRAW_CREDITS'

export type ActionSeverity = 'primary' | 'warning' | 'danger' | 'neutral'

export type ActionRole = 'MAKER' | 'TAKER' | 'ARBITER' | 'PUBLIC'

export type PactAction = {
  type: ActionType
  label: string
  shortLabel: string
  functionName: string
  role: ActionRole
  severity: ActionSeverity
  isDangerous: boolean
  isEligible: boolean
  disabledReason?: string
  description: string
  financialSummary: {
    amount: bigint
    token: string
    bondAmount?: bigint
    recipient: string
    recipientRole: string
  }
  warningMessage?: string
}

export function evaluatePactActions(
  pact: PactData,
  dispute: DisputeData | null,
  userAddress: string | undefined,
  now: bigint,
  options?: {
    termsMatched?: boolean
    hasProofInput?: boolean
  }
): PactAction[] {
  const actions: PactAction[] = []
  const account = userAddress ? userAddress.toLowerCase() : null
  const isMaker = Boolean(account && pact.maker.toLowerCase() === account)
  const isTaker = Boolean(account && pact.taker.toLowerCase() === account)
  const isArbiter = Boolean(account && pact.arbiter.toLowerCase() === account)
  const isConnected = Boolean(account)

  const termsMatched = options?.termsMatched ?? false
  const hasProofInput = options?.hasProofInput ?? false

  // Helper for formatting token names
  const makerTokSym = tokenSymbol(pact.tokenMaker)
  const takerTokSym = tokenSymbol(pact.tokenTaker)

  // -------------------------------------------------------------------------
  // STATUS 0: OFFERED
  // -------------------------------------------------------------------------
  if (pact.status === 0) {
    const isOfferExpired = now > pact.offerExpiry

    if (!isOfferExpired) {
      // 0A: Taker - Accept Offer
      const takerEligible = isConnected && isTaker
      let disabledReason: string | undefined
      if (!isConnected) disabledReason = 'Connect wallet as counterparty to accept this offer.'
      else if (!isTaker) disabledReason = `Only designated counterparty (${truncateAddress(pact.taker)}) can accept this offer.`
      else if (!termsMatched) disabledReason = 'Paste matching plaintext agreement terms to verify cryptographic hash before accepting.'

      actions.push({
        type: 'ACCEPT_OFFER',
        label: 'Verify Terms & Accept Pact Offer',
        shortLabel: 'Accept Offer',
        functionName: pact.amountTaker > 0n ? 'acceptPactWithPermit / acceptPact' : 'acceptPact',
        role: 'TAKER',
        severity: 'primary',
        isDangerous: false,
        isEligible: Boolean(takerEligible && termsMatched),
        disabledReason,
        description: pact.amountTaker > 0n
          ? `Lock ${formatAmount(pact.amountTaker)} ${takerTokSym} collateral to activate this agreement on-chain.`
          : 'Accept written agreement terms and activate escrow on-chain.',
        financialSummary: {
          amount: pact.amountTaker,
          token: pact.tokenTaker,
          recipient: 'Pact Escrow Vault',
          recipientRole: 'Protocol Escrow',
        },
      })

      // 0B: Maker - Cancel Offer
      const makerEligible = isConnected && isMaker
      actions.push({
        type: 'CANCEL_OFFER',
        label: 'Cancel Unaccepted Offer',
        shortLabel: 'Cancel Offer',
        functionName: 'cancelPact',
        role: 'MAKER',
        severity: 'danger',
        isDangerous: true,
        isEligible: makerEligible,
        disabledReason: !isConnected
          ? 'Connect wallet as maker to cancel offer.'
          : !isMaker
          ? `Only the maker (${truncateAddress(pact.maker)}) can cancel an unaccepted offer.`
          : undefined,
        description: `Cancel offer and reclaim 100% of maker collateral (${formatAmount(pact.amountMaker)} ${makerTokSym}) to pull-payment credits.`,
        financialSummary: {
          amount: pact.amountMaker,
          token: pact.tokenMaker,
          recipient: pact.maker,
          recipientRole: 'Maker (Refund Credit)',
        },
        warningMessage: 'Cancelling this offer will permanently close the agreement. Your collateral will be credited for instant withdrawal.',
      })
    } else {
      // 0C: Offer Expired -> expireOffer (Permissionless)
      const primaryForMaker = isConnected && isMaker
      actions.push({
        type: 'EXPIRE_OFFER',
        label: primaryForMaker
          ? `Expire Offer & Claim Collateral Refund (${formatAmount(pact.amountMaker)} ${makerTokSym})`
          : 'Expire Offer (Permissionless Cleanup)',
        shortLabel: 'Expire & Refund',
        functionName: 'expireOffer',
        role: primaryForMaker ? 'MAKER' : 'PUBLIC',
        severity: primaryForMaker ? 'primary' : 'neutral',
        isDangerous: false,
        isEligible: isConnected,
        disabledReason: !isConnected ? 'Connect wallet to execute offer expiration.' : undefined,
        description: `Offer acceptance window closed on ${formatDate(pact.offerExpiry)}. Reclaims ${formatAmount(pact.amountMaker)} ${makerTokSym} maker collateral.`,
        financialSummary: {
          amount: pact.amountMaker,
          token: pact.tokenMaker,
          recipient: pact.maker,
          recipientRole: 'Maker (Refund Credit)',
        },
      })
    }
  }

  // -------------------------------------------------------------------------
  // STATUS 1: ACTIVE (Funded)
  // -------------------------------------------------------------------------
  if (pact.status === 1) {
    const isPerfWindowOpen = now <= pact.performanceDeadline
    const isDisputeWindowOpen = now <= pact.disputeDeadline

    if (isPerfWindowOpen) {
      // 1A: Taker - Submit Proof
      const takerEligible = isConnected && isTaker
      actions.push({
        type: 'SUBMIT_PROOF',
        label: 'Submit Deliverable / Fulfillment Proof',
        shortLabel: 'Submit Proof',
        functionName: 'submitProof',
        role: 'TAKER',
        severity: 'primary',
        isDangerous: false,
        isEligible: Boolean(takerEligible && hasProofInput),
        disabledReason: !isConnected
          ? 'Connect wallet as counterparty to submit proof.'
          : !isTaker
          ? `Only designated counterparty (${truncateAddress(pact.taker)}) can submit performance proof.`
          : !hasProofInput
          ? 'Enter deliverable link, CID, or tracking reference to generate proof hash.'
          : undefined,
        description: `Anchor cryptographic proof hash on-chain before ${formatDate(pact.performanceDeadline)}.`,
        financialSummary: {
          amount: 0n,
          token: pact.tokenMaker,
          recipient: 'Pact Smart Contract',
          recipientRole: 'On-Chain Proof Anchor',
        },
      })
    }

    if (isDisputeWindowOpen) {
      // 1B: Maker - Release Collateral
      const makerEligible = isConnected && isMaker
      actions.push({
        type: 'RELEASE_COLLATERAL',
        label: 'Release Collateral to Counterparty',
        shortLabel: 'Release Collateral',
        functionName: 'release',
        role: 'MAKER',
        severity: 'primary',
        isDangerous: true,
        isEligible: makerEligible,
        disabledReason: !isConnected
          ? 'Connect wallet as maker to release collateral.'
          : !isMaker
          ? `Only maker (${truncateAddress(pact.maker)}) can release collateral early.`
          : undefined,
        description: `Release ${formatAmount(pact.amountMaker)} ${makerTokSym} directly to counterparty (${truncateAddress(pact.taker)}) as credits.`,
        financialSummary: {
          amount: pact.amountMaker,
          token: pact.tokenMaker,
          recipient: pact.taker,
          recipientRole: 'Counterparty (Payout)',
        },
        warningMessage: 'Releasing collateral is final and irreversible. Funds will be credited directly to the counterparty.',
      })

      // 1C: Open Dispute (Maker or Taker before dispute cutoff)
      const disputeEligible = isConnected && (isMaker || isTaker)
      actions.push({
        type: 'OPEN_DISPUTE',
        label: `Open Bonded Dispute (${formatAmount(pact.bondAmount)} USDC Bond)`,
        shortLabel: 'Open Dispute',
        functionName: 'openDispute / openDisputeWithPermit',
        role: isMaker ? 'MAKER' : isTaker ? 'TAKER' : 'PUBLIC',
        severity: 'warning',
        isDangerous: true,
        isEligible: disputeEligible,
        disabledReason: !isConnected
          ? 'Connect wallet to open a dispute.'
          : !isMaker && !isTaker
          ? 'Only Maker or Counterparty can open a dispute.'
          : undefined,
        description: `Lock a 5% dispute bond (${formatAmount(pact.bondAmount)} USDC) to submit this agreement to designated arbiter (${truncateAddress(pact.arbiter)}).`,
        financialSummary: {
          amount: pact.bondAmount,
          token: 'USDC',
          bondAmount: pact.bondAmount,
          recipient: 'Protocol Dispute Vault',
          recipientRole: 'Bonded Escrow',
        },
        warningMessage: 'Opening a dispute locks a 5% bond. If the arbiter rules against you, arbiter fees may be deducted from your bond.',
      })
    } else {
      // 1D: Dispute Window Closed with NO proof submitted -> 100% refund to Maker
      const isMakerPrimary = isConnected && isMaker
      actions.push({
        type: 'DEADLINE_REFUND_MAKER',
        label: isMakerPrimary
          ? `Claim Full Collateral Refund (${formatAmount(pact.amountMaker)} ${makerTokSym})`
          : 'Settle Pact After Deadline (Refund to Maker)',
        shortLabel: 'Claim Refund',
        functionName: 'refundAfterDeadline',
        role: isMakerPrimary ? 'MAKER' : 'PUBLIC',
        severity: isMakerPrimary ? 'primary' : 'neutral',
        isDangerous: false,
        isEligible: isConnected,
        disabledReason: !isConnected ? 'Connect wallet to execute deadline settlement.' : undefined,
        description: `Dispute window elapsed on ${formatDate(pact.disputeDeadline)} without delivery proof. 100% of collateral reverts to Maker.`,
        financialSummary: {
          amount: pact.amountMaker,
          token: pact.tokenMaker,
          recipient: pact.maker,
          recipientRole: 'Maker (100% Refund)',
        },
      })
    }
  }

  // -------------------------------------------------------------------------
  // STATUS 2: PROOF SUBMITTED
  // -------------------------------------------------------------------------
  if (pact.status === 2) {
    const isDisputeWindowOpen = now <= pact.disputeDeadline

    if (isDisputeWindowOpen) {
      // 2A: Maker - Release Collateral
      const makerEligible = isConnected && isMaker
      actions.push({
        type: 'RELEASE_COLLATERAL',
        label: 'Review Proof & Release Collateral',
        shortLabel: 'Release Collateral',
        functionName: 'release',
        role: 'MAKER',
        severity: 'primary',
        isDangerous: true,
        isEligible: makerEligible,
        disabledReason: !isConnected
          ? 'Connect wallet as maker to release collateral.'
          : !isMaker
          ? `Only maker (${truncateAddress(pact.maker)}) can release collateral.`
          : undefined,
        description: `Confirm satisfaction with submitted proof and release ${formatAmount(pact.amountMaker)} ${makerTokSym} to counterparty.`,
        financialSummary: {
          amount: pact.amountMaker,
          token: pact.tokenMaker,
          recipient: pact.taker,
          recipientRole: 'Counterparty (Payout)',
        },
        warningMessage: 'Releasing collateral confirms performance satisfaction and cannot be undone.',
      })

      // 2B: Open Dispute (Maker contests proof, or Taker escalates)
      const disputeEligible = isConnected && (isMaker || isTaker)
      actions.push({
        type: 'OPEN_DISPUTE',
        label: `Open Bonded Dispute (${formatAmount(pact.bondAmount)} USDC Bond)`,
        shortLabel: 'Open Dispute',
        functionName: 'openDispute / openDisputeWithPermit',
        role: isMaker ? 'MAKER' : isTaker ? 'TAKER' : 'PUBLIC',
        severity: 'warning',
        isDangerous: true,
        isEligible: disputeEligible,
        disabledReason: !isConnected
          ? 'Connect wallet to open a dispute.'
          : !isMaker && !isTaker
          ? 'Only Maker or Counterparty can open a dispute.'
          : undefined,
        description: `Contest deliverable proof with a 5% USDC bond (${formatAmount(pact.bondAmount)} USDC). Designated arbiter will review.`,
        financialSummary: {
          amount: pact.bondAmount,
          token: 'USDC',
          bondAmount: pact.bondAmount,
          recipient: 'Protocol Dispute Vault',
          recipientRole: 'Bonded Escrow',
        },
        warningMessage: 'Contesting proof locks your dispute bond. Frivolous disputes risk fee deduction from your bond if ruled against.',
      })
    } else {
      // 2C: Dispute Window Closed with Proof UNCHALLENGED -> 100% payout to Taker
      const isTakerPrimary = isConnected && isTaker
      actions.push({
        type: 'DEADLINE_SETTLE_TAKER',
        label: isTakerPrimary
          ? `Claim Payout & Collateral (${formatAmount(pact.amountMaker)} ${makerTokSym})`
          : 'Finalize Settlement to Counterparty (Proof Uncontested)',
        shortLabel: 'Claim Payout',
        functionName: 'refundAfterDeadline',
        role: isTakerPrimary ? 'TAKER' : 'PUBLIC',
        severity: isTakerPrimary ? 'primary' : 'neutral',
        isDangerous: false,
        isEligible: isConnected,
        disabledReason: !isConnected ? 'Connect wallet to execute settlement.' : undefined,
        description: `Dispute cutoff elapsed on ${formatDate(pact.disputeDeadline)} with proof unchallenged. Collateral releases 100% to counterparty.`,
        financialSummary: {
          amount: pact.amountMaker,
          token: pact.tokenMaker,
          recipient: pact.taker,
          recipientRole: 'Counterparty (100% Payout)',
        },
      })
    }
  }

  // -------------------------------------------------------------------------
  // STATUS 3: DISPUTED
  // -------------------------------------------------------------------------
  if (pact.status === 3 && dispute) {
    const isOpener = Boolean(account && dispute.opener.toLowerCase() === account)
    const isRespondent = isConnected && !isOpener && (isMaker || isTaker)
    const isUnanswered = dispute.arbiterDeadline === 0n

    if (isUnanswered) {
      const isResponseWindowOpen = now <= dispute.responseDeadline

      if (isResponseWindowOpen) {
        // 3A: Respondent - Post Counter-Bond
        actions.push({
          type: 'RESPOND_DISPUTE',
          label: `Post Counter-Bond & Contest Dispute (${formatAmount(pact.bondAmount)} USDC)`,
          shortLabel: 'Post Counter-Bond',
          functionName: 'respondDispute / respondDisputeWithPermit',
          role: isMaker ? 'MAKER' : 'TAKER',
          severity: 'warning',
          isDangerous: true,
          isEligible: isRespondent,
          disabledReason: !isConnected
            ? 'Connect wallet as respondent to post counter-bond.'
            : !isRespondent
            ? isOpener
              ? `You already opened this dispute. Awaiting counterparty response before ${formatDate(dispute.responseDeadline)}.`
              : 'Only the dispute respondent can post the matching counter-bond.'
            : undefined,
          description: `Post matching 5% bond (${formatAmount(pact.bondAmount)} USDC) before ${formatDate(dispute.responseDeadline)} to proceed to arbiter ruling.`,
          financialSummary: {
            amount: pact.bondAmount,
            token: 'USDC',
            bondAmount: pact.bondAmount,
            recipient: 'Protocol Dispute Vault',
            recipientRole: 'Matching Counter-Bond',
          },
          warningMessage: 'Failure to post the counter-bond before deadline will result in an immediate default judgment against you.',
        })
      } else {
        // 3B: Respondent Missed Deadline -> Default Judgment
        actions.push({
          type: 'DEFAULT_JUDGMENT',
          label: isOpener
            ? 'Execute Default Judgment (Claim 100% Collateral & Bond Refund)'
            : 'Execute Default Judgment (Unanswered Dispute)',
          shortLabel: 'Default Judgment',
          functionName: 'resolveUnansweredDispute',
          role: isOpener ? (dispute.claim === 1 ? 'MAKER' : 'TAKER') : 'PUBLIC',
          severity: isOpener ? 'primary' : 'neutral',
          isDangerous: false,
          isEligible: isConnected,
          disabledReason: !isConnected ? 'Connect wallet to execute default judgment.' : undefined,
          description: `Respondent failed to post counter-bond before ${formatDate(dispute.responseDeadline)}. Dispute opener wins 100% bond refund and collateral.`,
          financialSummary: {
            amount: pact.amountMaker + pact.bondAmount,
            token: pact.tokenMaker,
            bondAmount: pact.bondAmount,
            recipient: dispute.opener,
            recipientRole: 'Dispute Opener (Default Winner)',
          },
        })
      }
    } else {
      // Both parties bonded: Arbiter window
      const isArbiterWindowOpen = now <= dispute.arbiterDeadline

      if (isArbiterWindowOpen) {
        // 3C: Arbiter - Rule for Maker
        actions.push({
          type: 'RULE_DISPUTE_MAKER',
          label: 'Rule for Maker (Full Refund of Collateral)',
          shortLabel: 'Rule for Maker',
          functionName: 'ruleDispute',
          role: 'ARBITER',
          severity: 'primary',
          isDangerous: true,
          isEligible: Boolean(isConnected && isArbiter),
          disabledReason: !isConnected
            ? 'Connect wallet as designated arbiter to issue ruling.'
            : !isArbiter
            ? `Only designated arbiter (${truncateAddress(pact.arbiter)}) can issue a ruling.`
            : undefined,
          description: `Arbiter ruling in favor of Maker. Maker receives collateral refund + bond; losing taker bond pays arbiter fee.`,
          financialSummary: {
            amount: pact.amountMaker,
            token: pact.tokenMaker,
            recipient: pact.maker,
            recipientRole: 'Maker (Ruling Winner)',
          },
          warningMessage: 'Arbiter ruling is final on-chain and triggers immediate settlement.',
        })

        // 3D: Arbiter - Rule for Taker
        actions.push({
          type: 'RULE_DISPUTE_TAKER',
          label: 'Rule for Counterparty (Release Collateral to Taker)',
          shortLabel: 'Rule for Counterparty',
          functionName: 'ruleDispute',
          role: 'ARBITER',
          severity: 'primary',
          isDangerous: true,
          isEligible: Boolean(isConnected && isArbiter),
          disabledReason: !isConnected
            ? 'Connect wallet as designated arbiter to issue ruling.'
            : !isArbiter
            ? `Only designated arbiter (${truncateAddress(pact.arbiter)}) can issue a ruling.`
            : undefined,
          description: `Arbiter ruling in favor of Counterparty. Taker receives payment + bond; losing maker bond pays arbiter fee.`,
          financialSummary: {
            amount: pact.amountMaker,
            token: pact.tokenMaker,
            recipient: pact.taker,
            recipientRole: 'Counterparty (Ruling Winner)',
          },
          warningMessage: 'Arbiter ruling is final on-chain and triggers immediate settlement.',
        })
      } else {
        // 3E: Arbiter Timed Out (14 Days) -> arbiterTimeout
        actions.push({
          type: 'ARBITER_TIMEOUT',
          label: 'Refund Bonds & Split Collateral 50/50 (Arbiter Timeout)',
          shortLabel: 'Arbiter Timeout',
          functionName: 'arbiterTimeout',
          role: isMaker || isTaker ? (isMaker ? 'MAKER' : 'TAKER') : 'PUBLIC',
          severity: isMaker || isTaker ? 'primary' : 'neutral',
          isDangerous: false,
          isEligible: isConnected,
          disabledReason: !isConnected ? 'Connect wallet to execute arbiter timeout.' : undefined,
          description: `Arbiter did not rule before ${formatDate(dispute.arbiterDeadline)}. Both 5% bonds are refunded 100% and collateral is split 50/50.`,
          financialSummary: {
            amount: pact.amountMaker / 2n,
            token: pact.tokenMaker,
            bondAmount: pact.bondAmount,
            recipient: 'Both Maker & Counterparty',
            recipientRole: '50/50 Split & Full Bond Return',
          },
        })
      }
    }
  }

  return actions
}

/**
 * Returns the highest priority active action for a connected user on a pact, or null if none.
 */
export function getPrimaryUserAction(
  pact: PactData,
  dispute: DisputeData | null,
  userAddress: string | undefined,
  now: bigint,
  options?: { termsMatched?: boolean; hasProofInput?: boolean }
): PactAction | null {
  if (!userAddress) return null
  const actions = evaluatePactActions(pact, dispute, userAddress, now, options)
  const userRole = userAddress.toLowerCase() === pact.maker.toLowerCase()
    ? 'MAKER'
    : userAddress.toLowerCase() === pact.taker.toLowerCase()
    ? 'TAKER'
    : userAddress.toLowerCase() === pact.arbiter.toLowerCase()
    ? 'ARBITER'
    : 'PUBLIC'

  // Match eligible actions directly assigned to the user's role first
  const userActions = actions.filter(a => a.role === userRole && a.isEligible)
  if (userActions.length > 0) return userActions[0]

  // Fallback to public permissionless actions if eligible
  const publicActions = actions.filter(a => a.role === 'PUBLIC' && a.isEligible)
  if (publicActions.length > 0) return publicActions[0]

  // If user has a role-specific action that is not eligible yet, return it to surface reason
  const pendingUserAction = actions.find(a => a.role === userRole)
  return pendingUserAction ?? null
}
