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

test('project resource links are explicit and honest', async ({ page }) => {
  await page.goto('/')

  const resources = page.getByRole('navigation', { name: 'Project resources' })
  await expect(resources.getByRole('link', { name: 'Docs ↗' })).toHaveAttribute('href', /\/tree\/main\/docs$/)
  await expect(resources.getByRole('link', { name: 'Source ↗' })).toHaveAttribute('href', 'https://github.com/DylanSoBad/Pact')
  await expect(resources.getByText('Audit: planned')).toBeVisible()
})

test('mobile shell stays inside the viewport with touch-safe navigation', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile-only responsive assertion')
  await page.goto('/')

  await expect(page.getByTestId('brand-wordmark')).toBeHidden()
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile Navigation' })
  await expect(mobileNavigation).toBeVisible()

  for (const link of await mobileNavigation.getByRole('link').all()) {
    const box = await link.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('desktop keeps the full wordmark and primary navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Desktop-only responsive assertion')
  await page.goto('/')

  await expect(page.getByTestId('brand-wordmark')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main Navigation' })).toBeVisible()
  await expect(page.getByTestId('site-navbar').getByRole('link', { name: /new pact/i })).toHaveCount(0)
  await expect(page).toHaveTitle('PACT Protocol')
})
