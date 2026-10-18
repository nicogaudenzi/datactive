import {test, expect} from '@playwright/test';

test('geographic role enables Maps and manual assignments persist in browser storage', async ({page}) => {
  page.on('pageerror', error => console.error('Browser page error:', error));
  await page.goto('/');

  const mapsTab = page.locator('#show-maps-workspace');
  await expect(mapsTab).toBeDisabled();

  await page.locator('#show-annotate-workspace').click();
  await page.locator('[aria-label="country geographic role"]').selectOption('country');
  await page.getByRole('button', {name: 'Save all metadata'}).click();
  await page.waitForLoadState('load');
  await expect(page.locator('#show-maps-workspace')).toBeEnabled();

  await page.locator('#show-maps-workspace').click();
  await expect(page.locator('#maps-workspace')).toBeVisible();
  await page.getByRole('combobox', {name: 'Map USA to region'}).selectOption('country-united-states');
  await page.getByRole('combobox', {name: 'Map Mexico to region'}).selectOption('country-mexico');
  await page.getByRole('combobox', {name: 'Map Canada to region'}).selectOption('country-canada');
  await page.getByRole('button', {name: 'Save region mappings'}).click();
  await expect(page.getByRole('status').filter({hasText: 'Saved 3 region assignments'})).toBeVisible();

  const saved = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('datactive-storage', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('records', 'readonly');
    const request = tx.objectStore('records').getAll();
    const records = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const record = records.find(item => item.key.startsWith('dashboard-builder.geography.v1:'));
    return record?.value ?? null;
  });
  expect(saved).not.toBeNull();
  expect(saved.mappings).toContainEqual({
    mapId: 'north-america-countries',
    column: 'country',
    values: [
      {sourceValue: 'USA', regionId: 'country-united-states'},
      {sourceValue: 'Mexico', regionId: 'country-mexico'},
      {sourceValue: 'Canada', regionId: 'country-canada'}
    ]
  });

  await page.reload();
  await expect(page.locator('#show-maps-workspace')).toBeEnabled();
  await page.locator('#show-maps-workspace').click();
  await expect(page.getByRole('combobox', {name: 'Map USA to region'})).toHaveValue('country-united-states');
});

test('exact-match suggestions assign unique country aliases and report unmatched values', async ({page}) => {
  page.on('pageerror', error => console.error('Browser page error:', error));
  await page.goto('/');
  await page.locator('#show-annotate-workspace').click();
  await page.locator('[aria-label="country geographic role"]').selectOption('country');
  await page.getByRole('button', {name: 'Save all metadata'}).click();
  await page.waitForLoadState('load');
  await page.locator('#show-maps-workspace').click();
  await expect(page.locator('#maps-workspace')).toBeVisible();
  await page.getByRole('button', {name: 'Suggest exact matches'}).click();
  await expect(page.getByRole('combobox', {name: 'Map USA to region'})).toHaveValue('country-united-states');
  await expect(page.getByRole('combobox', {name: 'Map Mexico to region'})).toHaveValue('country-mexico');
  await expect(page.getByRole('combobox', {name: 'Map Canada to region'})).toHaveValue('country-canada');
  await expect(page.locator('.geography-match-report')).toContainText('3 unique exact matches');
  await expect(page.locator('.geography-mapping-table th')).toHaveCount(3);
});
