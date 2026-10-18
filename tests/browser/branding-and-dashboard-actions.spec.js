import { test, expect } from '@playwright/test';

test('branding, interrogation labels, and dashboard-only clear-filters action', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Datactive' })).toBeVisible();
  const authorLink = page.getByRole('link', { name: 'Nico Gaudenzi' });
  await expect(authorLink).toBeVisible();
  await expect(authorLink).toHaveAttribute('href', 'https://nicogaudenzi.com');
  await expect(page.getByRole('banner').getByText('Interrogate your data')).toBeVisible();
  await expect(page.locator('#export-layout')).toHaveText('Export Interrogation');
  await expect(page.locator('#load-layout')).toHaveText('Import Interrogation');
  await expect(page.locator('#reset-filters')).toHaveCount(0);

  const dashboardActions = page.locator('#dashboard-floating-actions');
  await expect(dashboardActions).toBeHidden();
  await page.locator('#show-dashboard-workspace').click();
  await expect(dashboardActions).toBeVisible();
  await expect(page.locator('#add-chart')).toBeVisible();
  await expect(page.locator('#clear-filters-floating')).toBeVisible();
  await expect(page.locator('#clear-filters-floating')).toHaveAttribute('aria-label', 'Clear filters');

  await page.locator('#show-annotate-workspace').click();
  await expect(dashboardActions).toBeHidden();
});
