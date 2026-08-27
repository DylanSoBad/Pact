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

test('overview renders the tape feed and primary navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'The Tape' })).toBeVisible()
  await expect(page.getByRole('link', { name: /create new pact/i }).first()).toBeVisible()
})

test('new pact form remains usable and labelled', async ({ page }) => {
  await page.goto('/new')
  await expect(page.getByRole('heading', { name: /new pact/i })).toBeVisible()
  await expect(page.getByLabel('Designated Counterparty Wallet')).toBeVisible()
  await expect(page.getByRole('button', { name: /1\. Parties/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue to Collateral/i })).toBeVisible()
})

test('mobile navbar keeps the logo', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile-only responsive assertion')
  await page.goto('/')
  const homeLink = page.getByLabel('PACT Protocol Homepage')
  await expect(homeLink).toBeVisible()
  await expect(page.getByRole('link', { name: /faucet|usdc/i })).toBeVisible()
})
