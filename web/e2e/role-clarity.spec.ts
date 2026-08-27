import { expect, test } from '@playwright/test'

const mockPactItem = {
  id: 77,
  maker: '0x1111111111111111111111111111111111111111',
  taker: '0x2222222222222222222222222222222222222222',
  arbiter: '0x3333333333333333333333333333333333333333',
  tokenMaker: '0x0000000000000000000000000000000000000001',
  tokenTaker: '0x0000000000000000000000000000000000000002',
  amountMaker: '1000000000',
  amountTaker: '500000000',
  collateralMaker: '1000000000',
  collateralTaker: '500000000',
  notionalUSDC: '1000000000',
  bondAmount: '50000000',
  arbiterFeeCap: '25000000',
  offerExpiry: String(Math.floor(Date.now() / 1000) + 86400),
  performanceDeadline: String(Math.floor(Date.now() / 1000) + 172800),
  disputeDeadline: String(Math.floor(Date.now() / 1000) + 259200),
  createdAt: '1700000000',
  updatedAt: '1700000000',
  deadline: String(Math.floor(Date.now() / 1000) + 259200),
  kind: 1, // Job
  status: 1, // Active
  blurSize: false,
  termsHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  proofHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pact-onboarding-seen', 'true')
  })
  await page.route('**/api/pacts**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [mockPactItem], nextCursor: null, indexedThroughId: 77 }),
  }))
})

test('overview displays contract ID, status, and counterparty address', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('#0077').filter({ visible: true })).toBeVisible()
  await expect(page.getByText('ACTIVE').filter({ visible: true }).first()).toBeVisible()
})

test('portfolio command center renders role indicators and educational info', async ({ page }) => {
  await page.goto('/me')
  await expect(page.getByRole('heading', { name: 'Connect Your Wallet' })).toBeVisible()
  await expect(page.getByText('Executive Command Features:')).toBeVisible()
})

test('new pact form exposes designated counterparty and arbiter fields with clear role labels', async ({ page }) => {
  await page.goto('/new')
  await expect(page.getByLabel('Designated counterparty')).toBeVisible()
  await expect(page.getByLabel('Agreement terms')).toBeVisible()
})
