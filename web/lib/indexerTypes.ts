/**
 * PACT Indexer Shared Types
 *
 * Type definitions for the in-process indexer engine, API responses,
 * and health monitoring. Kept separate to avoid circular imports.
 */

import type { PactData } from './reads'

/** An indexed pact record with tracking metadata. */
export interface IndexedPact extends PactData {
  /** Block number when this record was last synced from chain. */
  lastIndexedBlock: number
  /** Unix ms timestamp when this record was last synced. */
  lastIndexedAt: number
}

/** An indexed on-chain event entry (for future event history feed). */
export interface IndexedEvent {
  /** Deterministic composite key: `${txHash}-${logIndex}` */
  id: string
  pactId: number
  eventType: string
  blockNumber: number
  txHash: string
  logIndex: number
  timestamp: number
  data: Record<string, string>
}

/** Real-time indexer health and performance stats. */
export interface IndexerStats {
  /** Monotonic counter of successful sync cycles. */
  totalSyncs: number
  /** Counter of failed sync cycles. */
  failedSyncs: number
  /** Counter of RPC errors across all operations. */
  rpcErrors: number
  /** Moving average sync cycle duration in ms. */
  avgSyncDurationMs: number
  /** Last successful sync timestamp (Unix ms). */
  lastSyncAt: number
  /** Last successful sync block number. */
  lastSyncBlock: number
  /** Total pacts currently indexed. */
  totalPacts: number
  /** Cold-start backfill completion flag. */
  initialized: boolean
  /** Time taken for initial backfill (ms). */
  backfillDurationMs: number
}

/** Shape of the /api/health response. */
export interface IndexerHealth {
  status: 'ok' | 'degraded' | 'down'
  lastBlock: number
  totalPacts: number
  syncLagMs: number
  stats: IndexerStats
}

/** Rate limiter entry per IP. */
export interface RateLimitEntry {
  tokens: number
  lastRefill: number
}
