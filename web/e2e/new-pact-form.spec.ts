import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pact-onboarding-seen', 'true')
  })
})

test('new pact form renders 4-step wizard stepper and step 1 by default', async ({ page }) => {
  await page.goto('/new')
  
  // Verify heading
  await expect(page.getByRole('heading', { name: 'New Pact' })).toBeVisible()
  
  // Verify 4-step nav
  await expect(page.getByRole('button', { name: /1\. Parties/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /2\. Collateral/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /3\. Terms & Deadlines/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /4\. Review & Sign/i })).toBeVisible()

  // Verify step 1 elements
  await expect(page.getByText('Parties & Agreement Structure')).toBeVisible()
  await expect(page.getByLabel('Designated Counterparty Wallet')).toBeVisible()
  await expect(page.getByLabel('Designated Arbiter Wallet')).toBeVisible()
})

test('step 1 validates required addresses before advancing to step 2', async ({ page }) => {
  await page.goto('/new')
  
  // Attempt to advance without entering counterparty or arbiter
  const continueBtn = page.getByRole('button', { name: /Continue to Collateral & Economics/i })
  await continueBtn.click()

  // Verify error messages appear
  await expect(page.getByText(/Counterparty address is required/i)).toBeVisible()
  await expect(page.getByText(/Designated arbiter address is required/i)).toBeVisible()

  // Verify focus was moved to taker input
  const takerInput = page.getByLabel('Designated Counterparty Wallet')
  await expect(takerInput).toBeFocused()
})

test('allows valid progression through all 4 steps to pre-flight review', async ({ page }) => {
  await page.goto('/new')

  // Step 1: Enter valid parties
  await page.getByLabel('Designated Counterparty Wallet').fill('0x2222222222222222222222222222222222222222')
  await page.getByLabel('Designated Arbiter Wallet').fill('0x3333333333333333333333333333333333333333')
  await page.getByRole('button', { name: /Continue to Collateral & Economics/i }).click()

  // Step 2: Enter collateral
  await expect(page.getByText('Collateral & Dispute Economics')).toBeVisible()
  await page.getByLabel('Maker Collateral to Lock').fill('100')
  await page.getByLabel('Notional Value in USDC').fill('100')
  await page.getByRole('button', { name: /Continue to Terms & Deadlines/i }).click()

  // Step 3: Enter terms and deadlines
  await expect(page.getByText('Deadlines & Agreement Terms')).toBeVisible()
  await page.getByLabel('Agreement Terms & Specifications').fill('Milestone 1: Deliver production-ready front-end build with full test coverage.')
  await page.getByRole('button', { name: /Continue to Pre-Flight Review/i }).click()

  // Step 4: Pre-Flight Review
  await expect(page.getByText('Pre-Flight Review & On-Chain Commit')).toBeVisible()
  await expect(page.getByText('Public On-Chain Ledger Data')).toBeVisible()
  await expect(page.getByText('Written Agreement Terms (Off-Chain Content)')).toBeVisible()
  await expect(page.getByText('Milestone 1: Deliver production-ready front-end build with full test coverage.')).toBeVisible()

  // Quick edit back to step 1
  await page.getByRole('button', { name: 'Edit Parties ✎' }).click()
  await expect(page.getByText('Parties & Agreement Structure')).toBeVisible()
  // Form input remains preserved
  await expect(page.getByLabel('Designated Counterparty Wallet')).toHaveValue('0x2222222222222222222222222222222222222222')
})
