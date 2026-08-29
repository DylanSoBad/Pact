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
  
  // Clear arbiter and counterparty to test empty validations
  await page.getByLabel('Designated Counterparty Wallet').focus()
  await page.getByLabel('Designated Counterparty Wallet').blur()
  await page.getByLabel('Designated Arbiter Wallet').fill('')
  await page.getByLabel('Designated Arbiter Wallet').blur()

  const continueBtn = page.getByRole('button', { name: /Continue to Collateral & Economics/i })
  await continueBtn.click()

  // Verify field error containers appear with actionable messages
  await expect(page.locator('#taker-error')).toBeVisible()
  await expect(page.locator('#taker-error')).toContainText(/Counterparty address is required/i)

  await expect(page.locator('#arbiter-error')).toBeVisible()
  await expect(page.locator('#arbiter-error')).toContainText(/Designated arbiter address is required/i)

  // Verify focus was moved to taker input
  const takerInput = page.getByLabel('Designated Counterparty Wallet')
  await expect(takerInput).toBeFocused()
})

test('displays custom arbiter warning and requires risk confirmation when custom arbiter is selected', async ({ page }) => {
  await page.goto('/new')

  // Switch to custom arbiter
  await page.getByRole('button', { name: /Custom Arbiter Address/i }).click()

  // Enter custom arbiter address without acknowledging risk
  await page.getByLabel('Designated Counterparty Wallet').fill('0x2222222222222222222222222222222222222222')
  await page.getByLabel('Designated Arbiter Wallet').fill('0x4444444444444444444444444444444444444444')

  // Warning banner is displayed
  await expect(page.getByText(/Custom Arbiter Risk Advisory/i)).toBeVisible()

  // Attempting to advance triggers error
  await page.getByRole('button', { name: /Continue to Collateral & Economics/i }).click()
  await expect(page.getByText(/acknowledge the Custom Arbiter risk/i)).toBeVisible()

  // Check confirmation box
  await page.getByRole('checkbox', { name: /final binding authority/i }).check()
  await page.getByRole('button', { name: /Continue to Collateral & Economics/i }).click()

  // Successfully advances to Step 2
  await expect(page.getByText('Collateral & Dispute Economics')).toBeVisible()
})

test('allows valid progression through all 4 steps to financial summary and pre-flight review', async ({ page }) => {
  await page.goto('/new')

  // Step 1: Enter valid counterparty (arbiter is pre-filled with verified default)
  await page.getByLabel('Designated Counterparty Wallet').fill('0x2222222222222222222222222222222222222222')
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

  // Step 4: Pre-Flight Review & Financial Summary
  await expect(page.getByText('Pre-Flight Review & On-Chain Commit')).toBeVisible()
  await expect(page.getByText('Dynamic Financial Summary & Outcome Scenarios')).toBeVisible()
  await expect(page.getByText('Public On-Chain Ledger Data')).toBeVisible()
  await expect(page.getByText('Written Agreement Terms (Off-Chain Content)')).toBeVisible()
  await expect(page.getByText('Milestone 1: Deliver production-ready front-end build with full test coverage.')).toBeVisible()

  // Advanced Details toggle
  await expect(page.getByRole('button', { name: /Advanced \/ On-Chain Details/i })).toBeVisible()

  // Quick edit back to step 1
  await page.getByRole('button', { name: 'Edit Parties ✎' }).click()
  await expect(page.getByText('Parties & Agreement Structure')).toBeVisible()
  // Form input remains preserved
  await expect(page.getByLabel('Designated Counterparty Wallet')).toHaveValue('0x2222222222222222222222222222222222222222')
})
