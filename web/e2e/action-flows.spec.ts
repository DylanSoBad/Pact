import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pact-onboarding-seen', 'true')
  })
  await page.route('**/api/pacts**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [], nextCursor: null, indexedThroughId: 0 }),
  }))
})

test('overview displays The Tape header and category filters', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'The Tape' })).toBeVisible()
  await expect(page.getByRole('button', { name: /ALL \(/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /DELIVERY \(/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /JOB \(/i })).toBeVisible()
})

test('portfolio command center renders educational overview when disconnected', async ({ page }) => {
  await page.goto('/me')
  await expect(page.getByRole('heading', { name: 'Connect Your Wallet' })).toBeVisible()
  await expect(page.getByText('Executive Command Features:')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect Wallet' })).toBeVisible()
})

test('new pact pre-flight review enforces terms and party structure', async ({ page }) => {
  await page.goto('/new')
  await expect(page.getByRole('heading', { name: /new pact/i })).toBeVisible()
  await expect(page.getByLabel('Designated Counterparty Wallet')).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue to Collateral/i })).toBeVisible()
})
