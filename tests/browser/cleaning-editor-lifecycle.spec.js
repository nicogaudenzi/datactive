import {test, expect} from '@playwright/test';

test('cleaning transformations remain available after asynchronous data inspection finishes', async ({page}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.getByRole('button', {name: '2. Profile / Prepare'}).click();

  await expect(page.locator('#data-inspection-host .inspection-panel')).toHaveCount(3, {timeout: 30_000});

  const cleaningPanel = page.getByRole('region', {name: 'Data cleaning transformations'});
  await expect(cleaningPanel).toBeVisible({timeout: 30_000});
  await expect(page.locator('#profile-rows tr').first()).toBeVisible({timeout: 30_000});

  // The first section starts expanded; all remaining sections start collapsed.
  await expect(page.locator('[data-panel="column-profiles"] .inspection-panel-content')).toBeVisible();
  for (const panel of ['quality-findings', 'row-preview', 'cleaning-transformations']) {
    await expect(page.locator(`[data-panel="${panel}"] .inspection-panel-content`)).toBeHidden();
  }

  // Profiling completes asynchronously and must not remove the editor. Expand it before using its controls.
  await cleaningPanel.locator('.inspection-panel-toggle').click();
  await expect(page.locator('#cleaning-type')).toBeVisible();
  await page.locator('#cleaning-type').selectOption('trim-text');
  await page.locator('#cleaning-form button[type="submit"]').click();
  await expect(page.locator('#cleaning-preview')).toContainText('affected', {timeout: 15_000});
});
