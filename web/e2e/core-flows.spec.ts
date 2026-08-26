import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/pacts**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [], nextCursor: null, indexedThroughId: 0 }),
  }))
})

test('overview renders the indexed feed and primary navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pact overview' })).toBeVisible()
  await expect(page.getByLabel('PACT economic contracts feed')).toBeVisible()
  await expect(page.getByRole('link', { name: /new pact/i }).first()).toBeVisible()
})

test('new pact form remains usable and labelled', async ({ page }) => {
  await page.goto('/new')
  await expect(page.getByRole('heading', { name: 'New pact' })).toBeVisible()
  await expect(page.getByLabel('Designated counterparty')).toBeVisible()
  await expect(page.getByLabel('Agreement terms')).toBeVisible()
  await expect(page.getByRole('button', { name: /connect wallet|authorize & create pact/i })).toBeVisible()
})

test('mobile navbar keeps the logo and hides the PACT wordmark', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile-only responsive assertion')
  await page.goto('/')
  const homeLink = page.locator('nav a[href="/"]').first()
  await expect(homeLink.locator('img')).toBeVisible()
  await expect(homeLink.locator('span', { hasText: /^PACT$/ })).toBeHidden()
  await expect(page.getByRole('link', { name: /get test usdc/i })).toBeVisible()
})
