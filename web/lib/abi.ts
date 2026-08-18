export const PACT_ABI = [
  // --- Views ---
  {
    name: 'nextId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getPact',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'maker', type: 'address' },
          { name: 'amountMaker', type: 'uint64' },
          { name: 'kind', type: 'uint8' },
          { name: 'status', type: 'uint8' },
          { name: 'taker', type: 'address' },
          { name: 'amountTaker', type: 'uint64' },
          { name: 'blurSize', type: 'bool' },
          { name: 'tokenMaker', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'tokenTaker', type: 'address' },
          { name: 'updatedAt', type: 'uint64' },
          { name: 'termsHash', type: 'bytes32' },
          { name: 'proofHash', type: 'bytes32' },
        ],
      },
    ],
  },
  {
    name: 'deadlines',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    name: 'credits',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'who', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'clearedCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'slashedCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'clearedNotional',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'USDC',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'EURC',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },

  // --- Writes ---
  {
    name: 'createPact',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'kind', type: 'uint8' },
      { name: 'taker', type: 'address' },
      { name: 'tokenMaker', type: 'address' },
      { name: 'tokenTaker', type: 'address' },
      { name: 'amountMaker', type: 'uint64' },
      { name: 'amountTaker', type: 'uint64' },
      { name: 'deadline', type: 'uint64' },
      { name: 'termsHash', type: 'bytes32' },
      { name: 'blurSize', type: 'bool' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    name: 'fund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'cancel',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'submitProof',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'proofHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'reject',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'release',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'expire',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
  },

  // --- Events ---
  {
    name: 'PactCreated',
    type: 'event',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'kind', type: 'uint8', indexed: false },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'tokenMaker', type: 'address', indexed: false },
      { name: 'tokenTaker', type: 'address', indexed: false },
      { name: 'amountMaker', type: 'uint64', indexed: false },
      { name: 'amountTaker', type: 'uint64', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
      { name: 'termsHash', type: 'bytes32', indexed: false },
      { name: 'blurSize', type: 'bool', indexed: false },
    ],
  },
  {
    name: 'PactFunded',
    type: 'event',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'from', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint64', indexed: false },
    ],
  },
  {
    name: 'ProofSubmitted',
    type: 'event',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'from', type: 'address', indexed: true },
      { name: 'proofHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    name: 'ProofRejected',
    type: 'event',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'by', type: 'address', indexed: true },
    ],
  },
  {
    name: 'PactCleared',
    type: 'event',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'by', type: 'address', indexed: true },
    ],
  },
  {
    name: 'PactSlashed',
    type: 'event',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'by', type: 'address', indexed: true },
    ],
  },
  {
    name: 'PactExpired',
    type: 'event',
    inputs: [{ name: 'id', type: 'uint256', indexed: true }],
  },
  {
    name: 'PactCancelled',
    type: 'event',
    inputs: [{ name: 'id', type: 'uint256', indexed: true }],
  },
  {
    name: 'PayoutCredited',
    type: 'event',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Withdrawn',
    type: 'event',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;
